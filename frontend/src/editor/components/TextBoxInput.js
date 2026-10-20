import { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../constants'
import { usePan } from '../hooks/usePan'
import { clamp } from '../utils/common'

export default function TextBoxInput({ zoom, onCreate }) {
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
      start.current = null
      const result = latest.current
      latest.current = null
      if (!cancelled && result?.width >= 40) onCreate({ ...result, w: result.width, baseWidth: result.width })
      setBox(null)
    },
  })
  return <View accessibilityLabel="드래그하여 텍스트 상자 만들기" style={StyleSheet.absoluteFill} {...handlers}>
    {box && <View pointerEvents="none" style={{ position: 'absolute', left: box.x * zoom, top: box.y * zoom, width: box.width * zoom, height: box.h * zoom, borderWidth: 1, borderColor: '#6F9FC6', backgroundColor: 'rgba(146,204,250,0.12)' }} />}
  </View>
}
