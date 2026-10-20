// 백엔드 연결 전까지 기기(브라우저) 저장소에 보관한다.
import AsyncStorage from '@react-native-async-storage/async-storage'

export const STORAGE_KEYS = {
  doc: 'dio:editor:doc:v4', // v4: 기본 스티커를 이모지 → 이미지 스티커로 바꾼 데모 문서
  customDecor: 'dio:editor:custom-decor:v2',
  diaries: 'dio:diary:list:v1', // 보관함 다이어리 목록. 각 편집 문서는 doc 키 뒤에 `:<diaryId>`를 붙여 저장한다.
}

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
