import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { styles as s } from '../styles'
import { C } from '../constants'
import { authenticationErrorMessage } from '../../auth/sessionExpiry.js'
import AuthenticationRecovery, { needsAuthenticationRecovery } from '../../auth/AuthenticationRecovery'

export default function MemberLibraryNotice({ library, pending, bulk, onRetry, onMore, onRetryBulk, onDismissBulk }) {
  const loading = pending || library.loading
  const metadataMessages = [...new Set((bulk?.failed || []).filter(item=>item.error.code==='INVALID_LOCAL_CACHE').map(item=>item.error.message))]
  const otherFailures = (bulk?.failed || []).filter(item=>item.error.code!=='INVALID_LOCAL_CACHE')
  return <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
    {loading && <View style={{ flexDirection: 'row', gap: 8 }}><ActivityIndicator color={C.blue} /><Text style={s.cardMeta}>다이어리를 불러오고 있어요.</Text></View>}
    {!pending && library.error && <>
      <Text accessibilityRole="alert" style={s.cardMeta}>{library.error.status === 401 ? authenticationErrorMessage(library.error) : library.error.message}</Text>
      <AuthenticationRecovery error={library.error} />
      {!needsAuthenticationRecovery(library.error) && <Pressable accessibilityRole="button" accessibilityLabel="회원 조회 다시 시도" disabled={loading} onPress={onRetry} style={s.secondary}><Text style={s.secondaryText}>다시 불러오기</Text></Pressable>}
    </>}
    {!loading && library.hasNext && !library.error && <Pressable accessibilityRole="button" onPress={onMore} style={s.secondary}><Text style={s.secondaryText}>다음 다이어리 불러오기</Text></Pressable>}
    {bulk && <>
      <Text style={s.cardMeta}>{bulk.busy ? `휴지통으로 옮기고 있어요. ${bulk.succeeded.length}/${bulk.ids.length}개 완료` : `${bulk.succeeded.length}개 이동 완료${bulk.failed.length ? ` · ${bulk.failed.length}개 확인 필요` : ''}`}</Text>
      {otherFailures.length > 0 && <Text accessibilityRole="alert" style={s.cardMeta}>{bulk.failed.some(item => item.error.status === 401) ? authenticationErrorMessage(bulk.failed.find(item => item.error.status === 401).error) : '완료된 항목은 다시 보내지 않아요. 남은 항목의 권한과 처리 결과를 확인해 주세요.'}</Text>}
      {metadataMessages.map(message=><Text key={message} accessibilityRole="alert" style={s.cardMeta}>{message}</Text>)}
      <AuthenticationRecovery error={bulk.failed.find(item => needsAuthenticationRecovery(item.error))?.error} />
      {bulk.refreshError && <Text accessibilityRole="alert" style={s.cardMeta}>처리 후 목록을 불러오지 못했어요. 완료된 이동은 다시 요청하지 않아요.</Text>}
      {bulk.canRetry && <Pressable accessibilityRole="button" onPress={onRetryBulk} style={s.secondary}><Text style={s.secondaryText}>{bulk.hasRetryableFailures ? '실패한 항목만 다시 확인' : '선택 작업 후 목록 다시 확인'}</Text></Pressable>}
      {!bulk.busy && <Pressable accessibilityRole="button" onPress={onDismissBulk} style={s.secondary}><Text style={s.secondaryText}>선택 작업 안내 닫기</Text></Pressable>}
    </>}
  </View>
}
