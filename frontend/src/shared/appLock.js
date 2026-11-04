import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

// PIN과 실패 횟수는 OS 보안 저장소(Keychain/Keystore)에만 저장한다. AsyncStorage는 백업·복원이나
// 기기 접근으로 읽힐 수 있으므로 4자리 PIN 검증값을 이곳에 두면 안 된다.
export const PIN_LENGTH = 4
// SecureStore 키는 영숫자와 .-_ 만 받으므로, scope의 각 Unicode code point를 고정 6자리 16진수로 만든다.
// 구분자가 없어도 고정 폭이라 충돌 없이 되돌릴 수 있다.
const keyOf = scope => `dio.appLock.v2.s${Array.from(String(scope), char => char.codePointAt(0).toString(16).padStart(6, '0')).join('')}`
const legacyKeyOf = scope => `dio.appLock.v1:${scope}`
const webAttemptsKeyOf = scope => `dio.appLock.v1.attempts:${scope}`
export const MAX_PIN_ATTEMPTS = 5
export const PIN_RETRY_DELAY_MS = 30 * 1000
const MAX_PIN_RETRY_DELAY_MS = 30 * 60 * 1000
export const appLockSupported = Platform.OS !== 'web'

/** 세션의 잠금 범위. 회원은 userId, 게스트는 accountId. */
export const appLockScope = user => (user?.mode === 'authenticated' ? `user:${user.userId}` : `guest:${user?.accountId || 'guest'}`)

// 다시 잠그기 전 유예: 1분 안에 돌아오면 잠그지 않는다(사진 선택기 · 공유 창은 안드로이드에서 앱을 백그라운드로 보낸다).
// 앱을 완전히 껐다 켜면 유예 없이 잠근다.
export const APP_LOCK_GRACE_MS = 60 * 1000

/** 백그라운드에 간 시각(awayAt)부터 지금까지 유예를 넘겼는지. */
export const appLockGraceOver = (awayAt, now = Date.now()) => awayAt != null && now - awayAt >= APP_LOCK_GRACE_MS

