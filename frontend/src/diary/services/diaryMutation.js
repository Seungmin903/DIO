// 화면과 독립적인 명령 상태. 재시도는 같은 입력/요청 키를 사용하고 성공 항목은 다시 보내지 않는다.
const clone = value => JSON.parse(JSON.stringify(value));
const retryable = error => ![400, 401, 403, 404, 409, 410, 422].includes(error?.status);
const abortError = () => Object.assign(new Error('요청을 중단했어요.'), { name: 'AbortError' });
export function createDiaryMutation(execute, { makeRequestId } = {}) {
  let state = { status: 'idle', result: null, error: null, canRetry: false };
  let intent = null, active = null, generation = 0, sequence = 0;
  let controller = null;
  const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const listeners = new Set();
  const emit = next => { state = next; listeners.forEach(fn => fn()); };
  const perform = () => {
    if (active) return active;
    const run = generation, current = intent, previous = state.result;
    emit({ status: 'saving', result: state.result, error: null, canRetry: false });
    const signal = controller.signal;
    active = Promise.resolve().then(() => {
      if (signal.aborted) throw abortError();
      return execute(clone(current.input), { requestId: current.requestId, signal });
    })
      .then(result => {
        if (run !== generation) return;
        if (previous?.failed && result?.failed) result = {
          succeeded: [...new Set([...previous.succeeded, ...result.succeeded])],
          failed: [...previous.failed.filter(item => !current.input.ids.includes(item.id)), ...result.failed],
        };
        const failed = result?.failed || [];
        emit({ status: failed.length ? 'partial' : 'success', result, error: null,
          canRetry: failed.some(item => retryable(item.error)) });
      }).catch(error => {
        if (run === generation) emit({ status: 'error', result: state.result, error, canRetry: retryable(error) });
      }).finally(() => { if (run === generation) active = null; });
    return active;
  };
  const reset = () => {
    generation++; controller?.abort(); controller = null; active = null; intent = null;
    emit({ status: 'idle', result: null, error: null, canRetry: false });
  };
  return {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    run(input) {
      if (active) return active;
      // 결과 확인이 필요한 기존 요청을 새 키로 덮어쓰지 않는다.
      if (state.canRetry) return Promise.resolve();
      controller = new AbortController();
      intent = { input: clone(input), requestId: makeRequestId?.() || `${session}-${++sequence}` };
      emit({ status: 'idle', result: null, error: null, canRetry: false });
      return perform();
    },
    retry() {
      if (active) return active;
      if (!intent || !state.canRetry) return Promise.resolve();
      if (state.status === 'partial') {
        intent.input.ids = state.result.failed.filter(item => retryable(item.error)).map(item => item.id);
      }
      return perform();
    },
    getPendingInput: () => state.canRetry && intent ? clone(intent.input) : null,
    // 같은 계정의 폼 닫기는 미확인 요청을 보존한다. 재개 시 같은 키로 확인한다.
    dismiss() { if (!active && !state.canRetry) reset(); },
    // 계정 경계/언마운트: 전송 대기 작업 중단 및 늦은 결과 무시. 이미 처리된 서버 변경은 되돌리지 않는다.
    reset,
  };
}

// 일괄 API 확정 전 순차 단건 호출 경계. 동시 요청 수=1, 성공/실패 ID를 각각 반환한다.
export function createDiaryCommand(api) {
  return async (input, options) => {
    if (options.signal?.aborted) throw abortError();
    if (input.kind === 'create') return api.create(input.values, options);
    if (input.kind === 'update') return api.update(input.id, input.values, options);
    if (!['trash', 'restore', 'permanentlyDelete'].includes(input.kind)) throw new Error('지원하지 않는 작업이에요.');
    const succeeded = [], failed = [];
    for (const id of [...new Set(input.ids)]) {
      if (options.signal?.aborted) throw abortError();
      try { await api[input.kind](id, { ...options, requestId: `${options.requestId}:${id}` }); succeeded.push(id); }
      catch (error) {
        if (options.signal?.aborted || error.name === 'AbortError') throw abortError();
        failed.push({ id, error });
      }
    }
    return { succeeded, failed };
  };
}
