import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { styles as s } from '../styles'
import { C } from '../constants'
import { authenticationErrorMessage } from '../../auth/sessionExpiry.js'
import AuthenticationRecovery, { needsAuthenticationRecovery } from '../../auth/AuthenticationRecovery'

export default function MemberLibraryNotice({ library, pending, bulk, onRetry, onMore }) {
  const loading = pending || library.loading
  const bulkAuthError = bulk?.busy ? null : (bulk?.failed || []).find(item => item.error?.status === 401)?.error ?? null
  return <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
    {loading && <View style={{ flexDirection: 'row', gap: 8 }}><ActivityIndicator color={C.blue} /><Text style={s.cardMeta}>다이어리를 불러오고 있어요.</Text></View>}
    {!pending && library.error && <>
      <Text accessibilityRole="alert" style={s.cardMeta}>{library.error.status === 401 ? authenticationErrorMessage(library.error) : library.error.message}</Text>
      <AuthenticationRecovery error={library.error} />
      {!needsAuthenticationRecovery(library.error) && <Pressable accessibilityRole="button" accessibilityLabel="회원 조회 다시 시도" disabled={loading} onPress={onRetry} style={s.secondary}><Text style={s.secondaryText}>다시 불러오기</Text></Pressable>}
    </>}
    {!loading && library.hasNext && !library.error && <Pressable accessibilityRole="button" onPress={onMore} style={s.secondary}><Text style={s.secondaryText}>다음 다이어리 불러오기</Text></Pressable>}
    {/* 여러 권 휴지통 결과는 목록을 밀지 않게 알약 토스트로 알린다(App.js trashToast). 다시 로그인해야 하는 실패만 여기 남긴다 */}
    {bulkAuthError && <>
      <Text accessibilityRole="alert" style={s.cardMeta}>{authenticationErrorMessage(bulkAuthError)}</Text>
      <AuthenticationRecovery error={bulkAuthError} />
    </>}
  </View>
}
