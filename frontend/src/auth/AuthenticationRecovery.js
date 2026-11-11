import { useLoginEntry } from './loginGate';
import DioButton from '../shared/DioButton';

export const needsAuthenticationRecovery = error => error?.status === 401 && error.code !== 'DEVELOPMENT_ACCESS_REQUIRED';

// Also available when a request rejects authentication without a confirmed refresh expiry.
export default function AuthenticationRecovery({ error }) {
  const openLogin = useLoginEntry();
  if (!needsAuthenticationRecovery(error)) return null;
  return <DioButton variant="filled" label="다시 로그인" style={{ alignSelf: 'flex-start' }}
    onPress={() => openLogin({ sessionExpired: error.sessionExpired === true })} />;
}
