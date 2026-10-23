import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveJSON, STORAGE_KEYS } from '../../editor/services/storage';
import { forgetEditorDoc } from '../../editor/services/editorDocs';
import { collectMediaIds } from '../../editor/utils/mediaReferences';
import * as mediaRepository from '../../editor/utils/mediaRepository';
import { normalizeDiaries, recoverOrphanDiaries, sortByCreated } from '../utils/diaryLibrary';
import { isTrashExpired, purgeTrashedDiary } from '../utils/trashRetention';

/** 다이어리 목록 + 기기 저장소 자동 저장. 편집 문서만 남은 다이어리는 목록에 되살린다. */
export function useDiaries() {
  const [diaries, setDiaryState] = useState([]);
  const currentDiaries = useRef([]);
  const writeQueue = useRef(Promise.resolve());
  const deleting = useRef(new Set());
  const sweeping = useRef(false);
  const [trashNow, setTrashNow] = useState(Date.now);
  const [trashError, setTrashError] = useState(null);
  const setDiaries = useCallback((next) => {
    const value = typeof next === 'function' ? next(currentDiaries.current) : next;
    currentDiaries.current = value;
    setDiaryState(value);
  }, []);
  const enqueue = useCallback((action) => {
    const result = writeQueue.current.then(action);
    writeQueue.current = result.catch(() => {});
    return result;
  }, []);
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
  }, [setDiaries]);

  useEffect(() => {
    if (writable) enqueue(() => saveJSON(STORAGE_KEYS.diaries, currentDiaries.current));
  }, [writable, diaries, enqueue]);

  const moveToTrash = useCallback((id) => {
    setTrashNow(Date.now());
    const trashedAt = new Date().toISOString();
    setDiaries((current) => current.map((diary) => (diary.id === id && !diary.trashedAt ? { ...diary, trashedAt } : diary)));
  }, [setDiaries]);

  const restoreFromTrash = useCallback((id) => {
    const target = currentDiaries.current.find(diary => diary.id === id);
    if (!target?.trashedAt || deleting.current.has(id) || isTrashExpired(target)) return false;
    setDiaries((current) => sortByCreated(current.map((diary) => (diary.id === id ? { ...diary, trashedAt: null } : diary))));
    return true;
  }, [setDiaries]);

  const renameDiary = useCallback((id, title) => {
    const updatedAt = new Date().toISOString();
    setDiaries((current) => current.map((diary) => (diary.id === id ? { ...diary, title, updatedAt } : diary)));
  }, [setDiaries]);

  const addDiary = useCallback((diary) => enqueue(async () => {
    if (!writable) return false;
    const append = current => sortByCreated([...current.filter(item => item.id !== diary.id), diary]);
    if (!await saveJSON(STORAGE_KEYS.diaries, append(currentDiaries.current))) return false;
    setDiaries(append);
    return true;
  }), [enqueue, setDiaries, writable]);

  const deletePermanently = useCallback(async (id) => {
    if (!writable || deleting.current.has(id)) return false;
    deleting.current.add(id);
    try {
      return await enqueue(() => purgeTrashedDiary({
        id, storage: AsyncStorage, keys: STORAGE_KEYS,
        getDiaries: () => currentDiaries.current, updateDiaries: setDiaries,
        forgetDoc: forgetEditorDoc, collectMediaIds, removeMedia: mediaRepository.remove,
      }));
    } finally { deleting.current.delete(id); }
  }, [enqueue, setDiaries, writable]);

  const cleanupTrash = useCallback(async () => {
    if (!loaded || !writable || sweeping.current) return;
    sweeping.current = true;
    const now = Date.now();
    setTrashNow(now);
    try {
      const expired = currentDiaries.current.filter(diary => isTrashExpired(diary, now));
      const results = [];
      for (const diary of expired) results.push(await deletePermanently(diary.id));
      setTrashError(results.includes(false) ? '기한이 지난 다이어리를 정리하지 못했어요. 저장 공간과 권한을 확인하고 다시 시도해 주세요.' : null);
    } finally { sweeping.current = false; }
  }, [loaded, writable, deletePermanently]);

  useEffect(() => {
    if (!loaded || !writable) return undefined;
    cleanupTrash();
    // 닫힌 앱에서 백그라운드 실행을 약속하지 않는다. 복귀 시 즉시, 실행 중에는 1분마다 점검한다.
    const timer = setInterval(() => { if (AppState.currentState === 'active') cleanupTrash(); }, 60000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') cleanupTrash(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [loaded, writable, cleanupTrash]);

  return {
    diaries,
    setDiaries,
    addDiary,
    loaded,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    renameDiary,
    trashNow,
    trashError,
    cleanupTrash,
  };
}
