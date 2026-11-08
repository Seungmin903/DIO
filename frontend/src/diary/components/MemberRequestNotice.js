import { Text, View } from 'react-native'
import { styles as s } from '../styles'
import DioButton from '../../shared/DioButton'
import AuthenticationRecovery from '../../auth/AuthenticationRecovery'
export default function MemberRequestNotice({ pending, error, busy, refreshing, onRetry, onReload, onArchiveExpired }) {
  // 알릴 것(확인 못 한 생성 요청 · 오류)이 없으면 칸을 남기지 않는다. 목록을 다시 받는 중(refreshing)만으로는 줄을 띄우지 않는다(목록을 밀어 깜빡여 보였다).
  if (!pending && !error) return null
  const waiting = busy || refreshing
  return <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
    <Text style={s.cardMeta}>{pending?.expired ? '생성 응답 보관 기간이 지났어요. 보관함을 확인한 뒤 이전 요청을 정리해 주세요.' : pending ? '확인하지 못한 이전 생성 요청이 있어요. 같은 요청으로 결과를 확인해 주세요.' : error.message}</Text>
    <AuthenticationRecovery error={error} />
    <DioButton label={waiting ? '확인 중…' : pending && !pending.expired ? '이전 생성 확인' : '회원 목록 다시 확인'} disabled={waiting}
      onPress={pending && !pending.expired ? onRetry : onReload} style={s.noticeAction} />
    {pending?.expired && <DioButton label="목록 확인 후 요청 정리" disabled={waiting} onPress={onArchiveExpired} style={s.noticeAction} />}
  </View>
}
