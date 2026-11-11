import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url),
  expo = createRequire(require.resolve('expo/package.json')),
  babel = expo('@babel/core');
const compile = (path) =>
  babel.transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    configFile: false,
    babelrc: false,
    plugins: [
      [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
      expo.resolve('@babel/plugin-transform-modules-commonjs'),
    ],
  }).code;

// 회원 탈퇴 확인 창(지라 597 · 842): 프로필 수정 화면을 없애면서 탈퇴 창만 따로 남겼다
function setup(service) {
  const states = [], refs = [], deps = [], cleanups = [], keyboard = {};
  let si = 0, ri = 0, ei = 0, closed = 0, ended = 0;
  const react = {
    useState(initial) {
      const i = si++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (value) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useRef: (initial) => (refs[ri++] ??= { current: initial }),
    useEffect(fn, next) {
      const i = ei++;
      if (!deps[i] || next.some((v, j) => v !== deps[i][j])) {
        cleanups[i]?.();
        deps[i] = next;
        cleanups[i] = fn();
      }
    },
  };
  const native = {
    Platform: { OS: 'android' },
    Keyboard: {
      dismiss() {},
      addListener(name, fn) {
        (keyboard[name] ??= new Set()).add(fn);
        return { remove() { keyboard[name].delete(fn); } };
      },
    },
  };
  for (const name of ['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View']) native[name] = name;
  const mocks = {
    react,
    'react-native': native,
    './profileStyles': { profileStyles: new Proxy({}, { get: (_, key) => key }) },
    '../shared/theme': { colors: {} },
  };
  const load = (id) => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id });
  const hook = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/auth/useProfileKeyboard.js'))(load, hook, hook.exports);
  mocks['./useProfileKeyboard'] = hook.exports;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/auth/WithdrawDialog.js'))(load, mod, mod.exports);
  const user = { userId: '7', provider: 'email', nickname: '소연' };
  return {
    render() {
      si = ri = ei = 0;
      return mod.exports.default({ user, service, onClose() { closed++; }, onEndSession() { ended++; } });
    },
    keyboard,
    closed: () => closed,
    ended: () => ended,
    unmount: () => cleanups.forEach((fn) => fn?.()),
  };
}
const nodes = (n) => (!n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]);
const find = (ui, label) => nodes(ui.render()).find((n) => n.props?.accessibilityLabel === label);
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('탈퇴합니다를 정확히 입력해야 탈퇴할 수 있고 취소는 창만 닫으며 연타는 한 번만 실행한다', async () => {
  let resolve, calls = 0;
  const service = { withdraw: () => { calls++; return new Promise((r) => { resolve = r; }); } };
  const closing = setup(service);
  assert.equal(find(closing, '탈퇴하기').props.disabled, true);
  for (const text of ['탈퇴', '탈퇴합니다 ', ' 탈퇴합니다']) {
    find(closing, '탈퇴 확인 문구').props.onChangeText(text);
    assert.equal(find(closing, '탈퇴하기').props.disabled, true);
  }
  find(closing, '취소').props.onPress();
  assert.equal(closing.closed(), 1);
  assert.equal(calls, 0);
  closing.unmount();
  const ui = setup(service);
  assert.equal(find(ui, '탈퇴 확인 문구').props.value, '');
  find(ui, '탈퇴 확인 문구').props.onChangeText('탈퇴합니다');
  const button = find(ui, '탈퇴하기');
  assert.equal(button.props.disabled, false);
  button.props.onPress();
  button.props.onPress();
  assert.equal(calls, 1);
  resolve();
  await tick();
  assert.equal(ui.ended(), 1);
  ui.unmount();
});

test('탈퇴 요청이 실패하면 문구를 유지하고 다시 시도할 수 있다', async () => {
  let calls = 0;
  const ui = setup({ withdraw: async () => { if (++calls === 1) throw new Error('일시 오류'); } });
  find(ui, '탈퇴 확인 문구').props.onChangeText('탈퇴합니다');
  find(ui, '탈퇴하기').props.onPress();
  await tick();
  assert.equal(ui.ended(), 0);
  assert.equal(find(ui, '탈퇴 확인 문구').props.value, '탈퇴합니다');
  assert.ok(nodes(ui.render()).some((n) => n.props?.accessibilityRole === 'alert'));
  assert.equal(find(ui, '탈퇴하기').props.disabled, false);
  assert.equal(ui.closed(), 0);
  find(ui, '탈퇴하기').props.onPress();
  await tick();
  assert.equal(ui.ended(), 1);
  ui.unmount();
});

test('키보드가 뜬 뒤 입력칸 위치를 다시 재 가려지지 않게 올리고, 닫으면 리스너와 예약 작업을 정리한다(useProfileKeyboard)', async () => {
  const ui = setup({ withdraw: async () => {} }), moves = [];
  const scroll = nodes(ui.render()).find((n) => n.type === 'ScrollView');
  scroll.props.ref.current = { measureInWindow: (fn) => fn(0, 100, 400, 400), scrollTo: (value) => moves.push(value) };
  const input = find(ui, '탈퇴 확인 문구');
  input.props.ref.current = { measureInWindow: (fn) => fn(20, 380, 300, 48) };
  input.props.onFocus();
  for (const listener of ui.keyboard.keyboardDidShow) listener({ endCoordinates: { screenY: 320 } });
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.deepEqual(moves, [{ y: 124, animated: true }]);
  ui.unmount();
  assert.ok(Object.values(ui.keyboard).every((set) => set.size === 0));
});
