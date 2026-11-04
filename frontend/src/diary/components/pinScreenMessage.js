export const pinFailureMessage = result => {
  const seconds = Math.ceil((typeof result === 'object' ? result?.retryAfterMs : 0) / 1000)
  if (seconds > 0) return `입력 횟수가 많아요. ${seconds}초 뒤에 다시 시도해 주세요`
  if (typeof result === 'object' && result?.error) return '앱 잠금을 확인하지 못했어요. 잠시 후 다시 시도해 주세요'
  return '비밀번호가 달라요'
}
