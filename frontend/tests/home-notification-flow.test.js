import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

test('공유 뒤로가기는 등록 전·해제 후 목록으로 복귀하고 등록 중에는 공유의 가드를 따른다', () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
  const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/notifications/HomeNotificationFlow.js', import.meta.url), 'utf8'), {
    babelrc: false, configFile: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const module = { exports: {} };
  let refs = [], effects = [], refIndex = 0, effectIndex = 0;
  const useRef = initial => refs[refIndex++] ??= { current: initial };
  const useEffect = (fn, deps) => {
    const index = effectIndex++;
    if (!effects[index] || deps.some((value, i) => value !== effects[index][i])) { effects[index] = deps; fn(); }
  };
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react') return { useRef, useCallback: fn => fn, useEffect };
    if (name === 'react-native') return { View: 'View' };
    if (name === 'react/jsx-runtime') return require(name);
    return { __esModule: true, default: name };
  }, module, module.exports);
  const render = props => { refIndex = effectIndex = 0; return module.exports.default(props); };
  let requests = [], closed = [], resets = 0, guardedBack = 0, refreshes = 0;
  const props = { request: { mode: 'invitation', returnToNotifications: true }, sharing: {}, model: { invitation: { status: 'idle' }, store: { closeInvitation: () => resets++, refreshNotifications: () => refreshes++ } }, onRequest: value => requests.push(value), onClose: value => closed.push(value) };
  const tree = render(props), shared = tree.props.children.props.children;
  assert.equal(refreshes, 0); // 공유 상세에서는 홈 목록을 중복 조회하지 않는다.
  tree.props.onRequestClose(); // effect 등록 전
  assert.deepEqual(requests, [{ mode: 'notifications' }]); assert.equal(resets, 1);
  shared.props.onBackReady(() => guardedBack++);
  tree.props.onRequestClose();
  assert.equal(guardedBack, 1); assert.equal(requests.length, 1); // running/확인창 등 공유 쪽 가드 보존
  shared.props.onBackReady(null);
  tree.props.onRequestClose();
  assert.equal(requests.length, 2); assert.equal(resets, 2);
  const listProps = { ...props, request: { mode: 'notifications' } };
  render(listProps).props.onRequestClose();
  assert.deepEqual(closed, [true]); assert.equal(refreshes, 1);
  render(listProps);
  assert.equal(refreshes, 1); // 같은 목록의 상태 갱신으로는 재조회하지 않는다.
  render(props);
  render(listProps);
  assert.equal(refreshes, 2); // 초대 처리 후 복귀하면 다시 조회한다.
  refs = []; effects = []; // 알림을 새로 열어 목록만 본 경우
  const list = render(listProps);
  list.props.children.props.children.props.onClose();
  list.props.onRequestClose();
  assert.deepEqual(closed, [true, false, false]);
});
