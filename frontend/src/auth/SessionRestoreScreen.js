import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DioButton from '../shared/DioButton';
import { colors } from '../shared/theme';

/**
 * 회원 보관함 복구 화면(부팅 복원 실패). 만료(expired)면 저장 토큰이 이미 지워져 '연결 재시도'가 의미 없으므로 '다시 로그인'을 주 버튼으로 두고
 * 재시도 버튼은 두지 않는다(S15P31F106-718). 통신 · 서버 오류는 '연결 재시도'가 주 버튼이다. 게스트 전환은 어느 경우든 '게스트로 계속'을 골라야만 한다.
 */
export default function SessionRestoreScreen({ error, busy, onRetry, onLogin, onGuest }) {
  const expired = error?.sessionExpired === true || (error?.status === 401 && error.code === 'INVALID_TOKEN');
  const message = expired ? '로그인이 만료됐어요. 다시 로그인하면 회원 보관함을 볼 수 있어요.'
    : error?.status >= 500 ? '서버에 연결하지 못해 로그인을 복원하지 못했어요. 잠시 후 다시 시도해 주세요.'
    : error?.code === 'DEVELOPMENT_ACCESS_REQUIRED' ? '개발 서버 접근 인증이 필요해 로그인을 복원하지 못했어요.'
    : error?.code === 'NETWORK_ERROR' ? '로그인을 복원하지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.'
    : '로그인 정보를 확인하지 못했어요. 다시 시도하거나 로그인해 주세요.';
  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>회원 보관함을 열지 못했어요</Text>
        <Text accessibilityRole="alert" style={styles.copy}>{message}</Text>
        <Text style={styles.copy}>지금은 회원 다이어리를 불러오지 못한 상태예요. 로그인 연결을 확인한 뒤 다시 불러올 수 있어요.</Text>
        {busy && <ActivityIndicator color={colors.primaryStrong} accessibilityLabel="로그인 복원 중" />}
        {expired
          ? <DioButton block variant="filled" label="다시 로그인" disabled={busy} onPress={onLogin} />
          : <>
            <DioButton block variant="filled" label={busy ? '확인 중…' : '연결 재시도'} disabled={busy} onPress={onRetry} />
            <DioButton block variant="ghost" outline label="다시 로그인" disabled={busy} onPress={onLogin} />
          </>}
        <DioButton block variant="ghost" label="게스트로 계속" disabled={busy} onPress={onGuest} />
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surfaceSoft },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 480, gap: 16, padding: 24, borderRadius: 16, backgroundColor: colors.surface },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  copy: { fontSize: 15, lineHeight: 23, color: colors.text },
});
