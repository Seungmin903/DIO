export function notificationCountLabel(data) {
  if (Number.isSafeInteger(data?.actionableUnreadCount)) return { value: data.actionableUnreadCount, label: '새 초대', showDot: data.actionableUnreadCount > 0 };
  if (Number.isSafeInteger(data?.unreadCount)) return { value: data.unreadCount, label: '안 읽은 알림', showDot: false };
  return { value: null, label: '안 읽은 알림', showDot: false };
}
