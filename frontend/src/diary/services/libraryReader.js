import { createDiaryQuery } from './diaryQuery.js';

const sorts = { updated: 'updatedAtDesc', created: 'createdAtDesc', pages: 'pageCountDesc', title: 'titleAsc' };
export function libraryRequest({ filter = 'personal', query = '', sort = 'updated' } = {}) {
  return { status: 'active', q: query.trim(), sort: sorts[sort] || sorts.updated,
    ...(filter === 'favorite' ? { favorite: true } : {}) };
}

// 조회 조건은 UI가 소유하고, 이 저장소는 조건별 응답과 재시도를 관리한다. 로컬 저장소 접근 없음.
export function createLibraryReader(api) {
  const list = createDiaryQuery(api.list), detail = createDiaryQuery(api.get);
  let options = null, selectedId = null, disposed = false, navigation = 0;
  const listeners = new Set();
  let snapshot;
  const publish = () => {
    snapshot = { list: list.getSnapshot(), detail: detail.getSnapshot(), selectedId };
    listeners.forEach(fn => fn());
  };
  let unsubscribe = [list.subscribe(publish), detail.subscribe(publish)];
  publish();
  const close = () => { navigation++; selectedId = null; detail.reset(); };
  const open = id => {
    if (disposed) return Promise.resolve();
    navigation++; selectedId = id; detail.reset(); return detail.run(id);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    activate() {
      if (!disposed) return;
      disposed = false;
      unsubscribe = [list.subscribe(publish), detail.subscribe(publish)];
      publish();
    },
    load(input) {
      if (disposed) return Promise.resolve();
      const next = libraryRequest(input);
      if (JSON.stringify(options) !== JSON.stringify(next)) {
        options = next; close(); list.reset();
      }
      return list.run({ query: options });
    },
    refresh: () => disposed ? Promise.resolve() : list.retry(),
    async refreshAndOpen(id) {
      if (disposed) return;
      const current = ++navigation;
      await list.retry();
      // 저장 후 재조회 중 사용자가 이동하거나 다른 대상을 고르면 자동 진입을 취소한다.
      if (!disposed && navigation === current) return open(id);
    },
    open,
    retryDetail: () => disposed ? Promise.resolve() : detail.retry(),
    close,
    dispose() {
      disposed = true; list.reset(); close(); unsubscribe.forEach(fn => fn()); listeners.clear();
    },
  };
}
