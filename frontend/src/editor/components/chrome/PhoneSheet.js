import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Keyboard, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native'
import { colors } from '../../../shared/theme'

// 폰 세로의 도구 옵션 창: 아래에서 올라오는 하단 시트. 윗모서리만 둥글고 아래는 평평하게 화면 폭을 채운다.
// 손잡이 줄과 제목 줄(ToolPanelHeader)을 아래로 끌면 닫힌다. 안의 목록은 그대로 스크롤된다.
// 폰은 말풍선 효과 금지의 예외로 200ms 올라온다(사용자 결정 2026-11-03). 시스템 '움직임 줄이기'가 켜져 있으면 바로 뜬다.
export const SHEET_HEIGHT_RATIO = 0.58
const OPEN_MS = 200
const CLOSE_MS = 160
const RADIUS = 28

// bleed: 작업창 바깥 여백(8)만큼 좌우 · 아래로 넓혀 화면 끝까지 쓴다
export default function PhoneSheet({ children, onClose, fixedHeight = false, insideHandlers, onHeight, bleed = 0 }) {
  const window = useWindowDimensions()
  // 키보드가 뜨면 시트를 키보드 위로 올리고 높이도 남은 자리에 맞춘다(안드로이드 전체 화면은 키보드가 창을 줄이지 않아 입력칸이 가렸다)
  const [keyboard, setKeyboard] = useState(0)
  const [layoutHeight, setLayoutHeight] = useState(0)
  // 되돌리기 · 맞춤 막대가 시트(키보드 위로 올라간 만큼 포함) 위에 놓이게 바닥에서 시트 윗선까지의 높이를 알린다
  useEffect(() => { if (layoutHeight) onHeight?.(layoutHeight + keyboard) }, [layoutHeight, keyboard]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => setKeyboard(event.endCoordinates?.height ?? 0))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0))
    return () => { show.remove(); hide.remove() }
  }, [])
  const full = Math.max(200, Math.min(Math.round(window.height * SHEET_HEIGHT_RATIO), window.height - keyboard - 250))
  const translate = useRef(new Animated.Value(full)).current
  const [reduceMotion, setReduceMotion] = useState(false)
  const closing = useRef(false)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => () => onHeight?.(0), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => { if (alive) setReduceMotion(Boolean(value)) }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (reduceMotion) { translate.setValue(0); return }
    Animated.timing(translate, { toValue: 0, duration: OPEN_MS, useNativeDriver: true }).start()
  }, [reduceMotion, translate])

  const dismiss = () => {
    if (closing.current) return
    closing.current = true
    const settleBack = () => setTimeout(() => {
      // 부모가 닫기를 받아들이지 않아 시트가 그대로 남아 있으면(확인 창 뒤 취소 등) 제자리로 돌려 다시 닫을 수 있게 한다
      closing.current = false
      if (mounted.current) Animated.timing(translate, { toValue: 0, duration: OPEN_MS, useNativeDriver: true }).start()
    }, 400)
    if (reduceMotion) { onCloseRef.current?.(); settleBack(); return }
    Animated.timing(translate, { toValue: full, duration: CLOSE_MS, useNativeDriver: true }).start(() => { onCloseRef.current?.(); settleBack() })
  }

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) translate.setValue(g.dy) },
    onPanResponderRelease: (_, g) => {
      if (g.dy > full * 0.25 || g.vy > 0.8) dismiss()
      else Animated.spring(translate, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
    },
    onPanResponderTerminate: () => Animated.spring(translate, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [full, reduceMotion])

  return (
      <Animated.View
        style={[styles.sheet, { bottom: -bleed + keyboard }, bleed > 0 && { left: -bleed, right: -bleed, borderLeftWidth: 0, borderRightWidth: 0 }, fixedHeight ? { height: full } : { maxHeight: full }, { transform: [{ translateY: translate }] }]}
        onLayout={(event) => setLayoutHeight(event.nativeEvent.layout.height)}
        {...insideHandlers}
      >
        <View style={styles.handleArea} {...pan.panHandlers}><View style={styles.handle} /></View>
        {children({ width: window.width, dragHandlers: pan.panHandlers })}
      </Animated.View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  handleArea: { height: 20, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
})
