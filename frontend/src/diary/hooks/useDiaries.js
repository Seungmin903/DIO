import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import documentStorage from '../../editor/services/documentStorage';
import { saveJSON, STORAGE_KEYS } from '../../editor/services/storage';
import { forgetEditorDoc } from '../../editor/services/editorDocs';
import { forgetViewedPage } from '../../editor/services/editorViewState';
import { collectMediaIds } from '../../editor/utils/mediaReferences';
import * as mediaRepository from '../../editor/utils/mediaRepository';
import { collectPdfSourceIds } from '../utils/pdfSource';
import { removePdfSource } from '../utils/pdfSourceStore';
import { sweepPdfImports } from '../utils/pdfImportRegistry';
import { normalizeDiaries, recoverOrphanDiaries, sortByCreated } from '../utils/diaryLibrary';
import { isTrashExpired, markTrashed, purgeTrashedDiary } from '../utils/trashRetention';

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
        const raw = await documentStorage.getItem(STORAGE_KEYS.diaries);
        try { saved = normalizeDiaries(raw ? JSON.parse(raw) : []); } catch { saved = []; }
      } catch {
        readable = false;
      }
      let entries = [];
      try {
        const prefix = `${STORAGE_KEYS.doc}:`;
        const known = new Set(saved.map((diary) => `${prefix}${diary.id}`));
        const keys = (await documentStorage.getAllKeys()).filter((key) => key.startsWith(prefix) && !known.has(key));
        // 복구에는 문서 정보만 필요하므로 페이지 내용은 읽지 않는다. 옮기지 않은 옛 행은 그대로 읽는다.
        for (const key of keys) {
          try {
            const outline = await documentStorage.loadOutline(key);
            entries.push([key, outline ? JSON.stringify(outline) : await documentStorage.getItem(key)]);
          } catch { /* 읽지 못한 문서만 건너뛴다. */ }
        }
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

  // 여러 개를 한 번에 옮길 때는 저장 성공을 확인한 뒤에만 화면에 반영해 실패를 알릴 수 있게 한다.
  const moveManyToTrash = useCallback((ids) => enqueue(async () => {
    if (!writable || !ids.length) return false;
    const trashedAt = new Date().toISOString();
    if (!await saveJSON(STORAGE_KEYS.diaries, markTrashed(currentDiaries.current, ids, trashedAt))) return false;
    setTrashNow(Date.now());
    setDiaries(current => markTrashed(current, ids, trashedAt));
    return true;
  }), [enqueue, setDiaries, writable]);

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
        id, storage: documentStorage, keys: STORAGE_KEYS,
        getDiaries: () => currentDiaries.current, updateDiaries: setDiaries,
        forgetDoc: forgetEditorDoc, forgetView: forgetViewedPage, collectMediaIds, removeMedia: mediaRepository.remove,
        collectSourceIds: collectPdfSourceIds, removeSource: removePdfSource,
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

  // 앱을 켠 뒤 한 번, 휴지통 정리가 끝날 즈음에 어디에도 안 쓰는 불러온 PDF 의 쪽 그림 · 원본(고아 파일)을 지운다. 하루 안에 불러온 것은 건드리지 않는다.
  useEffect(() => {
    if (!loaded || !writable) return undefined;
    const timer = setTimeout(() => { sweepPdfImports().catch(() => {}); }, 10000);
    return () => clearTimeout(timer);
  }, [loaded, writable]);

  return {
    diaries,
    setDiaries,
    addDiary,
    loaded,
    moveToTrash,
    moveManyToTrash,
    restoreFromTrash,
    deletePermanently,
    renameDiary,
    trashNow,
    trashError,
    cleanupTrash,
  };
}
