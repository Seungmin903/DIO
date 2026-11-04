// Shared copy for authenticated features; gateway/network failures keep their own messages.
export const SESSION_EXPIRED_MESSAGE = '로그인이 만료됐어요. 다시 로그인해 주세요.';
export const AUTHENTICATION_FAILED_MESSAGE = '인증을 확인하지 못했어요. 다시 시도해 주세요.';

// Only the local auth service can confirm refresh expiry. HTTP status/code
// alone may instead come from an access-token rejection or a gateway.
export const authenticationErrorMessage = error => error?.sessionExpired === true
  ? SESSION_EXPIRED_MESSAGE : AUTHENTICATION_FAILED_MESSAGE;
