import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Normal module transformation; no App.js AST or declaration-name matching.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(
  readFileSync(new URL('../src/sharing/useKickedDiaryExit.js', import.meta.url), 'utf8'),
  { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] },
);
function fixture() {
  let cursor = 0;
  const slots = [], effects = [], cleanups = [], starts = [], stopped = [];
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((value, index) => !Object.is(value, slots[i][index]))) {
        slots[i] = deps;
        effects.push(() => { cleanups[i]?.(); cleanups[i] = effect(); });
      }
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return react;
    if (name === './kickedDiaryExit.js') return { watchKickedDiaryExit: options => {
      starts.push(options); return () => stopped.push(options);
    } };
    throw Error(`Unexpected hook dependency: ${name}`);
  }, module, module.exports);
  return {
    starts, stopped,
    render(props) { cursor = 0; module.exports.useKickedDiaryExit(props); effects.splice(0).forEach(effect => effect()); },
    close() { cleanups.forEach(cleanup => cleanup?.()); },
  };
}

test('재렌더링은 감시를 재시작하지 않고 최신 퇴장 콜백을 사용한다', () => {
  const app = fixture(), runtime = {}, calls = [];
  try {
    app.render({ member: true, diary: { id: 'diary-a' }, runtime, returnToLibrary: () => calls.push('old') });
    app.render({ member: true, diary: { id: 'diary-a' }, runtime, returnToLibrary: () => calls.push('latest') });
    assert.equal(app.starts.length, 1); assert.equal(app.stopped.length, 0);
    app.starts[0].getActions().returnToLibrary();
    assert.deepEqual(calls, ['latest']);
  } finally { app.close(); }
});

test('다이어리나 계정 런타임이 바뀌면 이전 감시를 정리하고 언마운트도 정리한다', () => {
  const app = fixture(), runtime = {};
  app.render({ member: true, diary: { id: 'diary-a' }, runtime });
  app.render({ member: true, diary: { id: 'diary-b' }, runtime });
  app.render({ member: true, diary: { id: 'diary-b' }, runtime: {} });
  assert.equal(app.starts.length, 3); assert.equal(app.stopped.length, 2);
  assert.equal(app.stopped[0].diary.id, 'diary-a');
  app.close(); assert.equal(app.stopped.length, 3);
});
