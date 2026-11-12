import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, DISABLED_OPACITY } from './theme'

// 동작 있는 토스트(코덱스 2026-11-02): 끝난 작업의 보조 저장처럼 지금 화면에서 다시 할 수 있는 실패를 알린다.
// 편집기 토스트와 같은 남색 알약에 짧은 동사 하나('다시 시도')를 버터색 글자로 붙인다. 나타날 때 움직임 · 눌림 효과는 없다.
export const ACTION_TOAST_MS = 6000

/** bottom: 화면 아래에서 띄울 거리. actionLabel 이 없으면 동작 없는 완료 알림이다. */
export default function ActionToast({ message, actionLabel, onAction, busy = false, bottom, compact = false }) {
  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom }]}>
      <View style={[styles.pill, { maxWidth: compact ? 284 : 420 }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Text style={styles.message} numberOfLines={2} ellipsizeMode="tail">{message}</Text>
        {actionLabel ? (
          // 알약은 38 그대로 두고, 위아래 3씩 터치 영역을 넓혀 44를 맞춘다
          <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onAction}
            hitSlop={{ top: 3, bottom: 3, left: 6, right: 6 }} style={[styles.action, busy && styles.busy]}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 50 },
  pill: { flexDirection: 'row', alignItems: 'center', minHeight: 38, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.text },
  message: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.surface },
  // 알약 위아래 안쪽 여백(10)까지 버튼이 차지해 높이 38 전체가 눌린다
  action: { marginLeft: 12, marginVertical: -10, paddingVertical: 10, justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '700', color: colors.butter },
  busy: { opacity: DISABLED_OPACITY },
})
