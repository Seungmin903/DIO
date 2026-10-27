// 백엔드 연결 전까지 기기(브라우저) 저장소에 보관한다.
import AsyncStorage from '@react-native-async-storage/async-storage'

export { STORAGE_KEYS } from '../utils/storageContract.js'

export async function loadJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

/** 저장 성공 여부를 반환한다. */
export async function saveJSON(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export async function removeJSON(key) {
  try {
    await AsyncStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}
