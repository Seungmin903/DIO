import { DiaryApiError } from './diaryApi.js';
import { createDiaryCommand, createDiaryMutation } from './diaryMutation.js';

export function diaryUpdateInput(form, source) {
  const title = form.title?.trim();
  if (!title) throw new DiaryApiError('INVALID_TITLE', '다이어리 이름을 입력해 주세요.', 400);
  if (source?.version == null) throw new DiaryApiError('INVALID_VERSION', '수정 버전을 확인하지 못했어요. 최신 정보를 다시 확인해 주세요.', 409);
  return { title, color: form.color, pattern: form.pattern ?? null, version: source.version };
}

const empty = () => ({ visible: false, source: null, loadStatus: 'idle', loadError: null,
  latestStatus: 'idle', latest: null, latestError: null, needsReview: false, permissionBlocked: false });
export function createDiaryEditor(api, makeInput = diaryUpdateInput) {
  const mutation = createDiaryMutation(createDiaryCommand(api));
  let state = empty(), version, targetId, generation = 0, controller, snapshot;
  const listeners = new Set();
  const publish = () => { snapshot = { ...state, mutation: mutation.getSnapshot() }; listeners.forEach(fn => fn()); };
  mutation.subscribe(() => {
    const error = mutation.getSnapshot().error;
    if (error?.status === 409) state = { ...state, needsReview: true };
    if ([401, 403, 404, 410].includes(error?.status)) state = { ...state, permissionBlocked: true };
    publish();
  });
  const reset = () => { generation++; controller?.abort(); state = empty(); version = undefined; targetId = null; mutation.reset(); };
  const permitted = row => {
    if (row?.id !== targetId) throw new DiaryApiError('INVALID_RESPONSE', '요청한 다이어리와 조회 결과가 달라요.');
    if (row.trashedAt) throw new DiaryApiError('DIARY_TRASHED', '휴지통에 있는 다이어리는 수정할 수 없어요. 창을 닫고 휴지통에서 복원한 뒤 다시 수정해 주세요.', 410);
    if (row.canEdit !== true) throw new DiaryApiError('FORBIDDEN', '이 다이어리를 수정할 권한이 없어요.', 403);
    if (row.version == null) throw new DiaryApiError('INVALID_VERSION', '수정 버전을 확인하지 못했어요. 다시 조회해 주세요.');
    return row;
  };
  const load = async () => {
    controller?.abort(); controller = new AbortController(); const signal = controller.signal, run = ++generation;
    state = { ...state, visible: true, loadStatus: 'loading', loadError: null }; publish();
    try {
      const row = permitted(await api.get(targetId, { signal }));
      if (run !== generation) return;
      version = row.version; state = { ...state, source: row, loadStatus: 'success' }; publish();
    } catch (error) {
      if (run === generation) { state = { ...state, loadStatus: 'error', loadError: error }; publish(); }
    }
  };
  publish();
  return {
    getSnapshot: () => snapshot,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    open(id) {
      if (mutation.getSnapshot().status === 'saving') return Promise.resolve();
      // 미확인 수정은 다른 카드로 열어도 원래 폼을 이어간다.
      if (mutation.getPendingInput()) { state = { ...state, visible: true }; publish(); return Promise.resolve(); }
      reset(); targetId = id; return load();
    },
    retryLoad: load,
    close() {
      if (mutation.getSnapshot().status === 'saving') return;
      if (mutation.getPendingInput()) { state = { ...state, visible: false }; publish(); }
      else reset();
    },
    async submit(form) {
      if (!state.source || state.loadStatus !== 'success' || state.latestStatus === 'loading' || state.permissionBlocked || state.needsReview) return;
      if (mutation.getPendingInput()) return mutation.retry();
      const values = makeInput(form, { ...state.source, version });
      return mutation.run({ kind: 'update', id: state.source.id, values });
    },
    async refreshLatest() {
      if (!state.source || mutation.getSnapshot().status === 'saving') return;
      controller?.abort(); controller = new AbortController(); const signal = controller.signal, run = ++generation;
      state = { ...state, latestStatus: 'loading', latestError: null }; publish();
      try {
        const row = permitted(await api.get(targetId, { signal }));
        if (run !== generation) return;
        version = row.version;
        state = { ...state, latest: row, latestStatus: 'success', needsReview: false, permissionBlocked: false };
        mutation.reset(); // 원래 source와 폼 입력은 유지하고 재확인한 version만 바꾼다.
      } catch (error) {
        if (run === generation) {
          state = { ...state, latestStatus: 'error', latestError: error,
            permissionBlocked: state.permissionBlocked || [401, 403, 404, 410].includes(error.status) }; publish();
        }
      }
    },
    dispose() { reset(); listeners.clear(); },
  };
}
