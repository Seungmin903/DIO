import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'

// 넘겨 봐야 하는 줄 · 목록의 더 있는 쪽 끝에 얹는 옅은 흰 그라데이션(앱 공통). 터치는 통과시킨다.
// 라이브러리 없이 backgroundImage linear-gradient 한 장(react-native-svg 는 노드 테스트가 읽지 못한다). 끝에 가까울수록 진하다.
export const FADE_STEPS = 8 // (예전 띠 수, 지금은 그라데이션 한 장이라 쓰지 않는다)
export const FADE_SIZE = 28
export const FADE_MAX = 0.75
// 앱 바탕(colors.surfaceSoft #F8F7FD)과 같은 색의 'r,g,b' — 바탕이 흰색이 아닌 화면에 넘기는 fadeRgb
export const CANVAS_FADE_RGB = [1, 3, 5].map(i => parseInt(colors.surfaceSoft.slice(i, i + 2), 16)).join(',')

export function EdgeFade({ edge, size = FADE_SIZE, rgb = '255,255,255' }) {
  const horizontal = edge === 'left' || edge === 'right'
  // 띠를 쌓지 않고 진짜 그라데이션 한 장으로 그린다(backgroundImage — 편집기 탭 머리도 같은 방식).
  // 예전엔 옅기가 다른 얇은 띠를 겹쳐, 띠 사이 경계가 진한 버튼 위에서 실선처럼 보였다(2026-11-08)
  return (
    <View pointerEvents="none" style={[styles.fade, horizontal ? { top: 0, bottom: 0, width: size } : { left: 0, right: 0, height: size }, { [edge]: 0 },
      { backgroundImage: `linear-gradient(to ${edge}, rgba(${rgb},0), rgba(${rgb},${FADE_MAX}))` }]} />
  )
}

/**
 * ScrollView 와 같게 쓰되 더 넘길 수 있는 쪽 끝에 흰 그라데이션을 얹는다.
 * style 은 바깥 칸(배치)에, 나머지는 ScrollView 에 간다. horizontal 이면 왼 · 오른쪽, 아니면 위 · 아래 끝.
 * fadeRgb: 바탕이 흰색이 아닐 때 그 바탕색('r,g,b')
 */
export default function FadeScroll({ horizontal = false, style, fadeRgb, onScroll, onLayout, onContentSizeChange, children, scrollRef, ...rest }) {
  const [m, setM] = useState({ pos: 0, view: 0, content: 0 })
  const hasStart = m.pos > 4
  const hasEnd = m.content > m.view + 4 && m.pos + m.view < m.content - 4
  return (
    <View style={style}>
      <ScrollView
        ref={scrollRef}
        horizontal={horizontal}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        {...rest}
        onLayout={(event) => { const view = horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height; setM((prev) => ({ ...prev, view })); onLayout?.(event) }}
        onContentSizeChange={(w, h) => { setM((prev) => ({ ...prev, content: horizontal ? w : h })); onContentSizeChange?.(w, h) }}
        onScroll={(event) => { const pos = horizontal ? event.nativeEvent.contentOffset.x : event.nativeEvent.contentOffset.y; setM((prev) => (Math.abs(prev.pos - pos) < 1 ? prev : { ...prev, pos })); onScroll?.(event) }}
      >
        {children}
      </ScrollView>
      {hasStart && <EdgeFade edge={horizontal ? 'left' : 'top'} rgb={fadeRgb} />}
      {hasEnd && <EdgeFade edge={horizontal ? 'right' : 'bottom'} rgb={fadeRgb} />}
    </View>
  )
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', overflow: 'hidden' },
})
