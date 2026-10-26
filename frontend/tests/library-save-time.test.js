import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { scheduleIdleTask } from '../src/editor/utils/idleTask.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/useEditor.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
});

test('열람은 수정 시각을 만들지 않고 편집 저장은 시각과 저장 완료 상태를 보존한다', async () => {
  const slots = [], effects = [], listeners = [], saved = [], cached = [];
  let cursor = 0;
  const doc = { id: 'a', pages: [{ objects: [] }] };
  let state = { doc, past: [], future: [] };
  const same = (a, b) => a?.length === b?.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, v => { slots[i].value = v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useReducer() { cursor++; return [state, () => {}]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const mocks = {
    react,
    'react-native': { AppState: { addEventListener: (_, fn) => { listeners.push(fn); return { remove() {} }; } } },
    '../utils/idleTask': { scheduleIdleTask },
    '../state/defaultDoc': { createDefaultDoc: () => doc },
    '../state/editorReducer': {},
    '../services/editorDocs': { saveEditorDoc: async (_, value) => { saved.push(value); return true; }, editorDocKey: () => 'doc:a', peekEditorDoc: () => ({ doc }), rememberEditorDoc: (_, value) => cached.push(value) },
    '../services/mediaStore': { hydrateMedia: async () => {} },
    '../services/storage': { saveJSON: async (_, value) => { saved.push(value); return true; } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id], module, module.exports);
  const render = () => { cursor = 0; const value = module.exports.useEditor({ id: 'a' }); effects.splice(0).forEach(fn => fn()); return value; };
  render();
  assert.equal(cached.length, 0);
  state = { doc: { ...doc, title: '편집' }, past: [doc], future: [] };
  assert.equal(render().saveStatus, 'saving');
  assert.ok(Number.isFinite(Date.parse(cached[0].updatedAt)));
  assert.equal(state.doc.updatedAt, undefined);
  listeners[0]('background');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title, '편집');
  assert.equal(saved[0].updatedAt, cached[0].updatedAt);
  assert.equal(render().saveStatus, 'saved');
});
