import { authenticationErrorMessage } from '../auth/sessionExpiry.js';

export function notificationErrorNotice(error, subject = '알림') {
  const status = error?.status;
  const disconnected = ['API_NOT_CONFIGURED', 'INVITATION_NOT_CONNECTED'].includes(error?.code);
  const canRetry = !disconnected && ![400, 401, 403, 404, 409, 410, 422].includes(status);
  let message = error?.message || '요청을 처리하지 못했어요. 다시 확인해 주세요.';
  if (error?.code === 'API_NOT_CONFIGURED') message = '알림 서버 설정을 확인해 주세요.';
  else if (error?.code === 'INVITATION_NOT_CONNECTED') message = '초대 상세 연결을 기다리고 있어요.';
  else if (status === 401) message = authenticationErrorMessage(error);
  else if (status === 403) message = subject === '초대' ? '이 초대를 확인할 권한이 없어요.' : '알림을 확인할 권한이 없어요.';
  else if (status === 404) message = subject === '초대' ? '초대를 찾을 수 없어요. 알림 목록을 새로고침해 주세요.' : '알림을 찾을 수 없어요. 목록을 새로고침해 주세요.';
  else if (error?.code === 'READ_WATERMARK_EXPIRED') message = '전체 읽음 요청이 만료됐어요. 다시 눌러 주세요.';
  else if (error?.code === 'INVALID_READ_WATERMARK') message = '전체 읽음 요청을 확인할 수 없어요. 다시 눌러 주세요.';
  else if (error?.code === 'READ_WATERMARK_LIMIT') message = '전체 읽음 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
  else if (status >= 500 && status <= 599) message = '서버 오류로 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  else if (error?.code === 'NETWORK_ERROR') message = '연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.';
  return { message, canRetry, refreshList: status === 404 };
}
