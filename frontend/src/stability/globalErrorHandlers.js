const INSTALLATION = Symbol.for('dio.app-error-handlers.v1');

/** Observe failures without replacing the runtime's fatal-error behavior or browser defaults. */
export function installGlobalErrorHandlers({ runtime = globalThis, report, web = false }) {
  if (runtime[INSTALLATION]) return runtime[INSTALLATION];
  let reporting = false;
  const record = (error, details) => {
    if (reporting) return;
    reporting = true;
    try { Promise.resolve(report(error, details)).catch(() => {}); }
    catch { /* A failed reporter must not become a second application error. */ }
    finally { reporting = false; }
  };
  const errorUtils = runtime.ErrorUtils;
  const previous = errorUtils?.getGlobalHandler?.();
  let handler;
  if (typeof previous === 'function' && typeof errorUtils?.setGlobalHandler === 'function') {
    handler = (error, isFatal) => {
      record(error, { source: 'global', fatal: isFatal === true });
      return previous(error, isFatal);
    };
    errorUtils.setGlobalHandler(handler);
  }
  const onError = event => record(event.error, { source: 'web_error', fatal: false });
  const onRejection = event => record(event.reason, { source: 'unhandled_rejection', fatal: false });
  const observeWeb = web && typeof runtime.addEventListener === 'function' && typeof runtime.removeEventListener === 'function';
  if (observeWeb) {
    runtime.addEventListener('error', onError);
    runtime.addEventListener('unhandledrejection', onRejection);
  }
  const cleanup = () => {
    if (handler && errorUtils.getGlobalHandler() === handler) errorUtils.setGlobalHandler(previous);
    if (observeWeb) {
      runtime.removeEventListener('error', onError);
      runtime.removeEventListener('unhandledrejection', onRejection);
    }
    if (runtime[INSTALLATION] === cleanup) delete runtime[INSTALLATION];
  };
  runtime[INSTALLATION] = cleanup;
  return cleanup;
}
