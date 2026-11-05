import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/shared/drawingInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;

async function load(saved = {}) {
  const writes = {};
  const storage = { getItem: async key => saved[key] ?? null, setItem: async (key, value) => { writes[key] = value; } };
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { useSyncExternalStore: (_s, get) => get() };
    return { __esModule: true, default: storage };
  }, m, m.exports);
  await new Promise(resolve => setImmediate(resolve));
  return { ...m.exports, writes };
}
const KEY = 'dio.drawing.input.v1', SEEN = 'dio.drawing.pen-seen.v1';

test('선택지는 펜만 · 펜 · 손가락 둘이고 자동은 없다', async () => {
  const input = await load();
  assert.deepEqual(input.DRAWING_INPUTS.map(option => option.id), ['pen', 'any']);
});

test('고른 적 없으면 펜을 보기 전에는 펜 · 손가락, 본 뒤에는 펜만이 골라져 있고 다음 실행에도 남는다', async () => {
  const input = await load();
  assert.equal(input.getDrawingInput(), 'any');
  input.markPenSeen();
  assert.equal(input.getDrawingInput(), 'pen');
  assert.equal(input.writes[SEEN], '1');
  assert.equal((await load({ [SEEN]: '1' })).getDrawingInput(), 'pen');
});

test('사용자가 고른 값은 펜을 봐도 바뀌지 않는다', async () => {
  const input = await load();
  input.setDrawingInput('any');
  input.markPenSeen();
  assert.equal(input.getDrawingInput(), 'any');
  assert.equal(input.writes[KEY], 'any');
  assert.equal((await load({ [KEY]: 'any', [SEEN]: '1' })).getDrawingInput(), 'any');
});

test('예전에 저장한 자동은 고른 적 없는 상태로 읽는다', async () => {
  assert.equal((await load({ [KEY]: 'auto' })).getDrawingInput(), 'any');
  assert.equal((await load({ [KEY]: 'auto', [SEEN]: '1' })).getDrawingInput(), 'pen');
});
