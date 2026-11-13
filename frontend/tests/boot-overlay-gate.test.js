import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { waitToStartPush } from '../src/notifications/pushStartGate.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
function loadEditorModal(booting) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/controls/EditorModal.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const mocks = {
    'react-native': { Modal: 'native-modal', Platform: { OS: 'ios' }, View: 'view', useWindowDimensions: () => ({ width: 400, height: 800 }) },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '../../../shared/bootGate': { useBooting: () => booting },
  };
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id], m, m.exports);
  return m.exports.default;
}

test('시작 화면 중에는 열린 모달도 감추고, 시작 화면이 닫히면 원래 visible 을 따른다', () => {
  const Booting = loadEditorModal(true), Ready = loadEditorModal(false);
  assert.equal(Booting({ visible: true }).props.visible, false);
  assert.equal(Booting({}).props.visible, false);
  assert.equal(Ready({}).props.visible, true); // visible 을 안 주면 예전처럼 열린 모달
  assert.equal(Ready({ visible: true }).props.visible, true);
  assert.equal(Ready({ visible: false }).props.visible, false);
});

const authWith = keys => { let index = 0; return { getSessionKey: () => keys[Math.min(index++, keys.length - 1)] }; };

test('푸시는 시작 화면이 닫힌 뒤, 그사이 그만두지 않았고 세션도 그대로일 때만 시작한다', async () => {
  let release;
  const booted = new Promise(resolve => { release = resolve; });
  const waiting = waitToStartPush({ auth: authWith(['s1', 's1']), whenBooted: () => booted });
  let settled = false;
  waiting.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false); // 시작 화면이 닫히기 전에는 권한을 묻지 않는다
  release();
  assert.equal(await waiting, true);
  const now = () => Promise.resolve();
  assert.equal(await waitToStartPush({ auth: authWith(['s1', 's1']), isActive: () => false, whenBooted: now }), false);
  assert.equal(await waitToStartPush({ auth: authWith(['s1', 's2']), whenBooted: now }), false); // 계정 전환
  assert.equal(await waitToStartPush({ auth: authWith(['s1', null]), whenBooted: now }), false); // 로그아웃
  assert.equal(await waitToStartPush({ auth: authWith([null, null]), whenBooted: now }), false);
});
