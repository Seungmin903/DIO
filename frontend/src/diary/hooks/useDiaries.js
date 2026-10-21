import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveJSON, STORAGE_KEYS } from '../../editor/services/storage';
import { collectMediaIds } from '../../editor/utils/mediaReferences';
import * as mediaRepository from '../../editor/utils/mediaRepository';
import { normalizeDiaries, recoverOrphanDiaries, sortByCreated } from '../utils/diaryLibrary';

const readStoredValue = (raw) => {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
};

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
      // 이전 버전은 새 다이어리를 앞에 저장했으므로 생성 순으로 다시 정렬한다.
      setDiaries((current) => {
        const ids = new Set(restored.map((diary) => diary.id));
        return sortByCreated([...restored, ...current.filter((diary) => !ids.has(diary.id))]);
      });
      setWritable(readable);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (writable) saveJSON(STORAGE_KEYS.diaries, diaries);
  }, [writable, diaries]);

  const moveToTrash = useCallback((id) => {
    const trashedAt = new Date().toISOString();
    setDiaries((current) => current.map((diary) => (diary.id === id ? { ...diary, trashedAt } : diary)));
  }, []);

  const restoreFromTrash = useCallback((id) => {
    setDiaries((current) => sortByCreated(current.map((diary) => (diary.id === id ? { ...diary, trashedAt: null } : diary))));
  }, []);

  const renameDiary = useCallback((id, title) => {
    const updatedAt = new Date().toISOString();
    setDiaries((current) => current.map((diary) => (diary.id === id ? { ...diary, title, updatedAt } : diary)));
  }, []);

  const deletePermanently = useCallback(async (id) => {
    const targetKey = `${STORAGE_KEYS.doc}:${id}`;
    try {
      const targetRaw = await AsyncStorage.getItem(targetKey);
      const targetMedia = new Set(collectMediaIds(readStoredValue(targetRaw)));
      const allKeys = await AsyncStorage.getAllKeys();
      const referenceKeys = allKeys.filter((key) => (
        (key.startsWith(`${STORAGE_KEYS.doc}:`) && key !== targetKey)
        || key === STORAGE_KEYS.customDecor
      ));
      const references = referenceKeys.length ? await AsyncStorage.multiGet(referenceKeys) : [];
      const retainedMedia = new Set(references.flatMap(([, raw]) => collectMediaIds(readStoredValue(raw))));

      await AsyncStorage.removeItem(targetKey);
      setDiaries((current) => current.filter((diary) => diary.id !== id));

      // 다른 문서나 사용자 스티커가 함께 쓰는 원본은 남긴다. 미디어 정리 실패는
      // 다이어리 삭제를 되돌리지 않고 다음 정리 기회까지 고아 파일로 보존한다.
      await Promise.allSettled([...targetMedia]
        .filter((mediaId) => !retainedMedia.has(mediaId))
        .map((mediaId) => mediaRepository.remove(mediaId)));
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    diaries,
    setDiaries,
    loaded,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    renameDiary,
  };
}
