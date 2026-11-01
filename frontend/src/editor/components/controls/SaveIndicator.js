import { Pressable, StyleSheet, Text } from 'react-native'
import { colors } from '../../../shared/theme'
import Icon from './Icon'

const SAVE_INFO = {
  saving: '이 기기에 저장하는 중이에요.',
  saved: '모든 변경 사항을 이 기기에 자동 저장했어요.',
  error: '저장 공간이 부족해 이 기기에 저장하지 못했어요. 큰 GIF나 사진을 지우면 다시 저장돼요.',
  // 저장된 문서를 읽지 못해 기존 기록을 지키려고 저장을 멈춘 상태
  'load-error': '저장된 기록을 불러오지 못해 기존 기록을 지키려고 저장하지 않았어요. 앱을 다시 열어 주세요.',
}

/**
 * 자동 저장 상태. 편집 기록(되돌리기·다시 실행) 옆에 둔다.
 * 아이콘 옆에 늘 상태 글자(자동 저장됨 · 저장 중 · 저장 안 됨)를 쓴다. 누르면 자세한 안내.
 */
export default function SaveIndicator({ status, onInfo }) {
  const error = status === 'error' || status === 'load-error'
  // 늘 글자를 함께 보여 준다 (아이콘만으로는 무슨 버튼인지 알기 어려웠다)
  const text = error ? '저장 안 됨' : status === 'saving' ? '저장 중' : '자동 저장됨'
  return (
    <Pressable
      onPress={() => onInfo(SAVE_INFO[status])}
      hitSlop={8}
      style={[styles.save, error && styles.saveError]}
      accessibilityRole="button"
      accessibilityLabel={SAVE_INFO[status]}
    >
      <Icon
        name={error ? 'alert' : status === 'saving' ? 'saving' : 'saved'}
        size={15}
        forText={11}
        color={error ? colors.danger : colors.textMuted}
      />
      {text && <Text style={[styles.saveText, error && styles.saveTextError]}>{text}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 36,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 11,
  },
  saveError: { backgroundColor: 'rgba(224,77,111,0.1)' },
  saveText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  saveTextError: { color: colors.danger, fontWeight: '700' },
})
