import { DiaryApiError } from './diaryApi.js';
const copy = value => JSON.parse(JSON.stringify(value));
const seeds = [
  { diaryId: 'mock-travel', diaryTitle: '여행 기록', coverColor: '#CED9EE', coverPattern: 'LINEN', visibility: 'PRIVATE', pageCount: 9 },
  { diaryId: 'mock-shared', diaryTitle: '함께 쓰는 일기', coverColor: '#9FB6D9', coverPattern: 'DOT', visibility: 'MEMBERS', pageCount: 5 },
].map(row => ({ ...row, myMembership: { isFavorite: false }, createdAt: '2026-10-24T01:00:00Z', updatedAt: '2026-10-24T02:00:00Z', version: '1', deletedAt: null }));
export function createMockDiaryTransport({ delay = 600, scenario = 'success', schedule = setTimeout, unschedule = clearTimeout, now = Date.now } = {}) {
  let mode = scenario, failures = 0, writeMode = 'success', writeFailures = 0, nextId = 0;
  const rows = copy(seeds), receipts = new Map();
  let clockOffset = 0;
  const serverNow = () => now() + clockOffset;
  const expired = row => Boolean(row.deletedAt) && Date.parse(row.expiresAt) <= serverNow();
  const serverRow = row => ({ ...row, retentionStatus: row.deletedAt ? (expired(row) ? 'EXPIRED' : 'RETAINED') : null, canRestore: Boolean(row.deletedAt) && !expired(row) });
  const transport = ({ path, signal, method = 'GET', body, query = {}, requestId }) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })); return; }
    const selectedMode = method === 'GET' ? mode : writeMode;
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
        const fail = selectedMode === 'error' || (selectedMode === 'fail-once' && (writing ? writeFailures++ : failures++) === 0);
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
        if (method === 'GET' && path === '/diaries') value = { items: selectedMode === 'empty' ? [] : rows.filter(item => Boolean(item.deletedAt) === (query.status === 'trashed')).map(serverRow), nextCursor: null, hasNext: false };
        else if (method === 'POST' && path === '/diaries') {
          if (!body?.diaryTitle?.trim()) throw new DiaryApiError('INVALID_TITLE', '제목을 입력해 주세요.', 400);
          const created = { ...copy(seeds[0]), diaryId: `mock-created-${++nextId}`, diaryTitle: body.diaryTitle.trim(), coverColor: body.coverColor,
            pageCount: body.initialPages?.length || 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          rows.push(created); value = { diary: created };
        } else {
          if (!row || (!writing && selectedMode === 'not-found')) throw new DiaryApiError('DIARY_NOT_FOUND', '다이어리를 찾을 수 없어요.', 404);
          if (method === 'GET') value = { diary: serverRow(row) };
          else if (method === 'PATCH') {
            if (row.deletedAt || body.expectedVersion !== row.version) throw new DiaryApiError('VERSION_CONFLICT', '최신 내용을 확인한 뒤 다시 저장해 주세요.', 409);
            if (!body.diaryTitle?.trim()) throw new DiaryApiError('INVALID_TITLE', '제목을 입력해 주세요.', 400);
            row.diaryTitle = body.diaryTitle.trim(); row.coverColor = body.coverColor;
            row.version = String(Number(row.version) + 1); row.updatedAt = new Date().toISOString(); value = { diary: row };
          } else if (method === 'DELETE' && query.permanent === true) {
            if (!row.deletedAt) throw new DiaryApiError('DIARY_NOT_TRASHED', '휴지통에 있는 다이어리만 영구 삭제할 수 있어요.', 409);
            rows.splice(rows.indexOf(row), 1); value = null;
          } else if (method === 'DELETE') {
            if (!row.deletedAt) { row.deletedAt = new Date(serverNow()).toISOString(); row.expiresAt = new Date(serverNow() + 30 * 86400000).toISOString(); }
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
    // 개발용 서버 시뮬레이터. 프론트 타이머나 실제 HTTP API에서는 호출하지 않는다.
    advanceServerTime(ms) { clockOffset += ms; },
    purgeExpired() { for (let index = rows.length - 1; index >= 0; index--) if (expired(rows[index])) rows.splice(index, 1); },
  };
}
