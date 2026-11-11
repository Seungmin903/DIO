import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native'
import { DISABLED_OPACITY, colors } from '../../../shared/theme'
import { subscribeTextFontProgress, textFontProgress } from '../../utils/text'
import Icon from './Icon'

/**
 * 글꼴 고르기 목록의 받기 상태 표시(실기 피드백 2026-11-11).
 * - 받기 전 · 받지 못함: 연한 이름 + 받기 아이콘(⤓). 받지 못한 글꼴도 ↻ 대신 같은 받기 아이콘(↻ 는 재생 · 새로고침으로 읽혔다)
 * - 받는 중: 연한 이름 + 진행 막대(받은 만큼 채움). 진행률을 모르면(웹) 같은 자리에서 오가는 막대
 * - 받은 뒤: 보통 글자색, 막대는 저절로 사라진다(표시 없음)
 * id 를 주면 받는 중 진행률을 읽는다. 다시 그리기는 목록이 글꼴 상태를 구독해서 한다(subscribeTextFonts)
 */
export default function FontStatusMark({ status, id, size = 16 }) {
  if (status === 'downloading') return <ProgressBar id={id} width={size * 2.5} />

  if (status === 'download' || status === 'error') return <Icon name="download" size={size} color={colors.textMuted} />
  return null
}

/**
 * 받은 만큼(0~1) 채운 막대. 진행률을 모르면 짧은 막대가 왼쪽에서 오른쪽으로 계속 오간다.
 * 진행은 이 막대만 구독한다(subscribeTextFontProgress) — 목록 · 캔버스는 진행마다 다시 그리지 않는다
 */
function ProgressBar({ id, width }) {
  const read = () => (id ? textFontProgress(id) : null)
  const progress = useSyncExternalStore(subscribeTextFontProgress, read, read)
  const known = progress != null
  const percent = known ? Math.round(progress * 100) : null
  return <View style={[styles.track, { width }]} accessibilityRole="progressbar" accessibilityLabel={known ? `받는 중 ${percent}%` : '받는 중'}
    accessibilityValue={known ? { min: 0, max: 100, now: percent } : undefined}>
    {known ? <View style={[styles.fill, { width: `${Math.max(4, percent)}%` }]} /> : <Sweep width={width} />}
  </View>
}

function Sweep({ width }) {
  const move = useRef(new Animated.Value(0)).current
  useEffect(() => {
    // 웹(react-native-web)에는 네이티브 애니메이션 모듈이 없어 true 면 경고를 내고 JS 로 돈다. 웹은 진행률을 몰라 늘 이 막대를 쓴다
    const loop = Animated.loop(Animated.timing(move, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }))
    loop.start()
    return () => loop.stop()
  }, [move])
  const segment = width * 0.4
  return <Animated.View style={[styles.fill, { position: 'absolute', width: segment, transform: [{ translateX: move.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] }) }] }]} />
}

/** 받기 전 · 받는 중 글꼴은 이름을 연하게 보여 준다 */
export const fontNeedsDownload = status => status === 'download' || status === 'downloading' || status === 'error'

/** 받기 전 · 받는 중 글꼴 이름 색(누를 수 없는 상태와 같은 옅기). 받은 뒤에는 보통 글자색(colors.text) */
export const FONT_PENDING_TEXT = { color: colors.text, opacity: DISABLED_OPACITY }

/** 화면 읽기에 덧붙일 상태 글 */
export const fontStatusA11y = status => ({ download: ', 받지 않은 글꼴, 눌러서 받기', downloading: ', 받는 중', error: ', 받지 못함, 눌러서 다시 받기' })[status] ?? ''

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border },
  fill: { height: '100%', borderRadius: 2, backgroundColor: colors.primaryStrong },
})
