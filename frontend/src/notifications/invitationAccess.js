// 누락·문자열·숫자 권한값을 허용으로 추정하지 않는다.
export const canOpenInvitation = detail => detail?.status === 'PENDING' && detail.canOpen === true;
