import { useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import ConfirmDialog from './ConfirmDialog'

export default function PageBulkDelete({ pages, ids, onDelete, onReset, onDone }) {
  const [pending, setPending] = useState(null)
  const confirmed = useRef(false)
  const selected = pages.filter(page => ids.includes(page.id)).map(page => page.id)
  const blocked = !selected.length || selected.length >= pages.length
  return <View style={{ gap: 4 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked}
      style={{ minHeight: 44, justifyContent: 'center', opacity: blocked ? 0.4 : 1 }}
      onPress={() => { confirmed.current = false; setPending(selected) }}>
      <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>선택한 {selected.length}개 삭제</Text>
    </Pressable>
    {selected.length >= pages.length && <Text style={{ color: colors.textMuted, fontSize: 12 }}>페이지는 최소 한 장 남겨 주세요.</Text>}
    {onReset && <Pressable accessibilityRole="button" accessibilityLabel="다이어리 초기화"
      style={{ minHeight: 44, justifyContent: 'center' }}
      onPress={() => { confirmed.current = false; setPending('reset') }}>
      <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>다이어리 초기화</Text>
    </Pressable>}
    <ConfirmDialog open={Boolean(pending)} title={pending === 'reset' ? '다이어리를 초기화할까요?' : `${pending?.length ?? 0}개 페이지를 삭제할까요?`}
      confirmLabel={pending === 'reset' ? '초기화' : '삭제'}
      message={pending === 'reset' ? `필터와 선택에 관계없이 모든 ${pages.length}개 페이지와 내용을 지우고 빈 페이지 한 장을 남겨요. 제목과 표지는 유지돼요. 되돌리기는 현재 편집 중에만 가능해요.` : '선택한 페이지의 내용이 함께 삭제돼요. 되돌리기로 복구할 수 있어요.'}
      onCancel={() => setPending(null)} onConfirm={() => {
        if (!pending || confirmed.current) return
        confirmed.current = true
        if (pending === 'reset') {
          onReset?.()
          setPending(null)
          onDone()
          return
        }
        const valid = pages.filter(page => pending.includes(page.id)).map(page => page.id)
        if (valid.length && valid.length < pages.length) onDelete(valid)
        setPending(null)
        onDone()
      }} />
  </View>
}
