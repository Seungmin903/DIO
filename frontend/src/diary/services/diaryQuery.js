// React 밖에서 요청 경합·취소·재시도를 검증할 수 있는 읽기 상태 저장소.
export function createDiaryQuery(load) {
  let snapshot = { status: 'idle', data: null, error: null };
  let generation = 0;
  let controller;
  let lastArgs = [];
  const listeners = new Set();
  const publish = next => { snapshot = next; listeners.forEach(listener => listener()); };
  const cancel = () => { generation += 1; controller?.abort(); };
  const run = async (...args) => {
    cancel();
    lastArgs = args;
    const request = generation;
    controller = new AbortController();
    publish({ ...snapshot, status: 'loading', error: null });
    try {
      // list(options)와 get(id, options) 모두 마지막 옵션에 취소 신호를 합친다.
      const callArgs = [...args];
      const last = callArgs[callArgs.length - 1];
      if (last && typeof last === 'object' && !Array.isArray(last)) {
        callArgs[callArgs.length - 1] = { ...last, signal: controller.signal };
      } else callArgs.push({ signal: controller.signal });
      const data = await load(...callArgs);
      if (request === generation) publish({ status: 'success', data, error: null });
    } catch (error) {
      if (request === generation && error.name !== 'AbortError') publish({ ...snapshot, status: 'error', error });
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    run, retry: () => run(...lastArgs), cancel,
    reset() { cancel(); publish({ status: 'idle', data: null, error: null }); },
  };
}
