import { useEffect, useRef, useState } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { EdgeFade } from './FadeScroll'

const REVEAL_MARGIN = 16
const DRAG_PX = 4
let draggedAt = 0

/** 칩을 끌어서 넘긴 직후의 '누르기'는 무시한다. (끌기를 끝낸 자리의 칩이 눌리지 않게) */
export const justDragged = () => Date.now() - draggedAt < 150

/**
 * 가로로 넘기는 칩 줄.
 * - 터치는 손가락으로 밀고, 웹 마우스는 끌어서 넘긴다. (웹 ScrollView 는 마우스 끌기로 움직이지 않는다)
 * - reveal({ x, width }): 이 칸이 보이게 넘긴다 (예: 상단 바에서 지금 보는 다이어리 탭). 끝 그라데이션 아래에 가려지지 않게 REVEAL_MARGIN 을 남긴다.
 * - 더 넘길 수 있는 쪽 끝에 앱 공통 흰 그라데이션(EdgeFade)을 얹는다. ‹ › 버튼은 없앴다(코덱스 · 사용자 결정 2026-11-03: 터치는 쓸어 넘긴다).
 *   fadeRgb: 바탕이 흰색이 아닐 때 그 바탕색('r,g,b'). arrowLabels 는 예전 호출과 맞추려고 받기만 한다.
 */
// eslint-disable-next-line no-unused-vars
export default function ChipScroller({ style, contentContainerStyle, children, reveal = null, fadeRgb, arrowLabels }) {
  const ref = useRef(null)
  const [metrics, setMetrics] = useState({ x: 0, view: 0, content: 0 })
  const canLeft = metrics.x > 2
  const canRight = metrics.x + metrics.view < metrics.content - 2

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined
    const node = ref.current?.getScrollableNode?.()
    if (!node) return undefined
    let start = null
    const down = (event) => {
      if (event.pointerType === 'mouse' && event.button === 0) start = { x: event.clientX, left: node.scrollLeft, moved: false }
    }
    const move = (event) => {
      if (!start) return
      const dx = event.clientX - start.x
      if (Math.abs(dx) > DRAG_PX) start.moved = true
      if (start.moved) node.scrollLeft = start.left - dx
    }
    const up = () => {
      if (start?.moved) draggedAt = Date.now()
      start = null
    }
    node.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      node.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  // 보여야 할 칸이 화면 밖이면 그 칸이 보이는 만큼만 넘긴다
  useEffect(() => {
    if (!reveal || !metrics.view) return
    if (reveal.x < metrics.x) ref.current?.scrollTo({ x: Math.max(0, reveal.x - REVEAL_MARGIN), y: 0, animated: false })
    else if (reveal.x + reveal.width > metrics.x + metrics.view) ref.current?.scrollTo({ x: reveal.x + reveal.width - metrics.view + REVEAL_MARGIN, y: 0, animated: false })
  }, [reveal?.x, reveal?.width, metrics.view, metrics.content])

  return (
    <View style={[style, styles.row]}>
      <ScrollView
        ref={ref}
        style={styles.scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const x = event.nativeEvent.contentOffset.x
          setMetrics((prev) => ({ ...prev, x }))
        }}
        onLayout={(event) => {
          const view = event.nativeEvent.layout.width
          setMetrics((prev) => ({ ...prev, view }))
        }}
        onContentSizeChange={(content) => setMetrics((prev) => ({ ...prev, content }))}
      >
        {children}
      </ScrollView>
      {canLeft && <EdgeFade edge="left" rgb={fadeRgb} />}
      {canRight && <EdgeFade edge="right" rgb={fadeRgb} />}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  scroll: { flex: 1, overflow: 'hidden' },
})
