import { Text, View } from 'react-native'
import { styles as s } from '../styles'
import DioButton from '../../shared/DioButton'
import { authenticationErrorMessage } from '../../auth/sessionExpiry.js'
import AuthenticationRecovery, { needsAuthenticationRecovery } from '../../auth/AuthenticationRecovery'

// 회원 '내 다이어리' 목록 위 알림 칸. 목록이 이미 보이면 다시 불러오는 동안(휴지통 이동 · 즐겨찾기 · 다음 페이지 등) 줄을 띄우지 않는다:
// 줄이 생겼다 사라지며 목록을 밀어 깜빡여 보였다. 남은 페이지는 App 이 뒤에서 이어 받으므로 '다음 다이어리 불러오기' 버튼도 두지 않는다.
export default function MemberLibraryNotice({ library, pending, bulk, onRetry, centered = false }) {
  const loading = pending || library.loading
  const bulkAuthError = bulk?.busy ? null : (bulk?.failed || []).find(item => item.error?.status === 401)?.error ?? null
  // 처음 불러오는 동안은 목록 자리 가운데 스피너(LibraryScreen loading)로 보이고, 여기서는 줄을 띄우지 않는다(지라 590)
  const showError = !pending && library.error
  if (!showError && !bulkAuthError) return null
  return <View style={[s.memberLibraryNotice, centered && s.memberLibraryNoticeCentered]} accessibilityLiveRegion="polite">
    {showError && <>
      <Text accessibilityRole="alert" style={[s.cardMeta, centered && s.memberLibraryNoticeTextCentered]}>{library.error.status === 401 ? authenticationErrorMessage(library.error) : library.error.message}</Text>
      <AuthenticationRecovery error={library.error} />
      {!needsAuthenticationRecovery(library.error) && <DioButton label="다시 불러오기" disabled={loading} onPress={onRetry} style={centered ? undefined : s.noticeAction} />}
    </>}
    {/* 여러 권 휴지통 결과는 목록을 밀지 않게 알약 토스트로 알린다(App.js trashToast). 다시 로그인해야 하는 실패만 여기 남긴다 */}
    {bulkAuthError && <>
      <Text accessibilityRole="alert" style={s.cardMeta}>{authenticationErrorMessage(bulkAuthError)}</Text>
      <AuthenticationRecovery error={bulkAuthError} />
    </>}
  </View>
}
