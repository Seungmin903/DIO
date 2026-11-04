import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const React = require('react');
function compile(path, mocks) {
  const code = expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? require(id), mod, mod.exports);
  return mod.exports;
}

test('렌더 경계는 오류 안내를 표시하고 명시적 재시도 때만 자식 트리를 다시 만든다', () => {
  const reports = [], splash = [];
  const Boundary = compile('../src/stability/AppErrorBoundary.js', {
    './AppErrorFallback': { __esModule: true, default: 'Fallback' },
    './errorHandling': { reportAppError: (error, info) => reports.push(info) },
    'expo-splash-screen': { hideAsync: async () => splash.push(true) },
  }).default;
  const instance = new Boundary({ children: React.createElement('child') });
  instance.setState = (update, done) => { Object.assign(instance.state, typeof update === 'function' ? update(instance.state) : update); done?.(); };
  assert.equal(instance.render().type, React.Fragment);
  Object.assign(instance.state, Boundary.getDerivedStateFromError(new Error()));
  instance.componentDidCatch(new Error('private'));
  const fallback = instance.render(); assert.equal(fallback.type, 'Fallback');
  assert.equal(reports[0].source, 'render'); assert.equal(splash.length, 1);
  fallback.props.onRetry(); assert.equal(instance.render().key, '1');
  instance.retry(); assert.equal(instance.render().key, '1');
  Object.assign(instance.state, Boundary.getDerivedStateFromError());
  assert.equal(instance.render().type, 'Fallback');
});

test('기록·스플래시 종료가 실패해도 오류 안내와 재시도는 유지된다', async () => {
  const Boundary = compile('../src/stability/AppErrorBoundary.js', {
    './AppErrorFallback': { __esModule: true, default: 'Fallback' },
    './errorHandling': { reportAppError() { throw new Error('storage'); } },
    'expo-splash-screen': { hideAsync: () => Promise.reject(new Error('native unavailable')) },
  }).default;
  const instance = new Boundary({ children: null });
  assert.doesNotThrow(() => instance.componentDidCatch(new Error()));
  await new Promise(resolve => setImmediate(resolve));
});

test('App 모듈은 등록 시가 아니라 경계 안의 자식 렌더 시점에 평가한다', () => {
  let loads = 0;
  const Root = compile('../src/stability/AppRoot.js', {
    './AppErrorBoundary': { __esModule: true, default: 'Boundary' },
    '../../App': { get default() { loads++; return 'App'; } },
  }).default;
  const tree = Root(); assert.equal(loads, 0); assert.equal(tree.type, 'Boundary');
  assert.equal(tree.props.children.type().type, 'App'); assert.equal(loads, 1);
});

test('실제 앱 진입점은 전역 관찰을 설치한 뒤 보호된 루트를 등록한다', () => {
  const order = [];
  compile('../index.js', {
    expo: { registerRootComponent: root => order.push(['register', root]) },
    './src/stability/AppRoot': { __esModule: true, default: 'Root' },
    './src/stability/errorHandling': { initializeErrorHandling: () => order.push(['initialize']) },
  });
  assert.deepEqual(order, [['initialize'], ['register', 'Root']]);
});

test('Fast Refresh에서도 설치된 전역 핸들러와 같은 진단 저장기를 재사용한다', () => {
  const key = Symbol.for('dio.app-error-diagnostics.v1');
  const previous = globalThis[key]; delete globalThis[key];
  let creates = 0, reports = 0;
  const mocks = { 'react-native': { Platform: { OS: 'web' } }, '../../app.json': { expo: { version: '1.0.0' } },
    './errorDiagnostics': { createErrorDiagnostics() { creates++; return { report: async () => reports++, read: async () => [] }; } },
    './globalErrorHandlers': { installGlobalErrorHandlers() {} } };
  try {
    const first = compile('../src/stability/errorHandling.js', mocks);
    const second = compile('../src/stability/errorHandling.js', mocks);
    first.initializeErrorHandling(); second.initializeErrorHandling();
    first.reportAppError(new Error()); second.reportAppError(new Error());
    assert.equal(creates, 1); assert.equal(reports, 2);
  } finally {
    if (previous) globalThis[key] = previous;
    else delete globalThis[key];
  }
});

test('오류 화면은 폰트·계정 provider 없이 읽을 수 있고 글자 높이를 제한하지 않는다', () => {
  const Fallback = compile('../src/stability/AppErrorFallback.js', {
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' },
    'expo-font': { isLoaded() { throw new Error('font unavailable'); } },
    '../shared/theme': { colors: {}, radius: { md: 10 } },
  }).default;
  let retried = 0;
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const all = nodes(Fallback({ onRetry: () => retried++ }));
  assert.ok(all.some(node => node.type === 'ScrollView'));
  all.find(node => node.props.accessibilityLabel === '다시 시도').props.onPress();
  assert.equal(retried, 1);
  for (const node of all.filter(node => node.type === 'Text')) {
    assert.equal(node.props.dioFont, false);
    assert.equal(node.props.numberOfLines, undefined);
    assert.equal(node.props.adjustsFontSizeToFit, undefined);
  }
});
