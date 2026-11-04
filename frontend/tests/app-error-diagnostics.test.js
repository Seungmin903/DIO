import test from 'node:test';
import assert from 'node:assert/strict';
import { createErrorDiagnostics, DIAGNOSTICS_KEY, DIAGNOSTICS_LIMIT, DIAGNOSTICS_TTL_MS } from '../src/stability/errorDiagnostics.js';
import { installGlobalErrorHandlers } from '../src/stability/globalErrorHandlers.js';

const instant = Date.parse('2026-11-04T00:00:00Z');
function store(raw = null) {
  return { value: raw, writes: [], async getItem(key) { assert.equal(key, DIAGNOSTICS_KEY); return this.value; },
    async setItem(key, value) { assert.equal(key, DIAGNOSTICS_KEY); this.value = value; this.writes.push(value); } };
}

test('오류 진단에는 개인정보·예외 본문·스택·URL을 저장하지 않는다', async () => {
  const storage = store(), reporter = createErrorDiagnostics({ storage, now: () => instant, platform: 'android', appVersion: '1.0.0' });
  const error = Object.assign(new TypeError('secret@example.com Bearer token diary title'),
    { stack: 'https://private.test/?token=secret', userId: 42, email: 'secret@example.com' });
  await reporter.report(error, { source: 'render', fatal: false, accountId: 'secret' });
  const [row] = await reporter.read();
  assert.equal(row.errorType, 'TypeError'); assert.equal(row.source, 'render');
  assert.deepEqual(Object.keys(row).sort(), ['id', 'time', 'source', 'fatal', 'errorType', 'platform', 'appVersion'].sort());
  assert.doesNotMatch(storage.value, /secret|private|Bearer|diary title|stack|userId|accountId/);
});

test('오류 연속 발생은 최근 20개만 보관하고 쓰기를 합쳐 메모리 큐를 제한한다', async () => {
  const storage = store(), reporter = createErrorDiagnostics({ storage, now: () => instant });
  await Promise.all(Array.from({ length: 200 }, () => reporter.report(new Error('ignored'))));
  const rows = await reporter.read();
  assert.equal(rows.length, DIAGNOSTICS_LIMIT);
  assert.equal(new Set(rows.map(row => row.id)).size, DIAGNOSTICS_LIMIT);
  assert.ok(storage.writes.length < 10);
  assert.ok(storage.value.length < 8192);
});

test('앱 재시작 후 복원하고 다음 읽기에서 7일 지난 진단은 정리한다', async () => {
  const storage = store(); let now = instant;
  const first = createErrorDiagnostics({ storage, now: () => now });
  await first.report(new Error(), { source: 'global', fatal: true });
  now += 1000;
  const second = createErrorDiagnostics({ storage, now: () => now });
  assert.equal((await second.read())[0].fatal, true);
  now += DIAGNOSTICS_TTL_MS;
  assert.deepEqual(await second.read(), []);
  assert.equal(storage.value, '[]');
});

test('손상·과대 진단 캐시와 저장소 예외가 앱 실행·다음 기록을 막지 않는다', async () => {
  for (const raw of ['{broken', 'x'.repeat(32769), '{"not":"an array"}']) {
    const storage = store(raw), reporter = createErrorDiagnostics({ storage, now: () => instant });
    await reporter.report(null);
    assert.equal((await reporter.read()).length, 1);
  }
  const storage = { getItem() { throw new Error('storage unavailable'); }, setItem() { throw new Error('full'); } };
  const reporter = createErrorDiagnostics({ storage, now: () => instant });
  await assert.doesNotReject(reporter.report(new Error()));
  assert.equal((await reporter.read()).length, 1);
});

