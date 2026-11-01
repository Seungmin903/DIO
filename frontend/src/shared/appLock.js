import AsyncStorage from '@react-native-async-storage/async-storage'
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto'

// 앱 잠금(내 공간 → 보안): 숫자 4자리 비밀번호. 계정마다 따로 둔다(회원 userId · 게스트 accountId).
// 비밀번호는 저장하지 않고 소금(무작위 값)을 붙인 SHA-256 만 기기에 둔다.
export const PIN_LENGTH = 4
const keyOf = scope => `dio.appLock.v1:${scope}`

/** 세션의 잠금 범위. 회원은 userId, 게스트는 accountId. */
export const appLockScope = user => (user?.mode === 'authenticated' ? `user:${user.userId}` : `guest:${user?.accountId || 'guest'}`)

// 다시 잠그기 전 유예: 1분 안에 돌아오면 잠그지 않는다(사진 선택기 · 공유 창은 안드로이드에서 앱을 백그라운드로 보낸다).
// 앱을 완전히 껐다 켜면 유예 없이 잠근다.
export const APP_LOCK_GRACE_MS = 60 * 1000

/** 백그라운드에 간 시각(awayAt)부터 지금까지 유예를 넘겼는지. */
export const appLockGraceOver = (awayAt, now = Date.now()) => awayAt != null && now - awayAt >= APP_LOCK_GRACE_MS

const hashPin = (salt, pin) => digestStringAsync(CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`)

const read = async scope => {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(keyOf(scope)))
    return saved?.salt && saved?.hash ? saved : null
  } catch { return null }
}

/** 이 계정에 앱 잠금이 켜져 있는지. */
export const hasAppLock = async scope => Boolean(await read(scope))

/** 비밀번호가 맞는지. 잠금이 없으면 false. */
export const checkAppLock = async (scope, pin) => {
  const saved = await read(scope)
  return Boolean(saved) && (await hashPin(saved.salt, pin)) === saved.hash
}

/** 새 비밀번호로 잠근다(바꾸기도 같다). */
export const setAppLock = async (scope, pin) => {
  const salt = randomUUID()
  await AsyncStorage.setItem(keyOf(scope), JSON.stringify({ salt, hash: await hashPin(salt, pin) }))
}

/** 앱 잠금을 끈다. */
export const clearAppLock = scope => AsyncStorage.removeItem(keyOf(scope))
