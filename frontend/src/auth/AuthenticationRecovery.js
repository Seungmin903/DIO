import { Pressable, StyleSheet, Text } from 'react-native';
import { useLoginEntry } from './loginGate';
import { colors } from '../shared/theme';

export const needsAuthenticationRecovery = error => error?.status === 401 && error.code !== 'DEVELOPMENT_ACCESS_REQUIRED';

// Also available when a request rejects authentication without a confirmed refresh expiry.
export default function AuthenticationRecovery({ error }) {
  const openLogin = useLoginEntry();
  if (!needsAuthenticationRecovery(error)) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="다시 로그인" style={styles.button}
    onPress={() => openLogin({ sessionExpired: error.sessionExpired === true })}>
    <Text style={styles.text}>다시 로그인</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, alignSelf: 'flex-start', justifyContent: 'center', backgroundColor: colors.primaryStrong },
  text: { color: colors.surface, fontWeight: '600', fontSize: 14 },
});
