import * as Clipboard from 'expo-clipboard'
import { useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'

const copyListeners = new Set()

export async function copyText(text) {
  await Clipboard.setStringAsync(text)
  copyListeners.forEach((listener) => listener())
}

// 텍스트 내용은 읽지 않고 존재 여부만 확인한다.
export function useTextClipboardAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let active = true, revision = 0
    const refresh = async () => {
      const request = ++revision
      try {
        const hasText = await Clipboard.hasStringAsync()
        if (active && request === revision) setAvailable(hasText)
      } catch {
        if (active && request === revision) setAvailable(false)
      }
    }
    copyListeners.add(refresh)
    // expo-clipboard 웹 모듈은 addListener를 구현하지 않는다.
    const clipboard = Platform.OS === 'web' ? null : Clipboard.addClipboardListener(refresh)
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') refresh() })
    refresh()
    return () => {
      active = false
      copyListeners.delete(refresh)
      clipboard?.remove()
      appState.remove()
    }
  }, [])
  return available
}

// 사용자가 붙여넣기를 누를 때만 시스템 클립보드를 읽는다.
export async function readText() {
  return Clipboard.getStringAsync()
}
