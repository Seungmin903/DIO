import { memo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, shadow } from '../../shared/theme'
import { deskClockLabel, deskPhaseAt } from '../utils/deskLight'
import { setDeskDecorOn, setDeskHour, useDeskDecorOn, useDeskHourOverride } from '../utils/deskTimeStore'

// 임시: 게스트 모드에서만 책상 햇빛 시각을 끌어서 바꿔 보는 슬라이더 (시안 확인용). 정식 기능이 아니라 나중에 뺀다.
// 시각은 앱 밖 저장소(deskTimeStore)에 있어, 끌 때 앱 전체가 아니라 책상 바탕과 이 슬라이더만 다시 그린다.
const STEP = 0.25 // 15분
const MAX = 24 - STEP

function DeskTimeSlider({ compact = false }) {
  const fixed = useDeskHourOverride()
  const decorOn = useDeskDecorOn()
  const now = new Date()
  const shown = fixed ?? now.getHours() + now.getMinutes() / 60
  const [width, setWidth] = useState(0)
  const trackRef = useRef(null)
  const origin = useRef({ left: 0, width: 0 })
  // 손가락의 화면 x(pageX)를 트랙의 화면 x(measure)에서 빼서 위치를 구한다. locationX 는 누른 요소(손잡이 등)마다 기준이 달라 튄다.
  const pick = pageX => {
    const { left, width: w } = origin.current
    setDeskHour(Math.max(0, Math.min(MAX, Math.round(((pageX - left) / Math.max(1, w)) * 24 / STEP) * STEP)))
  }
  const begin = event => {
    const pageX = event.nativeEvent.pageX
    trackRef.current?.measure((x, y, w, h, left) => { origin.current = { left, width: w }; pick(pageX) })
  }
  return <View style={[styles.box, compact ? styles.boxCompact : styles.boxWide]}>
    <Text style={styles.label} numberOfLines={1}>{`${deskClockLabel(shown)} · ${deskPhaseAt(shown)}`}</Text>
    <View ref={trackRef} collapsable={false} accessibilityRole="adjustable" accessibilityLabel="책상 햇빛 시각" accessibilityValue={{ min: 0, max: 24, now: Math.floor(shown), text: deskClockLabel(shown) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => setDeskHour((shown + (e.nativeEvent.actionName === 'increment' ? 1 : 23)) % 24)}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
      onResponderGrant={begin}
      onResponderMove={e => pick(e.nativeEvent.pageX)}
      style={styles.track}>
      <View pointerEvents="none" style={styles.rail} />
      <View pointerEvents="none" style={[styles.thumb, { left: (shown / 24) * Math.max(0, width) - 11 }]} />
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="지금 시각으로" onPress={() => setDeskHour(null)} style={({ pressed }) => [styles.now, fixed == null && styles.nowOn, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.nowText, fixed == null && styles.nowTextOn]}>지금</Text>
    </Pressable>
    <Pressable accessibilityRole="switch" accessibilityLabel="책상 소품" accessibilityState={{ checked: decorOn }} onPress={() => setDeskDecorOn(!decorOn)} style={({ pressed }) => [styles.now, decorOn && styles.nowOn, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.nowText, decorOn && styles.nowTextOn]}>소품</Text>
    </Pressable>
  </View>
}

export default memo(DeskTimeSlider)

const styles = StyleSheet.create({
  box: { position: 'absolute', zIndex: 5, left: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.92)', ...shadow.card },
  boxWide: { top: 34, width: 400, marginLeft: -200 }, // 태블릿: 제목과 보기 전환 사이
  boxCompact: { top: 186, width: 340, marginLeft: -170 }, // 폰: 검색 줄과 표지 사이
  label: { width: 118, color: colors.text, fontSize: 12, fontWeight: '800' },
  track: { flex: 1, height: 32, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceMuted },
  thumb: { position: 'absolute', top: 5, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.primaryStrong },
  now: { height: 30, paddingHorizontal: 10, justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  nowOn: { backgroundColor: colors.primaryStrong },
  nowText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  nowTextOn: { color: '#FFFFFF' },
})
