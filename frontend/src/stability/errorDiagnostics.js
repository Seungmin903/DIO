// Diagnostic metadata only: never persist messages, stacks, URLs, content, tokens or account IDs.
export const DIAGNOSTICS_KEY = 'dio:app-error-diagnostics:v1';
export const DIAGNOSTICS_LIMIT = 20;
export const DIAGNOSTICS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCES = new Set(['render', 'global', 'web_error', 'unhandled_rejection']);
const ERROR_TYPES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'AggregateError']);

export function createErrorDiagnostics({ storage, now = Date.now, platform = 'unknown', appVersion = 'unknown' }) {
  let entries = [], loaded = false, loading = null, writing = null, dirty = false, sequence = 0;
  const safePlatform = ['android', 'ios', 'web'].includes(platform) ? platform : 'unknown';
  const safeVersion = /^\d+\.\d+\.\d+$/.test(appVersion) ? appVersion : 'unknown';
  const clean = value => {
    if (!value || typeof value !== 'object' || !Number.isFinite(value.time)
      || value.time > now() || now() - value.time >= DIAGNOSTICS_TTL_MS
      || !SOURCES.has(value.source) || !/^[a-z0-9-]{1,64}$/.test(value.id || '')) return null;
    return { id: value.id, time: value.time, source: value.source, fatal: value.fatal === true,
      errorType: ERROR_TYPES.has(value.errorType) ? value.errorType : 'UnknownError',
      platform: ['android', 'ios', 'web'].includes(value.platform) ? value.platform : 'unknown',
      appVersion: /^\d+\.\d+\.\d+$/.test(value.appVersion) ? value.appVersion : 'unknown' };
  };
  const prune = values => values.map(clean).filter(Boolean).slice(-DIAGNOSTICS_LIMIT);
  const load = () => {
    if (loaded) return Promise.resolve();
    if (!loading) loading = (async () => {
      let previous = [];
      try {
        const raw = await storage.getItem(DIAGNOSTICS_KEY);
        if (raw && raw.length <= 32768) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) previous = prune(parsed);
        }
      } catch { /* Diagnostics must not prevent startup or recovery. */ }
      entries = prune([...previous, ...entries]);
      loaded = true;
    })();
    return loading;
  };
  const flush = () => {
    if (!writing) writing = (async () => {
      await load();
      while (dirty) {
        dirty = false;
        entries = prune(entries);
        await storage.setItem(DIAGNOSTICS_KEY, JSON.stringify(entries));
      }
    })().catch(() => {}).finally(() => {
      writing = null;
      if (dirty) void flush();
    });
    return writing;
  };
  return {
    report(error, { source = 'global', fatal = false } = {}) {
      let errorType = 'UnknownError';
      try { if (ERROR_TYPES.has(error?.name)) errorType = error.name; } catch { /* A thrown value can have unsafe getters. */ }
      entries.push({ id: `${now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        time: now(), source: SOURCES.has(source) ? source : 'global', fatal: fatal === true,
        errorType, platform: safePlatform, appVersion: safeVersion });
      entries = prune(entries);
      dirty = true;
      return flush();
    },
    async read() {
      await load();
      // Reading at startup also removes expired or malformed rows from the owned key.
      entries = prune(entries);
      dirty = true;
      await flush();
      return entries.map(entry => ({ ...entry }));
    },
  };
}
