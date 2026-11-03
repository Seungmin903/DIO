import { useMemo, useRef } from 'react'
import { Animated, PanResponder, StyleSheet, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'

// 폰 세로의 페이지 목록(왼쪽) · 레이어(오른쪽) 패널. 모서리 버튼으로 열면 바로 나타나고(움직임 없음, 사용자 결정 2026-11-03) 버튼은 사라진다.
// 닫기: 안쪽 가장자리의 손잡이나 맨 위 제목 줄을 가장자리 쪽으로 끌기(손가락을 따라가고 놓으면 닫힘) · 뒤로가기. 바깥을 눌러 닫지는 않는다.
const HEADER_ZONE = 56 // 패널 맨 위에서 이 높이까지가 끌어 닫는 제목 줄

export default function PhoneSidePanel({ side, top, onClose, onWidth, children }) {
  const left = side === 'left'
  const translate = useRef(new Animated.Value(0)).current
  const box = useRef({ width: 0, top: 0 })
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const closing = useRef(false)

  const dismiss = () => {
    if (closing.current) return
    closing.current = true
    onCloseRef.current?.()
    setTimeout(() => { closing.current = false }, 400) // 닫기가 취소돼 패널이 남아 있어도 다시 끌어 닫을 수 있게
  }
  const settle = () => translate.setValue(0)

  // zone: 'header' 면 시작 점이 패널 맨 위 제목 줄 안일 때만, 'handle' 이면 어디서든 끌기를 받는다
  const makePan = (zone) => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => {
      const toward = left ? g.dx < -8 : g.dx > 8
      if (!toward || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return false
      return zone === 'handle' || (g.y0 >= box.current.top && g.y0 - box.current.top <= HEADER_ZONE)
    },
    onPanResponderMove: (_, g) => translate.setValue(left ? Math.min(0, g.dx) : Math.max(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > box.current.width * 0.3 || Math.abs(g.vx) > 0.8) dismiss()
      else settle()
    },
    onPanResponderTerminate: settle,
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const headerPan = useMemo(() => makePan('header'), [left])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePan = useMemo(() => makePan('handle'), [left])

  return (
    <Animated.View
      ref={ref}
      style={[styles.panel, left ? styles.left : styles.right, { top, transform: [{ translateX: translate }] }]}
      pointerEvents="box-none"
      onLayout={(event) => {
        box.current.width = event.nativeEvent.layout.width
        ref.current?.measureInWindow?.((x, y) => { box.current.top = y })
        onWidth?.(event.nativeEvent.layout.width)
      }}
      {...headerPan.panHandlers}
    >
      {children}
      <View style={[styles.handleArea, left ? styles.handleRight : styles.handleLeft]} {...handlePan.panHandlers}>
        <View style={styles.handle} />
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', bottom: 8, zIndex: 20, flexDirection: 'row', ...shadow.float },
  left: { left: 8 },
  right: { right: 8, maxWidth: '86%' },
  // 안쪽(화면 가운데 쪽) 가장자리 가운데의 손잡이. 보이는 막대는 4 × 36, 터치 영역은 22 × 72
  handleArea: { position: 'absolute', top: '50%', marginTop: -36, width: 22, height: 72, zIndex: 30, elevation: 30, alignItems: 'center', justifyContent: 'center' },
  handleRight: { right: 0 },
  handleLeft: { left: 0 },
  handle: { width: 4, height: 36, borderRadius: 2, backgroundColor: colors.border },
})
