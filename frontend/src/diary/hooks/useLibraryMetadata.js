import { useEffect, useState } from 'react';
import { loadEditorDoc } from '../../editor/services/editorDocs';
import { createDefaultDoc } from '../../editor/state/defaultDoc';

// 정렬·카드 표시용 요약만 보관한다. 이미지·속지는 로드하지 않고 진입 시 저장된 문서를 읽는다.
export function useLibraryMetadata(diaries, page = 'library') {
  const [metadata, setMetadata] = useState({});
  useEffect(() => {
    if (page !== 'library') return undefined;
    let cancelled = false;
    (async () => {
      const next = {};
      for (const diary of diaries) {
        try {
          const saved = await loadEditorDoc(diary);
          if (!saved && diary.source === 'member-api') {
            next[diary.id] = { pageCount: diary.pageCount ?? null, updatedAt: diary.updatedAt };
            continue;
          }
          const doc = saved ?? createDefaultDoc(diary);
          next[diary.id] = { pageCount: doc.pages.length, updatedAt: doc.updatedAt };
        } catch {
          // 실패를 0페이지로 표시하거나 이전 요약을 현재 값으로 남기지 않는다.
          next[diary.id] = { pageCount: null };
        }
        if (cancelled) return;
      }
      if (!cancelled) setMetadata(next);
    })();
    return () => { cancelled = true; };
  }, [diaries, page]);
  return metadata;
}
