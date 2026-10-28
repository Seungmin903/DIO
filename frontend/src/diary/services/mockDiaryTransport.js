import { DiaryApiError } from './diaryApi.js';
const copy = value => JSON.parse(JSON.stringify(value));
const seeds = [
  { diaryId: 'mock-travel', diaryTitle: '여행 기록', coverColor: '#CED9EE', coverPattern: 'LINEN', visibility: 'PRIVATE', pageCount: 9, canEdit: true },
  { diaryId: 'mock-shared', diaryTitle: '함께 쓰는 일기', coverColor: '#9FB6D9', coverPattern: 'DOT', visibility: 'MEMBERS', pageCount: 5, canEdit: false },
].map(row => ({ ...row, myMembership: { isFavorite: false }, createdAt: '2026-10-24T01:00:00Z', updatedAt: '2026-10-24T02:00:00Z', version: '1', deletedAt: null }));
export function createMockDiaryTransport({ delay = 600, scenario = 'success', schedule = setTimeout, unschedule = clearTimeout, now = Date.now, initialRows = seeds } = {}) {
  let mode = scenario, failures = 0, writeMode = 'success', writeFailures = 0, nextId = 0;
  let pageSize = null, moreMode = 'success', moreFailures = 0, cursorSerial = 0;
  const cursors = new Map();
  const rows = copy(initialRows), receipts = new Map();
  let clockOffset = 0;
  const serverNow = () => now() + clockOffset;
  const expired = row => Boolean(row.deletedAt) && Date.parse(row.expiresAt) <= serverNow();
  const serverRow = row => ({ ...row, retentionStatus: row.deletedAt ? (expired(row) ? 'EXPIRED' : 'RETAINED') : null, canRestore: Boolean(row.deletedAt) && !expired(row), canPermanentlyDelete: Boolean(row.deletedAt) });
  const transport = ({ path, signal, method = 'GET', body, query = {}, requestId }) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })); return; }
    const pagedMore = method === 'GET' && path === '/diaries' && Boolean(query.cursor);
    const selectedMode = pagedMore ? moreMode : method === 'GET' ? mode : writeMode;
    const abort = () => { unschedule(timer); reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })); };
    const timer = schedule(() => {
      signal?.removeEventListener('abort', abort);
      try {
        const writing = method !== 'GET';
        const receiptKey = `${method}:${path}:${JSON.stringify(query)}:${requestId}`, signature = JSON.stringify(body ?? null);
        if (writing && requestId && receipts.has(receiptKey)) {
          const receipt = receipts.get(receiptKey);
          if (receipt.signature !== signature) throw new DiaryApiError('REQUEST_CONFLICT', '같은 요청 키에 다른 입력을 보낼 수 없어요.', 409);
          resolve(copy(receipt.value)); return;
        }
        const fail = selectedMode === 'error' || (selectedMode === 'fail-once' && (writing ? writeFailures++ : pagedMore ? moreFailures++ : failures++) === 0);
        if (fail) throw new DiaryApiError('MOCK_UNAVAILABLE', '요청을 처리하지 못했어요. 다시 시도해 주세요.', 503);
        if (writing && selectedMode === 'forbidden') throw new DiaryApiError('FORBIDDEN', '이 작업을 할 권한이 없어요.', 403);
        if (writing && selectedMode === 'conflict') throw new DiaryApiError('VERSION_CONFLICT', '다른 변경이 있어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.', 409);
        if (writing && selectedMode === 'expired') {
          const target = rows.find(item => path === `/diaries/${encodeURIComponent(item.diaryId)}/restore`);
          if (target?.deletedAt) target.expiresAt = new Date(serverNow()).toISOString();
          throw new DiaryApiError('RESTORE_EXPIRED', '복원 가능한 기간이 지났어요.', 410);
        }
        if (writing && selectedMode === 'partial' && path.includes('mock-shared')) throw new DiaryApiError('MOCK_UNAVAILABLE', '이 항목을 처리하지 못했어요.', 503);
        let value;
        const row = rows.find(item => path === `/diaries/${encodeURIComponent(item.diaryId)}` || path === `/diaries/${encodeURIComponent(item.diaryId)}/restore`);
        if (method === 'GET' && path === '/diaries') {
          const needle = String(query.q || '').trim().toLocaleLowerCase('ko');
          const items = rows.filter(item => Boolean(item.deletedAt) === (query.status === 'trashed')
            && (!needle || item.diaryTitle.toLocaleLowerCase('ko').includes(needle))
            && (query.favorite === undefined || item.myMembership?.isFavorite === (String(query.favorite) === 'true')));
          const stamp = value => Date.parse(value) || 0;
          if (query.sort) items.sort((a, b) => {
            const order = query.sort === 'titleAsc' ? a.diaryTitle.localeCompare(b.diaryTitle, 'ko', { numeric: true })
              : query.sort === 'pageCountDesc' ? (b.pageCount || 0) - (a.pageCount || 0)
              : query.sort === 'createdAtDesc' ? stamp(b.createdAt) - stamp(a.createdAt)
              : stamp(b.updatedAt) - stamp(a.updatedAt);
            return order || a.diaryId.localeCompare(b.diaryId);
          });
          const scope = JSON.stringify({ status: query.status || 'active', q: query.q || '', sort: query.sort || '', favorite: query.favorite });
          const boundary = query.cursor ? cursors.get(query.cursor) : null;
          if (query.cursor && (!boundary || boundary.scope !== scope || !pageSize)) {
            throw new DiaryApiError('INVALID_CURSOR', '목록 기준이 바뀌었어요. 새로고침해 주세요.', 400);
          }
          const start = boundary ? items.findIndex(item => item.diaryId === boundary.after) + 1 : 0;
          if (boundary && start === 0) throw new DiaryApiError('INVALID_CURSOR', '목록이 변경됐어요. 새로고침해 주세요.', 400);
          // 휴지통과 기존 검증 화면은 단일 페이지를 유지한다. 활성 보관함만 선택적으로 분할한다.
          const limit = query.status === 'active' && pageSize ? pageSize : items.length;
          const page = selectedMode === 'empty' ? [] : items.slice(start, start + limit);
          const hasNext = page.length > 0 && start + page.length < items.length;
          let nextCursor = null;
          if (hasNext) { nextCursor = `mock-page-${++cursorSerial}`; cursors.set(nextCursor, { scope, after: page.at(-1).diaryId }); }
          value = { items: page.map(serverRow), nextCursor, hasNext };
        }
        else if (method === 'POST' && path === '/diaries') {
          if (!body?.diaryTitle?.trim()) throw new DiaryApiError('INVALID_TITLE', '제목을 입력해 주세요.', 400);
          const created = { ...copy(seeds[0]), diaryId: `mock-created-${++nextId}`, diaryTitle: body.diaryTitle.trim(), coverColor: body.coverColor,
            ...(body.coverPattern !== undefined ? { coverPattern: body.coverPattern } : {}),
            orientation: body.orientation || 'landscape', templateConfig: copy(body.templateConfig ?? null), paperAppearance: copy(body.paperAppearance ?? null),
            pageCount: body.initialPages?.length || 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          rows.push(created); value = { diary: created, firstPageId: body.initialPages?.length ? `${created.diaryId}-page-1` : null };
        } else {
          if (!row || (!writing && selectedMode === 'not-found')) throw new DiaryApiError('DIARY_NOT_FOUND', '다이어리를 찾을 수 없어요.', 404);
          if (method === 'GET') value = { diary: serverRow(row) };
          else if (method === 'PATCH') {
            if (row.canEdit === false) throw new DiaryApiError('FORBIDDEN', '이 다이어리를 수정할 권한이 없어요.', 403);
            if (row.deletedAt || body.expectedVersion !== row.version) throw new DiaryApiError('VERSION_CONFLICT', '최신 내용을 확인한 뒤 다시 저장해 주세요.', 409);
            if (!body.diaryTitle?.trim()) throw new DiaryApiError('INVALID_TITLE', '제목을 입력해 주세요.', 400);
            row.diaryTitle = body.diaryTitle.trim(); row.coverColor = body.coverColor;
            if (body.coverPattern !== undefined) row.coverPattern = body.coverPattern;
            row.version = String(Number(row.version) + 1); row.updatedAt = new Date().toISOString(); value = { diary: row };
          } else if (method === 'DELETE' && query.permanent === true) {
            if (!row.deletedAt) throw new DiaryApiError('DIARY_NOT_TRASHED', '휴지통에 있는 다이어리만 영구 삭제할 수 있어요.', 409);
            rows.splice(rows.indexOf(row), 1); value = null;
          } else if (method === 'DELETE') {
            if (!row.deletedAt) { const deletedAt = serverNow(); row.deletedAt = new Date(deletedAt).toISOString(); row.expiresAt = new Date(deletedAt + 30 * 86400000).toISOString(); }
            value = null;
          }
          else if (method === 'POST' && path.endsWith('/restore')) {
            if (expired(row)) throw new DiaryApiError('RESTORE_EXPIRED', '복원 가능한 기간이 지났어요.', 410);
            row.deletedAt = null; row.expiresAt = null; value = null;
          }
          else throw new DiaryApiError('INVALID_REQUEST', '지원하지 않는 요청이에요.', 400);
        }
        if (writing && requestId) receipts.set(receiptKey, { signature, value: copy(value) });
        if (writing && selectedMode === 'response-lost') throw new DiaryApiError('NETWORK_ERROR', '응답을 받지 못했어요. 같은 요청으로 다시 확인해 주세요.');
        resolve(copy(value));
      } catch (error) { reject(error); }
    }, delay);
    signal?.addEventListener('abort', abort, { once: true });
  });
  return { transport, setScenario(value) { mode = value; failures = 0; }, setWriteScenario(value) { writeMode = value; writeFailures = 0; },
    setMoreScenario(value) { moreMode = value; moreFailures = 0; },
    invalidateCursors() { cursors.clear(); },
    setPagination(enabled) {
      pageSize = enabled ? 2 : null; cursors.clear();
      if (enabled) for (let index = 1; index <= 4; index++) {
        const id = `mock-page-sample-${index}`;
        if (!rows.some(row => row.diaryId === id)) rows.push({ ...copy(seeds[0]), diaryId: id, diaryTitle: `페이지 샘플 ${index}`, myMembership: { isFavorite: index % 2 === 0 } });
      }
    },
    simulateEdit(id, changes = {}) {
      const row = rows.find(item => item.diaryId === id);
      if (!row) return;
      Object.assign(row, changes, { version: String(Number(row.version) + 1), updatedAt: new Date(serverNow()).toISOString() });
    },
    // 개발용 서버 시뮬레이터. 프론트 타이머나 실제 HTTP API에서는 호출하지 않는다.
    advanceServerTime(ms) { clockOffset += ms; },
    purgeExpired() { for (let index = rows.length - 1; index >= 0; index--) if (expired(rows[index])) rows.splice(index, 1); },
  };
}
