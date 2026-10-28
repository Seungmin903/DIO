import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationCountLabel } from '../src/notifications/notificationCount.js';
const require = createRequire(import.meta.url),
  expo = createRequire(require.resolve('expo/package.json')),
  babel = expo('@babel/core');
const code = babel.transformSync(
  readFileSync(new URL('../src/sharing/SharingEntry.js', import.meta.url), 'utf8'),
  {
    configFile: false,
    babelrc: false,
    plugins: [
      [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
      expo.resolve('@babel/plugin-transform-modules-commonjs'),
    ],
  },
).code;
const nodes = (n) =>
  !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
function setup({
  props = {},
  width = 390,
  height = 844,
  insets = { left: 0, right: 0, top: 0, bottom: 0 },
} = {}) {
  const refs = [],
    deps = [],
    cleanups = [];
  let anchor = null,
    ri = 0,
    ei = 0,
    dimensions = { width, height },
    resolve;
  const react = {
    useRef: (initial) => (refs[ri++] ??= { current: initial }),
    useState: () => [
      anchor,
      (value) => {
        anchor = value;
      },
    ],
    useEffect: (fn, next) => {
      const i = ei++;
      if (!deps[i] || next.some((value, j) => value !== deps[i][j])) {
        cleanups[i]?.();
        deps[i] = next;
        cleanups[i] = fn();
      }
    },
  };
  const native = {
    useWindowDimensions: () => dimensions,
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    View: 'View',
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) =>
      id === 'react'
        ? react
        : id === 'react-native'
          ? native
          : id === 'react-native-safe-area-context'
            ? { useSafeAreaInsets: () => insets }
            : id === '../notifications/notificationCount.js'
              ? { notificationCountLabel }
            : id === 'react/jsx-runtime'
              ? require(id)
              : id === './styles'
                ? { sharingStyles: {} }
                : { __esModule: true, default: id },
    mod,
    mod.exports,
  );
  const members = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    nickname: `사람${i}`,
    presence: '편집 중',
  }));
  const render = () => {
    ri = ei = 0;
    return mod.exports.default({ members, onPress() {}, ...props });
  };
  let tree = render();
  nodes(tree).find((n) => n.props.ref).props.ref.current = {
    measureInWindow: (fn) => {
      resolve = fn;
    },
  };
  return {
    render,
    setProps(next) { props = next; },
    open: () =>
      nodes(render())
        .find((n) => n.props.accessibilityLabel === '참여자 8명 보기')
        .props.onPress(),
    resolve: () => resolve(10, 20, 80, 44),
    resize: () => {
      dimensions = { width: 844, height: 390 };
      render();
    },
    unmount: () => cleanups.forEach((fn) => fn?.()),
  };
}
test('참여자 위치 측정이 늦게 끝나도 공유 창 진입·회전 후 목록을 다시 열지 않는다', () => {
  const ui = setup();
  ui.open();
  nodes(ui.render())
    .find((n) => n.props.accessibilityLabel === '다이어리 공유')
    .props.onPress();
  ui.resolve();
  assert.ok(!nodes(ui.render()).some((n) => n.props.onRequestClose));
  ui.open();
  ui.resize();
  ui.resolve();
  assert.ok(!nodes(ui.render()).some((n) => n.props.onRequestClose));
  ui.unmount();
});
test('가로 폰의 노치·홈 영역 안으로 참여자 목록 위치와 높이를 제한한다', () => {
  const ui = setup({
    width: 844,
    height: 390,
    insets: { left: 44, right: 44, top: 0, bottom: 20 },
  });
  ui.open();
  ui.resolve();
  const card = nodes(ui.render()).find(
    (n) => n.type === 'Pressable' && Array.isArray(n.props.style),
  );
  const box = card.props.style[1];
  assert.ok(box.left >= 52);
  assert.ok(box.left + box.width <= 792);
  assert.ok(box.top + box.maxHeight <= 362);
  ui.unmount();
});


test('실제 알림 진입점은 전체 미읽음 숫자를 표시하고 빨간 점으로 가장하지 않는다', () => {
  const props = { notifications: true, compact: true, notificationLabel: '알림', notificationCount: { status: 'success', data: { unreadCount: 4 } } };
  const ui = setup({ props });
  assert.ok(nodes(ui.render()).some(n => n.props.accessibilityLabel === '알림, 안 읽은 알림 4개'));
  assert.ok(nodes(ui.render()).some(n => n.type === 'Text' && n.props.children === 4));
  assert.ok(!nodes(ui.render()).some(n => n.props.testID === 'notification-dot'));
  ui.setProps({ ...props, notificationCount: { status: 'error', data: { unreadCount: 4 } } });
  assert.ok(nodes(ui.render()).some(n => n.props.accessibilityLabel === '알림, 안 읽은 알림 4개, 알림 수 확인 필요'));
  ui.setProps({ ...props, notificationCount: { status: 'success', data: { unreadCount: 200 } } });
  assert.ok(nodes(ui.render()).some(n => n.props.accessibilityLabel === '알림, 안 읽은 알림 200개'));
  assert.ok(nodes(ui.render()).some(n => n.type === 'Text' && n.props.children === '99+'));
  ui.setProps({ ...props, notificationCount: { status: 'loading', data: null } });
  assert.ok(!nodes(ui.render()).some(n => n.type === 'Text' && n.props.children === 0));
  ui.setProps({ ...props, notificationCount: { status: 'success', data: { actionableUnreadCount: 2 } } });
  assert.ok(nodes(ui.render()).some(n => n.props.accessibilityLabel === '알림, 새 초대 2개'));
  assert.ok(nodes(ui.render()).some(n => n.props.testID === 'notification-dot'));
  ui.unmount();
});
