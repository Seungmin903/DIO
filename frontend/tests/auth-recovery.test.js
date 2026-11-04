import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
const compile = path => babel.transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const calls = [];
const mod = { exports: {} };
new Function('require', 'module', 'exports', compile('../src/auth/AuthenticationRecovery.js'))(id => ({
  'react-native': { Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: value => value } },
  './loginGate': { useLoginEntry: () => request => calls.push(request) }, '../shared/theme': { colors: {} },
}[id] || require(id)), mod, mod.exports);
const Recovery = mod.exports.default;

test('인증 거절은 재로그인 버튼으로 연결하고 실제 세션 만료 표식을 전달한다', () => {
  calls.length = 0;
  for (const sessionExpired of [false, true]) {
    const button = Recovery({ error: { status: 401, sessionExpired } });
    assert.equal(button.props.accessibilityLabel, '다시 로그인');
    button.props.onPress();
  }
  assert.deepEqual(calls, [{ sessionExpired: false }, { sessionExpired: true }]);
});

test('네트워크·서버 오류·권한 거절·개발 접속 인증은 회원 재로그인으로 보내지 않는다', () => {
  for (const error of [null, { code: 'NETWORK_ERROR' }, { status: 503 }, { status: 403 }, { status: 401, code: 'DEVELOPMENT_ACCESS_REQUIRED' }]) {
    assert.equal(Recovery({ error }), null);
  }
});

test('보관함·만들기·휴지통의 401 오류 화면에 동작 가능한 로그인 경로가 있다', () => {
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  for (const [file, props] of [
    ['MemberLibraryNotice', { library: { error: { status: 401 } } }],
    ['MemberRequestNotice', { error: { status: 401, message: '인증 오류' } }],
    ['MemberTrashNotice', { state: { trashError: { status: 401 } } }],
  ]) {
    const module = { exports: {} };
    const mocks = { 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator' },
      '../styles': { styles: {} }, '../constants': { C: {} }, '../../auth/sessionExpiry.js': { authenticationErrorMessage: () => '인증 오류' },
      '../../auth/AuthenticationRecovery': { __esModule: true, ...mod.exports } };
    new Function('require', 'module', 'exports', compile(`../src/diary/components/${file}.js`))(id => mocks[id] || require(id), module, module.exports);
    const action = nodes(module.exports.default(props)).find(node => node.type === Recovery && node.props.error?.status === 401);
    assert.ok(action, file);
    const before = calls.length;
    Recovery(action.props).props.onPress();
    assert.equal(calls.length, before + 1);
  }
});
