import AsyncStorage from '@react-native-async-storage/async-storage';

export const DIARY_LIBRARY_STORAGE_KEY = 'dio:diary:library:v1';

function isDiary(value) {
  return value
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.color === 'string';
}

// id는 `diary-${Date.now()}` 형식이라 숫자 부분이 생성 시각입니다.
function createdTime(diary) {
  return Number(diary.id.replace('diary-', '')) || 0;
}

export async function loadDiaryLibrary() {
  try {
    const raw = await AsyncStorage.getItem(DIARY_LIBRARY_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    // 먼저 만든 다이어리가 앞(왼쪽)에 오도록 생성 순으로 정렬합니다.
    return Array.isArray(data) ? data.filter(isDiary).sort((a, b) => createdTime(a) - createdTime(b)) : [];
  } catch {
    return [];
  }
}

export async function saveDiaryLibrary(diaries) {
  try {
    await AsyncStorage.setItem(DIARY_LIBRARY_STORAGE_KEY, JSON.stringify(diaries));
    return true;
  } catch {
    return false;
  }
}
