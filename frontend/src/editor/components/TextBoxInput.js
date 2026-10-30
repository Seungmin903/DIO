import { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { PAGE_HEIGHT as DEFAULT_PAGE_HEIGHT, PAGE_WIDTH as DEFAULT_PAGE_WIDTH } from '../constants'
import { usePan } from '../hooks/usePan'
import { clamp } from '../utils/common'

// 끌지 않고 탭만 하면 이 폭(페이지 좌표)의 상자를 그 자리에 만든다 (GoodNotes 처럼 탭해서 바로 입력)
const TAP_BOX_WIDTH = 240
const MIN_DRAG_WIDTH = 40

export default function TextBoxInput({ zoom, onCreate, pageWidth: PAGE_WIDTH = DEFAULT_PAGE_WIDTH, pageHeight: PAGE_HEIGHT = DEFAULT_PAGE_HEIGHT }) {
  const start = useRef(null)
  const latest = useRef(null)
  const [box, setBox] = useState(null)
  const handlers = usePan({
    onStart: (event) => {
      start.current = null; latest.current = null; setBox(null)
      if (event.touches?.length > 1) return
      start.current = { x: clamp(event.locationX / zoom, 0, PAGE_WIDTH), y: clamp(event.locationY / zoom, 0, PAGE_HEIGHT) }
    },
    onMove: (dx, dy, event) => {
      const a = start.current
      if (!a) return
      if (event.touches?.length > 1) { start.current = null; latest.current = null; setBox(null); return }
      const x = clamp(a.x + dx / zoom, 0, PAGE_WIDTH), y = clamp(a.y + dy / zoom, 0, PAGE_HEIGHT)
      latest.current = { x: Math.min(a.x, x), y: Math.min(a.y, y), width: Math.abs(x - a.x), h: Math.max(38, Math.abs(y - a.y)) }
      setBox(latest.current)
    },
    onEnd: ({ cancelled }) => {
      const tapAt = start.current
      start.current = null
      const result = latest.current
      latest.current = null
      setBox(null)
      if (cancelled) return
      if (result?.width >= MIN_DRAG_WIDTH) onCreate({ ...result, w: result.width, baseWidth: result.width })
      // 손가락 탭은 몇 px 흔들리므로 아주 짧게 끈 것도 탭으로 본다
      else if (tapAt && (!result || result.width < MIN_DRAG_WIDTH / 2)) {
        const width = Math.min(TAP_BOX_WIDTH, PAGE_WIDTH)
        const x = clamp(tapAt.x, 0, PAGE_WIDTH - width)
        // autoWidth: 입력하는 동안 글자만큼 넓어지고, maxWidth(페이지 오른쪽 끝까지)에서 줄을 바꾼다
        // tap: 실제로 누른 자리(상자 x 는 페이지 안으로 당겨질 수 있다). 속지 칸 맞춤이 쓴다.
        onCreate({ x, y: tapAt.y, width, h: 38, w: width, baseWidth: width, autoWidth: true, maxWidth: Math.max(width, PAGE_WIDTH - x - 8), tap: tapAt })
      }
    },
  })
  return <View accessibilityLabel="드래그하여 텍스트 상자 만들기" style={StyleSheet.absoluteFill} {...handlers}>
    {box && <View pointerEvents="none" style={{ position: 'absolute', left: box.x * zoom, top: box.y * zoom, width: box.width * zoom, height: box.h * zoom, borderWidth: 1, borderColor: '#818AC3', backgroundColor: 'rgba(129,138,195,0.12)' }} />}
  </View>
}
