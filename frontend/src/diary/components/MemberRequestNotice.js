import { Pressable, Text, View } from 'react-native'
import { styles as s } from '../styles'
export default function MemberRequestNotice({ pending, error, busy, refreshing, onRetry, onReload }) {
  return <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
    {(pending || error || refreshing) && <Text style={s.cardMeta}>{pending ? '확인하지 못한 이전 생성 요청이 있어요. 같은 요청으로 결과를 확인해 주세요.' : refreshing ? '회원 다이어리를 불러오고 있어요.' : error.message}</Text>}
    <Pressable accessibilityRole="button" disabled={busy || refreshing} accessibilityState={{ disabled: busy || refreshing }}
      onPress={pending ? onRetry : onReload} style={s.secondary}>
      <Text>{busy || refreshing ? '확인 중…' : pending ? '이전 생성 확인' : error ? '회원 목록 다시 확인' : '회원 목록 새로고침'}</Text>
    </Pressable>
  </View>
}
