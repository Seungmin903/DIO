import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
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
 * - reveal({ x, width }): 이 칸이 보이게 넘긴다 (예: 상단 바에서 지금 보는 다이어리 탭). arrowLabels: ‹ › 의 읽어 주는 이름
 * - 넘칠 때 ‹ › 버튼을 칩 줄 바깥 양옆에 둔다. 칩은 두 버튼 사이에서만 보이고 눌린다.
 *   (예전에는 버튼이 칩 위에 떠 있어서 버튼 바깥으로 칩이 비치고 눌렸다)
 */
export default function ChipScroller({ style, contentContainerStyle, children, reveal = null, arrowLabels = ['앞 분류 보기', '다음 분류 보기'] }) {
  const ref = useRef(null)
  const [metrics, setMetrics] = useState({ x: 0, view: 0, content: 0 })
  const canLeft = metrics.x > 2
  const canRight = metrics.x + metrics.view < metrics.content - 2
  // 넘치면 양쪽 버튼을 함께 두고, 더 갈 수 없는 쪽은 흐리게 막는다. (버튼이 나타났다 사라지며 칩 줄이 흔들리지 않게)
  const overflow = canLeft || canRight

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
    if (reveal.x < metrics.x) ref.current?.scrollTo({ x: Math.max(0, reveal.x - 8), y: 0, animated: false })
    else if (reveal.x + reveal.width > metrics.x + metrics.view) ref.current?.scrollTo({ x: reveal.x + reveal.width - metrics.view + 8, y: 0, animated: false })
  }, [reveal?.x, reveal?.width, metrics.view, metrics.content])

  const scrollBy = (dx) => ref.current?.scrollTo({ x: Math.max(0, metrics.x + dx), animated: true })

  return (
    <View style={[style, styles.row]}>
      {overflow && <EdgeButton side="left" label={arrowLabels[0]} disabled={!canLeft} onPress={() => scrollBy(-STEP_PX)} />}
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
      {overflow && <EdgeButton side="right" label={arrowLabels[1]} disabled={!canRight} onPress={() => scrollBy(STEP_PX)} />}
    </View>
  )
}

function EdgeButton({ side, label, disabled, onPress }) {
  const left = side === 'left'
  return (
    <View style={[styles.edge, left ? styles.edgeLeft : styles.edgeRight]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={6}
        style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed, disabled && styles.arrowDisabled]}
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
      >
        <Icon name={left ? 'chevronLeft' : 'chevronRight'} size={16} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // 칩은 이 안에서만 보이고 눌린다
  scroll: { flex: 1, overflow: 'hidden' },
  edge: { justifyContent: 'center' },
  edgeLeft: { paddingRight: 4 },
  edgeRight: { paddingLeft: 4 },
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
  arrowDisabled: { opacity: 0.35 },
})
