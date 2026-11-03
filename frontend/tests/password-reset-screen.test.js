import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as validation from '../src/auth/validation.js';

const require = createRequire(import.meta.url);
const expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
const code = babel.transformSync(readFileSync(new URL('../src/auth/PasswordResetScreen.js', import.meta.url), 'utf8'), {
  configFile: false,
  babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;

const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const byLabel = (tree, label) => nodes(tree).find((node) => node.props?.accessibilityLabel === label || node.props?.label === label);
const hasText = (tree, value) => nodes(tree).some((node) => [node.props?.children].flat(Infinity).includes(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

function screen(service) {
  const states = [], deps = [];
  let stateIndex = 0, effectIndex = 0, completed = 0;
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect(_fn, next) { deps[effectIndex++] = next; },
    useMemo: (fn) => fn(),
  };
  const native = { Platform: { OS: 'web' } };
  for (const name of ['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'StyleSheet', 'Text', 'TextInput', 'View']) native[name] = name;
  native.StyleSheet = { create: (styles) => styles };
  const mocks = {
    react,
    'react-native': native,
    '../shared/theme': { colors: { surfaceSoft: '#f1f3f7', text: '#000', textMuted: '#555', border: '#ccc', surface: '#fff', primaryStrong: '#456', primary: '#789', danger: '#e44', dangerStrong: '#b25' }, radius: { xl: 22, lg: 16, md: 12 } },
    './validation': validation,
    '../shared/MakerKit': { MakerHeader: 'MakerHeader', MakerBar: 'MakerBar' },
    '../shared/DioButton': { __esModule: true, default: 'DioButton' },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }),
    mod,
    mod.exports,
  );
  const render = () => {
    stateIndex = 0;
    effectIndex = 0;
    return mod.exports.default({ service, onComplete: () => { completed++; }, onClose() {} });
  };
  return { render, completed: () => completed };
}

test('비밀번호 재설정은 이메일·인증번호·새 비밀번호·완료 순서로 진행한다', async () => {
  const calls = [];
  const ui = screen({
    requestPasswordReset: async (email) => { calls.push(['request', email]); return { expiresIn: 120, resendAfter: 0 }; },
    verifyPasswordReset: async (email, code) => { calls.push(['verify', email, code]); },
    completePasswordReset: async (input) => { calls.push(['complete', input]); },
  });
  byLabel(ui.render(), '이메일').props.onChangeText('member@example.com');
  byLabel(ui.render(), '인증번호 보내기').props.onPress();
  await tick();
  byLabel(ui.render(), '인증번호').props.onChangeText('123456');
  byLabel(ui.render(), '인증번호 확인').props.onPress();
  await tick();
  byLabel(ui.render(), '새 비밀번호').props.onChangeText('NewPassword123!');
  byLabel(ui.render(), '새 비밀번호 확인').props.onChangeText('NewPassword123!');
  byLabel(ui.render(), '비밀번호 재설정').props.onPress();
  await tick();
  assert.ok(hasText(ui.render(), '새 비밀번호를 설정했어요.'));
  byLabel(ui.render(), '로그인으로 돌아가기').props.onPress();
  assert.equal(ui.completed(), 1);
  assert.deepEqual(calls, [
    ['request', 'member@example.com'],
    ['verify', 'member@example.com', '123456'],
    ['complete', { email: 'member@example.com', newPassword: 'NewPassword123!' }],
  ]);
});

test('만료된 인증번호는 확인할 수 없고 비밀번호 불일치는 완료를 막는다', async () => {
  const ui = screen({ requestPasswordReset: async () => ({ expiresIn: 0, resendAfter: 0 }) });
  byLabel(ui.render(), '이메일').props.onChangeText('member@example.com');
  byLabel(ui.render(), '인증번호 보내기').props.onPress();
  await tick();
  assert.equal(byLabel(ui.render(), '인증번호 확인').props.disabled, true);

  const valid = screen({
    requestPasswordReset: async () => ({ expiresIn: 60, resendAfter: 0 }),
    verifyPasswordReset: async () => {},
  });
  byLabel(valid.render(), '이메일').props.onChangeText('member@example.com');
  byLabel(valid.render(), '인증번호 보내기').props.onPress();
  await tick();
  byLabel(valid.render(), '인증번호').props.onChangeText('123456');
  byLabel(valid.render(), '인증번호 확인').props.onPress();
  await tick();
  byLabel(valid.render(), '새 비밀번호').props.onChangeText('NewPassword123!');
  byLabel(valid.render(), '새 비밀번호 확인').props.onChangeText('OtherPassword123!');
  assert.ok(hasText(valid.render(), '비밀번호가 일치하지 않아요.'));
  assert.equal(byLabel(valid.render(), '비밀번호 재설정').props.disabled, true);
});

test('인증번호 확인 실패 후 입력을 유지해 같은 화면에서 재시도한다', async () => {
  let attempts = 0;
  const ui = screen({
    requestPasswordReset: async () => ({ expiresIn: 60, resendAfter: 0 }),
    verifyPasswordReset: async () => { attempts++; if (attempts === 1) throw new Error('인증번호가 맞지 않아요.'); },
  });
  byLabel(ui.render(), '이메일').props.onChangeText('member@example.com');
  byLabel(ui.render(), '인증번호 보내기').props.onPress();
  await tick();
  byLabel(ui.render(), '인증번호').props.onChangeText('123456');
  byLabel(ui.render(), '인증번호 확인').props.onPress();
  await tick();
  assert.equal(byLabel(ui.render(), '인증번호').props.value, '123456');
  assert.ok(hasText(ui.render(), '인증번호가 맞지 않아요.'));
  byLabel(ui.render(), '인증번호 확인').props.onPress();
  await tick();
  assert.ok(byLabel(ui.render(), '새 비밀번호'));
});

test('기존 형식 계정은 비밀번호 재설정 이메일 입력 화면에서도 진행할 수 있다',async()=>{
 const requested=[];
 const ui=screen({requestPasswordReset:async email=>{requested.push(email);return{expiresIn:600,resendAfter:0}}});
 byLabel(ui.render(),'이메일').props.onChangeText(' Legacy@Old_Domain.Example ');
 assert.equal(byLabel(ui.render(),'인증번호 보내기').props.disabled,false);
 byLabel(ui.render(),'인증번호 보내기').props.onPress();await tick();
 assert.deepEqual(requested,['legacy@old_domain.example']);
 assert.ok(byLabel(ui.render(),'인증번호'));
});

for (const email of ['member', 'user@', '@example.com', 'a@@example.com'])
 test(`재설정 화면은 잘못된 주소의 발송을 막는다: ${email}`,async()=>{
  let requests=0;
  const ui=screen({requestPasswordReset:async()=>{requests++;return{expiresIn:600,resendAfter:0}}});
  byLabel(ui.render(),'이메일').props.onChangeText(email);
  assert.equal(byLabel(ui.render(),'인증번호 보내기').props.disabled,true);
  byLabel(ui.render(),'인증번호 보내기').props.onPress();await tick();
  assert.equal(requests,0);
 });