test('복원 시 허용된 필드만 남기며 오류 이름 getter가 실패해도 안전하다', async () => {
  const storage = store(JSON.stringify([{ id: 'old-1', time: instant, source: 'render', errorType: 'TypeError',
    fatal: false, platform: 'web', appVersion: '1.0.0', message: 'private', stack: 'private' }]));
  const reporter = createErrorDiagnostics({ storage, now: () => instant, platform: 'https://private', appVersion: 'secret' });
  await reporter.report(Object.defineProperty({}, 'name', { get() { throw new Error('getter'); } }));
  const rows = await reporter.read();
  assert.equal(rows.length, 2); assert.equal(rows[1].errorType, 'UnknownError');
  assert.equal(rows[1].platform, 'unknown'); assert.equal(rows[1].appVersion, 'unknown');
  assert.doesNotMatch(storage.value, /private|secret|message|stack/);
});

test('진단 저장 실패 후 다음 오류를 다시 저장할 수 있다', async () => {
  const storage = store(); let fail = true;
  storage.setItem = async function (_, value) { if (fail) throw new Error('temporary'); this.value = value; };
  const reporter = createErrorDiagnostics({ storage, now: () => instant });
  await reporter.report(new Error()); fail = false;
  await reporter.report(new TypeError());
  assert.equal(JSON.parse(storage.value).length, 2);
});

function nativeRuntime(previous) {
  let handler = previous;
  return { ErrorUtils: { getGlobalHandler: () => handler, setGlobalHandler: next => { handler = next; } } };
}

test('전역 예외는 기록 후 기존 핸들러에 같은 오류와 치명 여부를 전달한다', () => {
  const calls = [], error = new Error('private');
  const previous = (value, fatal) => { calls.push(['previous', value, fatal]); return 42; };
  const runtime = nativeRuntime(previous);
  const cleanup = installGlobalErrorHandlers({ runtime, report: (value, info) => calls.push(['report', value, info]) });
  assert.equal(runtime.ErrorUtils.getGlobalHandler()(error, true), 42);
  assert.equal(calls[0][0], 'report'); assert.equal(calls[1][0], 'previous');
  assert.equal(calls[1][1], error); assert.equal(calls[1][2], true);
  cleanup(); assert.equal(runtime.ErrorUtils.getGlobalHandler(), previous);
});

test('진단 수집기 오류를 삼켜도 기본 치명적 예외 처리는 삼키지 않는다', () => {
  const fatal = new Error('runtime fatal'); let calls = 0;
  const runtime = nativeRuntime(() => { calls++; throw fatal; });
  installGlobalErrorHandlers({ runtime, report: () => { throw new Error('report failed'); } });
  assert.throws(() => runtime.ErrorUtils.getGlobalHandler()(new Error(), true), error => error === fatal);
  assert.equal(calls, 1);
});

test('재설치·Fast Refresh는 전역 핸들러를 중복으로 쌓지 않는다', () => {
  let count = 0; const runtime = nativeRuntime(() => {});
  const first = installGlobalErrorHandlers({ runtime, report: () => count++ });
  const second = installGlobalErrorHandlers({ runtime, report: () => count++ });
  assert.equal(first, second); runtime.ErrorUtils.getGlobalHandler()(new Error(), false);
  assert.equal(count, 1);
  const newer = () => {}; runtime.ErrorUtils.setGlobalHandler(newer); first();
  assert.equal(runtime.ErrorUtils.getGlobalHandler(), newer);
});

test('웹 오류·처리되지 않은 Promise 거부는 기본 동작을 취소하지 않고 관찰한다', async () => {
  const listeners = new Map(), rows = [];
  const runtime = { addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { assert.equal(listeners.get(name), fn); listeners.delete(name); } };
  const cleanup = installGlobalErrorHandlers({ runtime, web: true, report: (_, info) => { rows.push(info); return Promise.reject(new Error()); } });
  const event = { error: new Error(), reason: new Error(), preventDefault() { assert.fail('must not suppress'); } };
  listeners.get('error')(event); listeners.get('unhandledrejection')(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rows.map(row => row.source), ['web_error', 'unhandled_rejection']);
  cleanup(); assert.equal(listeners.size, 0);
});

test('기존 네이티브 핸들러가 없을 때 임의로 기본 처리를 덮어쓰지 않는다', () => {
  const runtime = { ErrorUtils: { setGlobalHandler() { assert.fail('no existing handler'); } } };
  assert.doesNotThrow(() => installGlobalErrorHandlers({ runtime, report() {} })());
});
