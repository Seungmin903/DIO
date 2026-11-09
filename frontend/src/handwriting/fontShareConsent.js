import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { confirmAction } from '../shared/dialogs'

// 공유 다이어리에 내 손글씨 폰트를 올려 공유해도 되는지(계정마다 한 번 묻는다).
// 'granted' | 'denied' | null(아직 묻지 않음) | 'unavailable'(저장소를 읽지 못함: 올리지도 묻지도 않고 다음에 다시 읽는다).
// 설정 > 편집의 `공유 다이어리에 내 폰트 공유` 스위치로 바꾼다.
const accountOf = accountId => String(accountId) // 설정(userId) · 편집 세션(memberAccountId)이 숫자 · 문자로 달라도 같은 계정으로 본다
const keyOf = account => `dio:member:v1:${account}:font-share-consent:v1`
const values = new Map(), asking = new Map(), listeners = new Set()
const emit = account => listeners.forEach(listener => listener(account))

export const FONT_SHARE_PROMPT = {
  title: '내 폰트를 함께 쓸까요?',
  message: '다이어리 멤버도 내 손글씨로 쓴 글을 같은 글씨로 볼 수 있게, 폰트 파일을 서버에 올려 이 다이어리에 공유해요. 설정에서 언제든 바꿀 수 있어요.',
  confirmLabel: '공유하기',
  cancelLabel: '공유 안 함',
}

export async function fontShareConsent(accountId) {
  const account = accountOf(accountId)
  if (values.has(account)) return values.get(account)
  let saved
  try { saved = await AsyncStorage.getItem(keyOf(account)) }
  catch { return 'unavailable' } // 읽기 실패는 기억하지 않는다(예전에 고른 값을 '묻지 않음'으로 덮지 않게)
  const value = saved === 'granted' || saved === 'denied' ? saved : null
  values.set(account, value)
  return value
}

export async function setFontShareConsent(accountId, value) {
  if (value !== 'granted' && value !== 'denied') throw Error('폰트 공유 설정 값을 확인해 주세요.')
  const account = accountOf(accountId)
  await AsyncStorage.setItem(keyOf(account), value)
  values.set(account, value)
  emit(account)
}

/** 아직 묻지 않았으면 확인 창을 한 번 띄운다. 같은 계정의 질문은 하나로 합친다. 공유하기면 true(저장소를 읽지 못했으면 묻지 않고 false) */
export function askFontShareConsent(accountId) {
  const account = accountOf(accountId)
  if (asking.has(account)) return asking.get(account)
  const job = (async () => {
    const current = await fontShareConsent(account)
    if (current) return current === 'granted'
    const granted = await new Promise(resolve => confirmAction({ ...FONT_SHARE_PROMPT, danger: false, onConfirm: () => resolve(true), onCancel: () => resolve(false) }))
    await setFontShareConsent(account, granted ? 'granted' : 'denied').catch(() => {})
    return granted
  })().finally(() => asking.delete(account))
  asking.set(account, job)
  return job
}

/** 설정 화면용: 지금 값과 바꾸기 */
export function useFontShareConsent(accountId) {
  const account = accountId == null ? null : accountOf(accountId)
  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!account) return undefined
    let live = true
    const read = () => fontShareConsent(account).then(next => { if (live) setValue(next) })
    read()
    const listener = changed => { if (changed === account) read() }
    listeners.add(listener)
    return () => { live = false; listeners.delete(listener) }
  }, [account])
  return { value, set: next => setFontShareConsent(account, next) }
}
