import { Pressable, Text, View } from 'react-native'
import { styles as s } from '../styles'
export default function MemberRequestNotice({ pending, error, busy, refreshing, onRetry, onReload, onArchiveExpired }) {
  return <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
    {(pending || error || refreshing) && <Text style={s.cardMeta}>{pending?.expired ? '생성 응답 보관 기간이 지났어요. 보관함을 확인한 뒤 이전 요청을 정리해 주세요.' : pending ? '확인하지 못한 이전 생성 요청이 있어요. 같은 요청으로 결과를 확인해 주세요.' : refreshing ? '회원 다이어리를 불러오고 있어요.' : error.message}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || refreshing} accessibilityState={{ disabled: busy || refreshing }}
      onPress={pending && !pending.expired ? onRetry : onReload} style={s.secondary}>
      <Text>{busy || refreshing ? '확인 중…' : pending && !pending.expired ? '이전 생성 확인' : error ? '회원 목록 다시 확인' : '회원 목록 새로고침'}</Text>
    </Pressable>
    {pending?.expired && <Pressable accessibilityRole="button" disabled={busy || refreshing} accessibilityState={{disabled:busy || refreshing}}
      onPress={onArchiveExpired} style={s.secondary}><Text>목록 확인 후 요청 정리</Text></Pressable>}
  </View>
}
