import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { confirmAction } from '../shared/dialogs'

// 공유 다이어리에 내 손글씨 폰트를 올려 공유해도 되는지(계정마다 한 번 묻는다).
// 'granted' | 'denied' | null(아직 묻지 않음). 설정 > 편집의 `공유 다이어리에 내 폰트 공유` 스위치로 바꾼다.
const keyOf = accountId => `dio:member:v1:${accountId}:font-share-consent:v1`
const values = new Map(), asking = new Map(), listeners = new Set()
const emit = accountId => listeners.forEach(listener => listener(accountId))

export const FONT_SHARE_PROMPT = {
  title: '내 폰트를 함께 쓸까요?',
  message: '다이어리 멤버도 내 손글씨로 쓴 글을 같은 글씨로 볼 수 있게, 폰트 파일을 서버에 올려 이 다이어리에 공유해요. 설정에서 언제든 바꿀 수 있어요.',
  confirmLabel: '공유하기',
  cancelLabel: '공유 안 함',
}

export async function fontShareConsent(accountId) {
  if (values.has(accountId)) return values.get(accountId)
  const saved = await AsyncStorage.getItem(keyOf(accountId)).catch(() => null)
  const value = saved === 'granted' || saved === 'denied' ? saved : null
  values.set(accountId, value)
  return value
}

export async function setFontShareConsent(accountId, value) {
  if (value !== 'granted' && value !== 'denied') throw Error('폰트 공유 설정 값을 확인해 주세요.')
  await AsyncStorage.setItem(keyOf(accountId), value)
  values.set(accountId, value)
  emit(accountId)
}

/** 아직 묻지 않았으면 확인 창을 한 번 띄운다. 같은 계정의 질문은 하나로 합친다. 공유하기면 true */
export function askFontShareConsent(accountId) {
  if (asking.has(accountId)) return asking.get(accountId)
  const job = (async () => {
    const current = await fontShareConsent(accountId)
    if (current) return current === 'granted'
    const granted = await new Promise(resolve => confirmAction({ ...FONT_SHARE_PROMPT, danger: false, onConfirm: () => resolve(true), onCancel: () => resolve(false) }))
    await setFontShareConsent(accountId, granted ? 'granted' : 'denied').catch(() => {})
    return granted
  })().finally(() => asking.delete(accountId))
  asking.set(accountId, job)
  return job
}

/** 설정 화면용: 지금 값과 바꾸기 */
export function useFontShareConsent(accountId) {
  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!accountId) return undefined
    let live = true
    const read = () => fontShareConsent(accountId).then(next => { if (live) setValue(next) })
    read()
    const listener = changed => { if (changed === accountId) read() }
    listeners.add(listener)
    return () => { live = false; listeners.delete(listener) }
  }, [accountId])
  return { value, set: next => setFontShareConsent(accountId, next) }
}
