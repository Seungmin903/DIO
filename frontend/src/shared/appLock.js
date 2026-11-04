import * as SecureStore from 'expo-secure-store'

// PIN과 실패 횟수는 OS 보안 저장소(Keychain/Keystore)에만 저장한다. AsyncStorage는 백업·복원이나
// 기기 접근으로 읽힐 수 있으므로 4자리 PIN 검증값을 이곳에 두면 안 된다.
export const PIN_LENGTH = 4
const keyOf = scope => `dio.appLock.v2.${encodeURIComponent(scope)}`
export const MAX_PIN_ATTEMPTS = 5
export const PIN_RETRY_DELAY_MS = 30 * 1000
const MAX_PIN_RETRY_DELAY_MS = 30 * 60 * 1000

/** 세션의 잠금 범위. 회원은 userId, 게스트는 accountId. */
export const appLockScope = user => (user?.mode === 'authenticated' ? `user:${user.userId}` : `guest:${user?.accountId || 'guest'}`)

// 다시 잠그기 전 유예: 1분 안에 돌아오면 잠그지 않는다(사진 선택기 · 공유 창은 안드로이드에서 앱을 백그라운드로 보낸다).
// 앱을 완전히 껐다 켜면 유예 없이 잠근다.
export const APP_LOCK_GRACE_MS = 60 * 1000

/** 백그라운드에 간 시각(awayAt)부터 지금까지 유예를 넘겼는지. */
export const appLockGraceOver = (awayAt, now = Date.now()) => awayAt != null && now - awayAt >= APP_LOCK_GRACE_MS

const validPin = pin => typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)

const read = async scope => {
  const raw = await SecureStore.getItemAsync(keyOf(scope))
  if (!raw) return null
  try {
    const saved = JSON.parse(raw)
    return validPin(saved?.pin) ? saved : null
  } catch {
    return null
  }
}
const write = (scope, saved) => SecureStore.setItemAsync(keyOf(scope), JSON.stringify(saved))

/** 이 계정에 앱 잠금이 켜져 있는지. */
export const hasAppLock = async scope => Boolean(await read(scope))

/** 비밀번호가 맞는지와 재시도 가능 시각을 돌려준다. 실패 횟수는 앱 재시작 뒤에도 남는다. */
export const checkAppLock = async (scope, pin, now = Date.now()) => {
  const saved = await read(scope)
  if (!saved) return { ok: false, retryAfterMs: 0 }
  const retryUntil = Number(saved.retryUntil) || 0
  if (retryUntil > now) return { ok: false, retryAfterMs: retryUntil - now }
  if (pin === saved.pin) {
    if (saved.failedAttempts || retryUntil || saved.lockouts) await write(scope, { ...saved, failedAttempts: 0, retryUntil: 0, lockouts: 0 })
    return { ok: true, retryAfterMs: 0 }
  }
  const failedAttempts = (Number(saved.failedAttempts) || 0) + 1
  const blocked = failedAttempts >= MAX_PIN_ATTEMPTS
  const lockouts = blocked ? Math.min((Number(saved.lockouts) || 0) + 1, 7) : (Number(saved.lockouts) || 0)
  const retryAfterMs = blocked ? Math.min(PIN_RETRY_DELAY_MS * (2 ** (lockouts - 1)), MAX_PIN_RETRY_DELAY_MS) : 0
  await write(scope, { ...saved, failedAttempts: blocked ? 0 : failedAttempts, retryUntil: blocked ? now + retryAfterMs : 0, lockouts })
  return { ok: false, retryAfterMs }
}

/** 새 비밀번호로 잠근다(바꾸기도 같다). */
export const setAppLock = async (scope, pin) => {
  if (!validPin(pin)) throw new Error('앱 잠금 비밀번호는 숫자 4자리여야 해요.')
  await write(scope, { version: 2, pin, failedAttempts: 0, retryUntil: 0, lockouts: 0 })
}

/** 앱 잠금을 끈다. */
export const clearAppLock = scope => SecureStore.deleteItemAsync(keyOf(scope))
