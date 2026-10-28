import { createDiaryQuery } from './diaryQuery.js';
import { DiaryApiError } from './diaryApi.js';

const sorts = { updated: 'updatedAtDesc', created: 'createdAtDesc', pages: 'pageCountDesc', title: 'titleAsc' };
const requiresFirstPage = error => ['INVALID_CURSOR', 'INVALID_RESPONSE'].includes(error?.code);
export function libraryRequest({ filter = 'personal', query = '', sort = 'updated' } = {}) {
  return { status: 'active', q: query.trim(), sort: sorts[sort] || sorts.updated,
    ...(filter === 'favorite' ? { favorite: true } : {}) };
}

// 조회 조건은 UI가 소유하고, 이 저장소는 조건별 응답과 재시도를 관리한다. 로컬 저장소 접근 없음.
export function createLibraryReader(api, { makeRequest = libraryRequest } = {}) {
  const list = createDiaryQuery(api.list), detail = createDiaryQuery(api.get);
  const more = createDiaryQuery(async request => {
    const page = await api.list(request);
    if (page.hasNext && (page.nextCursor === request.query.cursor || consumed.has(page.nextCursor))) {
      throw new DiaryApiError('INVALID_RESPONSE', '다음 목록 기준이 반복돼요. 목록을 새로고침해 주세요.');
    }
    return page;
  });
  let options = null, selectedId = null, disposed = false, navigation = 0, generation = 0;
  let data = null;
  const consumed = new Set();
  const listeners = new Set();
  let snapshot;
  const publish = () => {
    snapshot = { list: { ...list.getSnapshot(), data }, detail: detail.getSnapshot(), selectedId, more: more.getSnapshot(),
      moreRequiresRefresh: requiresFirstPage(more.getSnapshot().error) };
    listeners.forEach(fn => fn());
  };
  let unsubscribe = [list.subscribe(publish), detail.subscribe(publish), more.subscribe(publish)];
  publish();
  const close = () => { navigation++; selectedId = null; detail.reset(); };
  const open = id => {
    if (disposed) return Promise.resolve();
    navigation++; selectedId = id; detail.reset(); return detail.run(id);
  };
  const first = async () => {
    if (disposed) return;
    const request = ++generation;
    more.reset();
    await list.run({ query: options || makeRequest() });
    if (!disposed && request === generation && list.getSnapshot().status === 'success') {
      const result = list.getSnapshot().data;
      data = { ...result, items: [...new Map(result.items.map(row => [row.id, row])).values()] };
      consumed.clear(); publish();
    }
  };
  const reader = {
    getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    activate() {
      if (!disposed) return;
      disposed = false;
      unsubscribe = [list.subscribe(publish), detail.subscribe(publish), more.subscribe(publish)];
      publish();
    },
    load(input) {
      if (disposed) return Promise.resolve();
      const next = makeRequest(input);
      if (JSON.stringify(options) !== JSON.stringify(next)) {
        options = next; data = null; close(); list.reset();
      }
      return first();
    },
    refresh: first,
    async loadMore() {
      if (disposed || list.getSnapshot().status !== 'success' || more.getSnapshot().status === 'loading' || !data?.hasNext) return;
      if (requiresFirstPage(more.getSnapshot().error)) return;
      const request = generation, cursor = data.nextCursor;
      await more.run({ query: { ...options, cursor } });
      if (!disposed && request === generation && more.getSnapshot().status === 'success') {
        const result = more.getSnapshot().data;
        consumed.add(cursor);
        data = { ...result, items: [...new Map(data.items.concat(result.items).map(row => [row.id, row])).values()] };
        publish();
      }
    },
    retryMore: () => requiresFirstPage(more.getSnapshot().error) ? first() : reader.loadMore(),
    async refreshAndOpen(id) {
      if (disposed) return;
      const current = ++navigation;
      await first();
      // 저장 후 재조회 중 사용자가 이동하거나 다른 대상을 고르면 자동 진입을 취소한다.
      if (!disposed && navigation === current) return open(id);
    },
    open,
    retryDetail: () => disposed ? Promise.resolve() : detail.retry(),
    close,
    dispose() {
      disposed = true; generation++; data = null; consumed.clear();
      list.reset(); more.reset(); close(); unsubscribe.forEach(fn => fn()); listeners.clear();
    },
  };
  return reader;
}
