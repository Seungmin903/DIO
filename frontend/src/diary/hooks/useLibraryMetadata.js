import { useEffect, useState } from 'react';
import { loadEditorDoc } from '../../editor/services/editorDocs';
import { createDefaultDoc } from '../../editor/state/defaultDoc';

// 정렬용 요약만 보관한다. 이미지·속지는 로드하지 않고 진입 시 저장된 문서를 읽는다.
export function useLibraryMetadata(diaries, page = 'library') {
  const [metadata, setMetadata] = useState({});
  useEffect(() => {
    if (page !== 'library') return undefined;
    let cancelled = false;
    (async () => {
      const next = {};
      for (const diary of diaries) {
        try {
          const doc = await loadEditorDoc(diary) ?? createDefaultDoc(diary);
          next[diary.id] = { pageCount: doc.pages.length, updatedAt: doc.updatedAt };
        } catch { /* 읽기 실패를 빈 문서로 저장하지 않는다. */ }
        if (cancelled) return;
      }
      if (!cancelled) setMetadata(next);
    })();
    return () => { cancelled = true; };
  }, [diaries, page]);
  return metadata;
}
