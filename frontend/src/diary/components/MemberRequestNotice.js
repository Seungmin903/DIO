import { Text, View } from 'react-native'
import { styles as s } from '../styles'
import DioButton from '../../shared/DioButton'
import AuthenticationRecovery from '../../auth/AuthenticationRecovery'
/**
 * 회원 보관함 맨 위의 생성 요청 안내(S15P31F106-723 문구 · 버튼 정리). 사용자가 아는 말로만 적는다(요청 · 키 · 응답 같은 내부 용어 없이).
 * - 확인 못 한 생성(pending): "다이어리가 만들어졌는지 확인하지 못했어요." + `생성 결과 확인`(onRetry — 같은 생성 키로 다시 물어 두 번 만들지 않는다)
 * - 확인 기간이 지난 생성(pending.expired): 결과는 보관함 목록으로만 알 수 있다 → `보관함 목록 확인`(onReload)과 `이전 요청 정리`(onArchiveExpired, 목록을 다시 확인한 뒤 기록으로 보관)를 따로 둔다. 정리는 다이어리를 지우지 않는다
 * - 오류만(error): 오류 문구 + `보관함 다시 불러오기`(onReload). 생성 안내와 함께 온 오류는 둘째 줄에 덧붙인다
 */
export default function MemberRequestNotice({ pending, error, busy, refreshing, onRetry, onReload, onArchiveExpired }) {
  // 알릴 것(확인 못 한 생성 요청 · 오류)이 없으면 칸을 남기지 않는다. 목록을 다시 받는 중(refreshing)만으로는 줄을 띄우지 않는다(목록을 밀어 깜빡여 보였다).
  if (!pending && !error) return null
  const waiting = busy || refreshing
  const message = pending?.expired ? '다이어리가 만들어졌는지 확인하지 못했어요. 확인할 수 있는 기간이 지나 보관함 목록으로만 알 수 있어요.'
    : pending ? '다이어리가 만들어졌는지 확인하지 못했어요.' : error.message
  return <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
    <Text style={s.cardMeta} accessibilityRole="alert">{message}</Text>
    {pending && error && <Text style={s.cardMeta}>{error.message}</Text>}
    <AuthenticationRecovery error={error} />
    {pending && !pending.expired
      ? <DioButton label={waiting ? '확인 중…' : '생성 결과 확인'} disabled={waiting} onPress={onRetry} style={s.noticeAction} />
      : <DioButton label={waiting ? '확인 중…' : pending ? '보관함 목록 확인' : '보관함 다시 불러오기'} disabled={waiting} onPress={onReload} style={s.noticeAction} />}
    {pending?.expired && <DioButton label="이전 요청 정리" disabled={waiting} onPress={onArchiveExpired} style={s.noticeAction} />}
  </View>
}
