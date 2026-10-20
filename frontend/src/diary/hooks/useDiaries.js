import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveJSON, STORAGE_KEYS } from '../../editor/services/storage';
import { normalizeDiaries, recoverOrphanDiaries } from '../utils/diaryLibrary';

/** 다이어리 목록 + 기기 저장소 자동 저장. 편집 문서만 남은 다이어리는 목록에 되살린다. */
export function useDiaries() {
  const [diaries, setDiaries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // 저장소를 읽지 못했으면 기존 목록을 빈 목록으로 덮어쓰지 않도록 이번 실행 동안 저장하지 않는다.
  const [writable, setWritable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved = [];
      let readable = true;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.diaries);
        try { saved = normalizeDiaries(raw ? JSON.parse(raw) : []); } catch { saved = []; }
      } catch {
        readable = false;
      }
      let entries = [];
      try {
        const prefix = `${STORAGE_KEYS.doc}:`;
        const known = new Set(saved.map((diary) => `${prefix}${diary.id}`));
        const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix) && !known.has(key));
        if (keys.length) entries = await AsyncStorage.multiGet(keys);
      } catch {
        // 복구 실패는 목록 표시를 막지 않는다.
      }
      if (cancelled) return;
      const restored = recoverOrphanDiaries(saved, entries, STORAGE_KEYS.doc);
      // 불러오기 전에 만든 다이어리가 있으면 앞쪽에 유지한다.
      setDiaries((current) => {
        const ids = new Set(restored.map((diary) => diary.id));
        return [...current.filter((diary) => !ids.has(diary.id)), ...restored];
      });
      setWritable(readable);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (writable) saveJSON(STORAGE_KEYS.diaries, diaries);
  }, [writable, diaries]);

  return { diaries, setDiaries, loaded };
}
