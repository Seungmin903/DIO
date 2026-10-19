import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { colors } from '../../theme'
import Icon from './Icon'

const SAVE_INFO = {
  saving: '이 기기에 저장하는 중이에요.',
  saved: '모든 변경 사항을 이 기기에 자동 저장했어요.',
  error: '저장 공간이 부족해 이 기기에 저장하지 못했어요. 큰 GIF나 사진을 지우면 다시 저장돼요.',
}
const SAVED_TEXT_MS = 2000

/**
 * 자동 저장 상태. 편집 기록(되돌리기·다시 실행) 옆에 둔다.
 * 평소에는 작은 아이콘만 두고(누르면 안내), 저장 중과 실패일 때만 글자를 보여 준다.
 * 저장이 끝난 직후에는 '저장됨'을 잠깐 보여 주고 아이콘만 남긴다.
 */
export default function SaveIndicator({ status, onInfo }) {
  const [justSaved, setJustSaved] = useState(false)
  const previous = useRef(status)
  useEffect(() => {
    const wasSaving = previous.current === 'saving'
    previous.current = status
    if (!(wasSaving && status === 'saved')) return undefined
    setJustSaved(true)
    const timer = setTimeout(() => setJustSaved(false), SAVED_TEXT_MS)
    return () => clearTimeout(timer)
  }, [status])

  const error = status === 'error'
  const text = error ? '저장 안 됨' : status === 'saving' ? '저장 중' : justSaved ? '저장됨' : null
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
        strokeWidth={2}
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
  saveError: { backgroundColor: 'rgba(229,72,77,0.1)' },
  saveText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  saveTextError: { color: colors.danger, fontWeight: '800' },
})
