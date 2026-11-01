import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// 동작 있는 토스트(ActionToast): 남색 알약 + 버터색 '다시 시도'. 알약 높이는 38 그대로 두고 터치는 44를 맞춘다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
function compile(file, load) {
  const { code } = babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(load, module, module.exports);
  return module.exports;
}
const theme = { colors: { text: '#0B1766', surface: '#FFFFFF', butter: '#FEF0BF' }, DISABLED_OPACITY: 0.4 };
const { default: ActionToast, ACTION_TOAST_MS } = compile('../src/shared/ActionToast.js', id => {
  if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (id === 'react-native') return { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles } };
  if (id === './theme') return theme;
  throw new Error(id);
});
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
const flat = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('실패 알약은 다시 시도를 붙이고, 누르는 중에는 막는다', () => {
  let pressed = 0;
  const tree = ActionToast({ message: '표지를 나의 표지에 추가하지 못했어요.', actionLabel: '다시 시도', onAction: () => { pressed += 1; }, bottom: 112 });
  assert.equal(ACTION_TOAST_MS, 6000);
  assert.equal(flat(tree.props.style).bottom, 112);
  const button = nodes(tree).find(node => node.type === 'Pressable');
  assert.equal(button.props.accessibilityLabel, '다시 시도');
  button.props.onPress();
  assert.equal(pressed, 1);
  // 알약 높이 38(위아래 안쪽 10 포함)을 버튼이 차지하고, 위아래 3씩 넓혀 44
  const action = flat(button.props.style);
  assert.equal(action.paddingVertical * 2 + 18 + button.props.hitSlop.top + button.props.hitSlop.bottom, 44);
  assert.equal(flat(nodes(button).find(node => node.type === 'Text').props.style).color, theme.colors.butter);

  const busy = ActionToast({ message: '…', actionLabel: '다시 시도', busy: true, bottom: 76 });
  assert.equal(nodes(busy).find(node => node.type === 'Pressable').props.disabled, true);
});

test('완료 알림은 동작 없이 글만 보이고, 폰은 더 좁다', () => {
  const tree = ActionToast({ message: '표지를 나의 표지에 추가했어요.', bottom: 76, compact: true });
  assert.equal(nodes(tree).some(node => node.type === 'Pressable'), false);
  const pill = nodes(tree).find(node => flat(node.props?.style).borderRadius === 999);
  assert.equal(flat(pill.props.style).maxWidth, 284);
  assert.equal(flat(pill.props.style).backgroundColor, theme.colors.text);
});