const validPin = pin => typeof pin === 'string' && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
const validLegacy = saved => typeof saved?.salt === 'string' && typeof saved?.hash === 'string'
const validV2 = saved => typeof saved?.salt === 'string' && typeof saved?.hash === 'string'
const legacyHash = (salt, pin) => digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`)

const missing = { kind: 'missing' }
const blocked = saved => ({ kind: 'locked', saved })
const unavailable = kind => ({ kind })
const readsInFlight = new Map()

const readLegacy = async scope => {
  const legacyRaw = await AsyncStorage.getItem(legacyKeyOf(scope))
  if (!legacyRaw) return missing
  let legacy
  try { legacy = JSON.parse(legacyRaw) } catch { return unavailable('corrupt') }
  if (!validLegacy(legacy)) return unavailable('corrupt')
  // 웹은 새 잠금을 만들지 않지만, 기존 v1 잠금의 시도 제한은 별도 AsyncStorage 항목에 유지한다.
  let attempts = {}
  try { attempts = JSON.parse(await AsyncStorage.getItem(webAttemptsKeyOf(scope)) || '{}') } catch { attempts = {} }
  return blocked({ version: 1, legacy, failedAttempts: Number(attempts.failedAttempts) || 0, retryUntil: Number(attempts.retryUntil) || 0, lockouts: Number(attempts.lockouts) || 0 })
}

const readOnce = async scope => {
  // 웹은 새 앱 잠금을 제공하지 않는다. 다만 기존 v1 잠금은 조용히 해제하지 않고 계속 검증한다.
  if (!appLockSupported) {
    try { return await readLegacy(scope) } catch { return unavailable('storage') }
  }
  try {
    const raw = await SecureStore.getItemAsync(keyOf(scope))
    if (raw) {
      let saved
      try { saved = JSON.parse(raw) } catch { return unavailable('corrupt') }
      if (validV2(saved) || validLegacy(saved?.legacy)) {
        // 이전 실행에서 v2 저장 뒤 v1 삭제만 실패했을 수 있다. 보안 저장소 값은 이미 유효하므로
        // 정리 실패로 앱을 막지 않고, 이후 읽을 때마다 약한 v1 검증값 삭제를 다시 시도한다.
        AsyncStorage.removeItem(legacyKeyOf(scope)).catch(() => {})
        return blocked(saved)
      }
      return unavailable('corrupt')
    }
    // v1은 다음 잠금 해제 때 PIN을 검증할 수 있도록 OS 보안 저장소로 먼저 옮긴다.
    // 보안 저장소 쓰기에 성공한 뒤에만 AsyncStorage의 약한 검증값을 지운다.
    const legacyState = await readLegacy(scope)
    if (legacyState.kind !== 'locked') return legacyState
    const { legacy } = legacyState.saved
    const migrated = { version: 2, legacy: { salt: legacy.salt, hash: legacy.hash }, failedAttempts: 0, retryUntil: 0, lockouts: 0 }
    await SecureStore.setItemAsync(keyOf(scope), JSON.stringify(migrated))
    await AsyncStorage.removeItem(legacyKeyOf(scope))
    return blocked(migrated)
  } catch {
    return unavailable('storage')
  }
}
// 첫 실행의 v1→v2 이전은 읽기·삭제 두 저장소를 건너므로 scope마다 한 번만 수행한다.
// 동시에 들어온 hasAppLock/checkAppLock 호출은 같은 결과를 받아 잠금이 없는 것으로 보지 않는다.
const read = scope => {
  const running = readsInFlight.get(scope)
  if (running) return running
  const task = readOnce(scope).finally(() => { if (readsInFlight.get(scope) === task) readsInFlight.delete(scope) })
  readsInFlight.set(scope, task)
  return task
}
const write = (scope, saved) => {
  if (!appLockSupported) throw new Error('이 환경에서는 앱 잠금을 지원하지 않아요.')
  return SecureStore.setItemAsync(keyOf(scope), JSON.stringify(saved))
}
const writeAttemptState = (scope, saved) => appLockSupported
  ? write(scope, saved)
  : AsyncStorage.setItem(webAttemptsKeyOf(scope), JSON.stringify({ failedAttempts: saved.failedAttempts, retryUntil: saved.retryUntil, lockouts: saved.lockouts }))

/** 이 계정에 앱 잠금이 켜져 있는지. 저장소·형식 오류도 PIN 없이 열지 않도록 잠금으로 본다. */
export const hasAppLock = async scope => (await read(scope)).kind !== 'missing'

/** 비밀번호가 맞는지와 재시도 가능 시각을 돌려준다. 실패 횟수는 앱 재시작 뒤에도 남는다. */
const checksInFlight = new Map()
const checkAppLockOnce = async (scope, pin, now = Date.now()) => {
  const state = await read(scope)
  if (state.kind === 'missing') return { ok: false, retryAfterMs: 0 }
  if (state.kind !== 'locked') return { ok: false, retryAfterMs: 0, error: state.kind }
  const { saved } = state
  // 기기 시계는 신뢰 경계 밖이다. 재부팅 뒤에도 쓸 수 있는 단조 시계가 없어, 로컬 제한은
  // 편의·억제 용도이며 시계를 앞으로 바꾸는 공격 자체는 막지 못한다. 긴 잠금은 30분으로 보정한다.
  const retryUntil = Math.min(Number(saved.retryUntil) || 0, now + MAX_PIN_RETRY_DELAY_MS)
  if (retryUntil > now) return { ok: false, retryAfterMs: retryUntil - now }
  let valid
  try { valid = saved.legacy ? (await legacyHash(saved.legacy.salt, pin)) === saved.legacy.hash : (await legacyHash(saved.salt, pin)) === saved.hash } catch { return { ok: false, retryAfterMs: 0, error: 'storage' } }
  if (valid) {
    // v1 값은 올바른 PIN을 한 번 받은 뒤에만 Keychain/Keystore의 v2 형식으로 완전히 바꾼다.
    try {
      if (saved.legacy && appLockSupported) {
        const salt = randomUUID()
        await write(scope, { version: 2, salt, hash: await legacyHash(salt, pin), failedAttempts: 0, retryUntil: 0, lockouts: 0 })
      }
      else if (saved.failedAttempts || retryUntil || saved.lockouts) {
        if (appLockSupported) await write(scope, { ...saved, failedAttempts: 0, retryUntil: 0, lockouts: 0 })
        else await AsyncStorage.removeItem(webAttemptsKeyOf(scope))
      }
    } catch { /* PIN 검증은 이미 성공했다. 다음 시도에서 정리 상태를 다시 저장한다. */ }
    return { ok: true, retryAfterMs: 0 }
  }
  const failedAttempts = (Number(saved.failedAttempts) || 0) + 1
  const blocked = failedAttempts >= MAX_PIN_ATTEMPTS
  const lockouts = blocked ? Math.min((Number(saved.lockouts) || 0) + 1, 7) : (Number(saved.lockouts) || 0)
  const retryAfterMs = blocked ? Math.min(PIN_RETRY_DELAY_MS * (2 ** (lockouts - 1)), MAX_PIN_RETRY_DELAY_MS) : 0
  try { await writeAttemptState(scope, { ...saved, failedAttempts: blocked ? 0 : failedAttempts, retryUntil: blocked ? now + retryAfterMs : 0, lockouts }) } catch { return { ok: false, retryAfterMs: 0, error: 'storage' } }
  return { ok: false, retryAfterMs }
}

/** 상세 결과가 필요한 PIN 입력 화면용. 같은 scope의 읽기·검증·실패 횟수 저장을 직렬화한다. */
export const checkAppLockStatus = (scope, pin, now = Date.now()) => {
  const previous = checksInFlight.get(scope) || Promise.resolve()
  const task = previous.catch(() => {}).then(() => checkAppLockOnce(scope, pin, now))
  checksInFlight.set(scope, task)
  task.finally(() => { if (checksInFlight.get(scope) === task) checksInFlight.delete(scope) })
  return task
}

/** 이전 boolean 계약을 유지한다. PIN 입력 화면은 checkAppLockStatus를 사용한다. */
export const checkAppLock = async (scope, pin, now = Date.now()) => (await checkAppLockStatus(scope, pin, now)).ok

/** 새 비밀번호로 잠근다(바꾸기도 같다). */
export const setAppLock = async (scope, pin) => {
  if (!validPin(pin)) throw new Error('앱 잠금 비밀번호는 숫자 4자리여야 해요.')
  const salt = randomUUID()
  await write(scope, { version: 2, salt, hash: await legacyHash(salt, pin), failedAttempts: 0, retryUntil: 0, lockouts: 0 })
}

/** 앱 잠금을 끈다. */
export const clearAppLock = async scope => {
  const tasks = [AsyncStorage.removeItem(legacyKeyOf(scope)), AsyncStorage.removeItem(webAttemptsKeyOf(scope))]
  if (appLockSupported) tasks.push(SecureStore.deleteItemAsync(keyOf(scope)))
  const results = await Promise.allSettled(tasks)
  const failed = results.find(result => result.status === 'rejected')
  if (failed) throw failed.reason
}
