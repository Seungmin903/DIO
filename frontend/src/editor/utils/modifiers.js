import { Platform } from 'react-native'

// 웹(키보드)에서 Shift / Ctrl(⌘) 를 누른 채 누르면 여러 개 선택한다.
// 터치 이벤트에는 보조키 정보가 없어서 키보드 상태를 따로 기억한다.
const pressed = { shift: false, mod: false }

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const sync = (event) => {
    pressed.shift = event.shiftKey
    pressed.mod = event.ctrlKey || event.metaKey
  }
  window.addEventListener('keydown', sync)
  window.addEventListener('keyup', sync)
  window.addEventListener('pointerdown', sync, true)
  window.addEventListener('blur', () => {
    pressed.shift = false
    pressed.mod = false
  })
}

export const isMultiSelectKey = () => pressed.shift || pressed.mod
