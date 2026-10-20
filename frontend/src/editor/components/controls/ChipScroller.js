import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import Icon from './Icon'

const STEP_PX = 160
const DRAG_PX = 4
let draggedAt = 0

/** 칩을 끌어서 넘긴 직후의 '누르기'는 무시한다. (끌기를 끝낸 자리의 칩이 눌리지 않게) */
export const justDragged = () => Date.now() - draggedAt < 150

/**
 * 가로로 넘기는 칩 줄.
 * - 터치는 손가락으로 밀고, 웹 마우스는 끌어서 넘긴다. (웹 ScrollView 는 마우스 끌기로 움직이지 않는다)
 * - 넘칠 때 양 끝을 흐리게 하고 ‹ › 버튼을 둬서 더 있다는 걸 알려 준다.
 */
export default function ChipScroller({ style, contentContainerStyle, background = '#FFFFFF', children }) {
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

  const scrollBy = (dx) => ref.current?.scrollTo({ x: Math.max(0, metrics.x + dx), animated: true })

  return (
    <View style={style}>
      <ScrollView
        ref={ref}
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
      {canLeft && <EdgeButton side="left" background={background} onPress={() => scrollBy(-STEP_PX)} />}
      {canRight && <EdgeButton side="right" background={background} onPress={() => scrollBy(STEP_PX)} />}
    </View>
  )
}

function EdgeButton({ side, background, onPress }) {
  const left = side === 'left'
  return (
    <View style={[styles.edge, left ? styles.edgeLeft : styles.edgeRight]} pointerEvents="box-none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <LinearGradient id={`chip-fade-${side}`} x1={left ? '1' : '0'} y1="0" x2={left ? '0' : '1'} y2="0">
            <Stop offset="0" stopColor={background} stopOpacity="0" />
            <Stop offset="0.55" stopColor={background} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#chip-fade-${side})`} />
      </Svg>
      <Pressable
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        accessibilityLabel={left ? '앞 분류 보기' : '다음 분류 보기'}
      >
        <Icon name={left ? 'chevronLeft' : 'chevronRight'} size={16} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', top: 0, bottom: 0, width: 64, justifyContent: 'center' },
  edgeLeft: { left: 0, alignItems: 'flex-start', paddingLeft: 6 },
  edgeRight: { right: 0, alignItems: 'flex-end', paddingRight: 6 },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  arrowPressed: { backgroundColor: colors.primarySoft },
})
