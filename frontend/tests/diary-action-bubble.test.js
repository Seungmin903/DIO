import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');

test('말풍선의 닫힘 상태와 콜백은 iOS Modal까지 전달된다', () => {
  const compile = file => babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const react = { useEffect() {}, useRef: value => ({ current: value }) };
  const native = { Modal: 'NativeModal', StyleSheet: { create: value => value, absoluteFill: {}, hairlineWidth: 1 }, Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 500, height: 800 }) };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/editor/components/controls/EditorModal.js'))(id => id === 'react-native' ? native : jsx, module, module.exports);
  const EditorModal = module.exports.default;
  const mocks = { react, 'react-native': native, 'react/jsx-runtime': jsx, '../../editor/components/controls/EditorModal': { __esModule: true, default: EditorModal }, '../../shared/theme': { bubble: {}, colors: {}, radius: {} } };
  const bubble = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/diary/components/DiaryActionBubble.js'))(id => mocks[id] ?? { __esModule: true, default: id }, bubble, bubble.exports);
  const onDismiss = () => {}, element = bubble.exports.default({ title: '표지', actions: [], visible: false, onDismiss, onClose() {} });
  const modal = element.type(element.props);
  assert.equal(modal.type, 'NativeModal'); assert.equal(modal.props.visible, false); assert.equal(modal.props.onDismiss, onDismiss);
})

// 말풍선 컴포넌트 파일에서 순수 함수 bubblePlacement 만 꺼낸다(화면 모듈은 빈 껍데기로 대신한다)
function loadPlacement() {
  const code = babel.transformSync(readFileSync(new URL('../src/diary/components/DiaryActionBubble.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code;
  const any = new Proxy({}, { get: () => 0 });
  const mocks = {
    'react-native': { StyleSheet: { create: value => value, absoluteFill: {}, hairlineWidth: 1 }, Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 0, height: 0 }) },
    '../../shared/theme': { bubble: {}, colors: any, radius: any, DISABLED_OPACITY: 0.4 },
    react: { useEffect: () => {}, useRef: () => ({ current: '' }) },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? { __esModule: true, default: id }, module, module.exports);
  return module.exports.bubblePlacement;
}

const place = loadPlacement();
const WINDOW = { width: 1180, height: 820 };
const WIDTH = 224, ROW = 48, PAD = 6, GAP = 8, EDGE = 12;
const heightOf = rows => PAD * 2 + rows * ROW;

test('버튼 아래에 자리가 있으면 버튼 아래, 오른쪽 끝을 버튼에 맞춰 연다', () => {
  const anchor = { x: 900, y: 200, width: 30, height: 40 };
  const result = place(anchor, 2, WINDOW);
  assert.deepEqual(result, { left: anchor.x + anchor.width - WIDTH, top: anchor.y + anchor.height + GAP, height: heightOf(2) });
  assert.equal('outside' in result, false);
});

test('아래에 자리가 없으면 버튼 위에 연다', () => {
  const anchor = { x: 900, y: 700, width: 30, height: 40 };
  const result = place(anchor, 2, WINDOW);
  assert.equal(result.top, anchor.y - GAP - heightOf(2));
});

test('아래 · 위 모두 자리가 없으면 화면 안으로 밀어 넣는다', () => {
  const small = { width: 400, height: 200 };
  const anchor = { x: 300, y: 100, width: 30, height: 40 };
  const result = place(anchor, 2, small);
  assert.ok(result.top >= EDGE);
  assert.ok(result.top + result.height <= small.height - EDGE);
});

test('버튼이 화면 오른쪽 끝에 붙어도 말풍선이 화면 밖으로 나가지 않는다', () => {
  const anchor = { x: WINDOW.width - 20, y: 100, width: 20, height: 40 };
  const result = place(anchor, 2, WINDOW);
  assert.equal(result.left, WINDOW.width - EDGE - WIDTH);
  const farLeft = place({ x: 0, y: 100, width: 20, height: 40 }, 2, WINDOW);
  assert.equal(farLeft.left, EDGE);
});

test('버튼 자리를 재지 못했으면 화면 가운데에 연다', () => {
  const result = place(null, 2, WINDOW);
  assert.equal(result.left, (WINDOW.width - WIDTH) / 2);
  assert.equal(result.top, (WINDOW.height - heightOf(2)) / 2);
});
