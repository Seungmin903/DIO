import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { confirmAction } from '../shared/dialogs'
import { fontShareConsentServer } from './fontShareConsentServer'

// 공유 다이어리에 내 손글씨 폰트를 올려 공유해도 되는지(계정마다 한 번 묻는다).
// 'granted' | 'denied' | null(아직 묻지 않음) | 'unavailable'(서버 · 저장소를 읽지 못함: 올리지도 묻지도 않고 다음에 다시 읽는다).
// 설정 > 편집의 `공유 다이어리에 내 폰트 공유` 스위치로 바꾼다.
// 값은 계정 단위로 서버(/api/v1/handwriting-fonts/share-consent)에 둔다: 다른 기기에서도 다시 묻지 않고 스위치 값이 같다.
// 기기 저장소 키는 서버에 아직 못 보낸 답(예전 버전이 기기에만 저장한 답 · 저장 실패한 답)만 담는다.
// 다음에 읽을 때 서버에 답이 없으면 그 값을 옮기고(onlyIfNotAsked: 다른 기기에서 먼저 고른 답은 덮지 않는다) 기기 값은 지운다.
const accountOf = accountId => String(accountId) // 설정(userId) · 편집 세션(memberAccountId)이 숫자 · 문자로 달라도 같은 계정으로 본다
const keyOf = account => `dio:member:v1:${account}:font-share-consent:v1`
// 다른 기기에서 바꾼 값을 따라가도록 기억한 값은 잠시만 쓴다(설정 화면은 열 때마다 새로 읽는다)
const FRESH_MS = 5 * 60 * 1000
const values = new Map(), loading = new Map(), changes = new Map(), asking = new Map(), listeners = new Set()
const emit = account => listeners.forEach(listener => listener(account))
const remember = (account, value) => { values.set(account, { value, at: Date.now() }); changes.set(account, (changes.get(account) ?? 0) + 1) }

export const FONT_SHARE_PROMPT = {
  title: '내 폰트를 함께 쓸까요?',
  // 동의는 계정 단위다: 한 번 공유하기를 고르면 앞으로 참여한 모든 공유 다이어리에 묻지 않고 올린다. 문구도 그 범위로 안내한다
  message: '앞으로 내가 참여한 공유 다이어리에서 내 폰트로 글을 쓰면, 멤버도 같은 글씨로 볼 수 있게 폰트 파일을 서버에 올려 그 다이어리에 공유해요. 설정에서 언제든 바꿀 수 있어요.',
  confirmLabel: '공유하기',
  cancelLabel: '공유 안 함',
}

async function load(account) {
  const server = fontShareConsentServer(account)
  if (!server) return 'unavailable' // 이 계정으로 로그인한 세션이 없다
  const change = changes.get(account) ?? 0
  let local = null, localFailed = false
  try { local = await AsyncStorage.getItem(keyOf(account)) } catch { localFailed = true }
  if (local !== 'granted' && local !== 'denied') local = null
  let value
  try {
    value = await server.load()
    if (!value && local) value = await server.save(local, { onlyIfNotAsked: true })
  } catch { return 'unavailable' } // 읽기 실패는 기억하지 않는다(예전에 고른 값을 '묻지 않음'으로 덮지 않게)
  // 기기에 못 보낸 답이 있는지 모르면 묻지 않는다(다음에 다시 읽어 옮긴다)
  if (!value && localFailed) return 'unavailable'
  if (local) await AsyncStorage.removeItem(keyOf(account)).catch(() => {})
  // 읽는 동안 이 기기에서 바꿨으면 그 값이 최신이다
  if ((changes.get(account) ?? 0) !== change) return values.get(account)?.value ?? value
  remember(account, value)
  return value
}

/** 지금 값. fresh 면 기억한 값을 쓰지 않고 서버에서 다시 읽는다 */
export function fontShareConsent(accountId, { fresh = false } = {}) {
  const account = accountOf(accountId)
  const known = values.get(account)
  if (!fresh && known && Date.now() - known.at < FRESH_MS) return Promise.resolve(known.value)
  if (loading.has(account)) return loading.get(account)
  const job = load(account).finally(() => loading.delete(account))
  loading.set(account, job)
  return job
}

/** 로그인 뒤 한 번: 기기에만 있던 예전 답을 서버로 옮기고 값을 받아 둔다 */
export function syncFontShareConsent(accountId) {
  return fontShareConsent(accountId, { fresh: true }).catch(() => 'unavailable')
}

/** 폰트를 공유 다이어리에 올리기 직전: 기억한 값 대신 서버 값을 읽는다(다른 기기에서 철회한 동의를 바로 따른다. 못 읽으면 'unavailable'이라 올리지 않는다) */
export function fontShareConsentBeforeShare(accountId) {
  return fontShareConsent(accountId, { fresh: true })
}

export async function setFontShareConsent(accountId, value) {
  if (value !== 'granted' && value !== 'denied') throw Error('폰트 공유 설정 값을 확인해 주세요.')
  const account = accountOf(accountId)
  const server = fontShareConsentServer(account)
  if (!server) throw Error('로그인 상태를 확인해 주세요.')
  const saved = await server.save(value)
  remember(account, saved)
  await AsyncStorage.removeItem(keyOf(account)).catch(() => {})
  emit(account)
}

// 서버에 저장하지 못한 답: 이번 실행에서는 다시 묻지 않고, 기기에 남겨 다음에 읽을 때 서버로 옮긴다
async function keepUnsent(account, value) {
  remember(account, value)
  await AsyncStorage.setItem(keyOf(account), value).catch(() => {})
  emit(account)
}

/** 아직 묻지 않았으면 확인 창을 한 번 띄운다. 같은 계정의 질문은 하나로 합친다. 공유하기면 true(값을 읽지 못했으면 묻지 않고 false) */
export function askFontShareConsent(accountId) {
  const account = accountOf(accountId)
  if (asking.has(account)) return asking.get(account)
  const job = (async () => {
    // 묻기 전에도 서버 값을 새로 읽는다(다른 기기에서 이미 답했으면 다시 묻지 않고 그 답을 따른다)
    const current = await fontShareConsent(account, { fresh: true })
    if (current) return current === 'granted'
    // 고르지 않았는데 창이 닫히면(앱 창 호스트가 사라짐 · 시스템이 닫음) 답을 저장하지 않는다: '아직 묻지 않음'으로 남아 다음에 다시 묻는다
    const answer = await new Promise(resolve => confirmAction({ ...FONT_SHARE_PROMPT, danger: false,
      onConfirm: () => resolve('granted'), onCancel: () => resolve('denied'), onAbort: () => resolve(null) }))
    if (answer) await setFontShareConsent(account, answer).catch(() => keepUnsent(account, answer))
    return answer === 'granted'
  })().finally(() => asking.delete(account))
  asking.set(account, job)
  return job
}

/** 설정 화면용: 지금 값과 바꾸기. 열 때 서버에서 새로 읽어 다른 기기에서 바꾼 값도 보인다 */
export function useFontShareConsent(accountId) {
  const account = accountId == null ? null : accountOf(accountId)
  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!account) return undefined
    let live = true
    const read = options => fontShareConsent(account, options).then(next => { if (live) setValue(next) })
    read({ fresh: true })
    const listener = changed => { if (changed === account) read() }
    listeners.add(listener)
    return () => { live = false; listeners.delete(listener) }
  }, [account])
  return { value, set: next => setFontShareConsent(account, next) }
}
