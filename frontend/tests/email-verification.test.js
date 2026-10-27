import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as preview from '../src/auth/verificationPreview.js';
import * as time from '../src/auth/verificationTime.js';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/auth/EmailVerification.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const tick = () => new Promise(r => setImmediate(r));
function setup(service, dev = false) {
  const slots = [], refs = [], deps = [], cleanups = [], timers = new Set(), listeners = new Set();
  let si = 0, ri = 0, ei = 0, completed = 0, previewLoads = 0;
  const react = {
    useState(v) { const i = si++; if (!(i in slots)) slots[i] = typeof v === 'function' ? v() : v; return [slots[i], next => { slots[i] = next; }]; },
    useRef(v) { return refs[ri++] ??= { current: v }; },
    useEffect(fn, next) { const i = ei++; if (!deps[i] || next.some((v,j) => v !== deps[i][j])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn(); } },
  };
  const native = { AppState: { addEventListener(_, fn) { listeners.add(fn); return { remove() { listeners.delete(fn); } }; } }, Pressable: 'Pressable', Text: 'Text', View: 'View' };
  native.Keyboard = { dismiss() {} };
  const mocks = { react, 'react-native': native, '../editor/components/controls/Icon': { __esModule: true, default: 'Icon' }, './styles': { authStyles: {} }, './verificationPreview': preview, './verificationTime': time };
  const mod = { exports: {} };
  new Function('require','module','exports','setInterval','clearInterval','__DEV__',code)(
    id => { if (id === './verificationPreview') previewLoads++; return mocks[id] ?? require(id); }, mod, mod.exports,
    fn => { timers.add(fn); return fn; }, fn => timers.delete(fn), dev,
  );
  const render = () => { si = ri = ei = 0; return mod.exports.default({ email: 'a@example.com', service, Field: 'Field',
    primary: (label, onPress, disabled) => ({ type: 'Button', props: { label, onPress, disabled } }), onComplete: () => completed++ }); };
  const find = label => nodes(render()).find(n => n.props.label === label || n.props.accessibilityLabel === label);
  return { render, find, completed: () => completed, refresh: () => listeners.forEach(fn => fn('active')),
    unmount: () => cleanups.forEach(fn => fn?.()), previewLoads: () => previewLoads, timers, listeners };
}

test('개발용 서비스는 개발 모드이면서 주입 서비스가 없을 때만 한 번 불러온다', () => {
  for (const [dev, service, loads] of [[false, undefined, 0], [true, preview.createVerificationPreview(), 0], [true, undefined, 1]]) {
    const ui = setup(service, dev);
    ui.render(); ui.render();
    assert.equal(ui.previewLoads(), loads);
    if (!dev && !service) assert.equal(ui.find('인증번호 받기').props.disabled, true);
    ui.unmount();
  }
});

test('임시 인증은 잘못된 번호·만료를 구분하고 서버 토큰을 만들지 않는다', async () => {
  let now = 1000;
  const service = preview.createVerificationPreview({ now: () => now });
  assert.deepEqual(await service.send('a'), { expiresIn: 180, retryAfter: 30 });
  await assert.rejects(service.verify('a','000000'), /맞지/);
  assert.deepEqual(await service.verify('a','123456'), { preview: true });
  now += 180000;
  await assert.rejects(service.verify('a','123456'), /만료/);
  assert.equal(time.verificationClock(179), '2:59');
  assert.equal(time.remainingSeconds(1000, 1001), 0);
});

test('발송·6자리 입력·오류 해제·성공 후 다음 및 리스너 정리', async () => {
  const ui = setup(preview.createVerificationPreview());
  ui.find('인증번호 받기').props.onPress(); await tick();
  assert.equal(ui.find('인증 확인').props.disabled, true);
  ui.find('인증번호').props.onChange('12a34567');
  assert.equal(ui.find('인증번호').props.value, '123456');
  ui.find('인증번호').props.onChange('000000');
  ui.find('인증 확인').props.onPress(); await tick();
  assert.ok(nodes(ui.render()).some(n => n.props.accessibilityRole === 'alert'));
  ui.find('인증번호').props.onChange('123456');
  assert.ok(!nodes(ui.render()).some(n => n.props.accessibilityRole === 'alert'));
  ui.find('인증 확인').props.onPress(); await tick();
  assert.equal(ui.find('인증번호'), undefined);
  assert.equal(ui.find('인증번호 재전송'), undefined);
  assert.ok(nodes(ui.render()).some(n => n.type === 'Icon' && n.props.name === 'check'));
  ui.find('다음').props.onPress(); assert.equal(ui.completed(), 1);
  ui.unmount(); assert.equal(ui.timers.size, 0); assert.equal(ui.listeners.size, 0);
});

test('백그라운드 시간 경과·만료·재전송 초기화를 실제 시각으로 계산한다', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const ui = setup(preview.createVerificationPreview());
  ui.find('인증번호 받기').props.onPress(); await tick();
  assert.equal(ui.find('인증번호 재전송').props.disabled, true);
  ui.find('인증번호').props.onChange('123456');
  now += 180000; ui.refresh();
  assert.equal(ui.find('인증 확인').props.disabled, true);
  assert.equal(ui.find('인증번호 재전송').props.disabled, false);
  ui.find('인증번호 재전송').props.onPress(); await tick();
  assert.equal(ui.find('인증번호').props.value, '');
  assert.equal(ui.find('인증번호').props.editable, true);
  ui.unmount();
});

test('요청 연타·화면 종료 후 늦은 응답을 처리한다', async () => {
  let resolve, count = 0;
  const ui = setup({ send: () => { count++; return new Promise(r => { resolve = r; }); } });
  const button = ui.find('인증번호 받기'); button.props.onPress(); button.props.onPress();
  assert.equal(count, 1); ui.unmount(); resolve({ expiresIn: 180, retryAfter: 30 }); await tick();
  assert.equal(ui.completed(), 0); assert.equal(ui.find('인증번호'), undefined);
});

test('잘못된 발송 응답은 오류를 표시하고 재시도할 수 있다', async () => {
  for (const result of [null, undefined, {}, { expiresIn: '180', retryAfter: 0 },
    { expiresIn: NaN, retryAfter: 0 }, { expiresIn: Infinity, retryAfter: 0 },
    { expiresIn: 0, retryAfter: 0 }, { expiresIn: -1, retryAfter: 0 },
    { expiresIn: 180, retryAfter: -1 }, { expiresIn: 180 },
    { expiresIn: 180, retryAfter: Infinity }, { expiresIn: 1e30, retryAfter: 0 }]) {
    let calls = 0;
    const ui = setup({ send: async () => ++calls === 1 ? result : { expiresIn: 180, retryAfter: 0 } });
    ui.find('인증번호 받기').props.onPress(); await tick();
    assert.ok(nodes(ui.render()).some(n => n.props.accessibilityRole === 'alert'));
    assert.equal(ui.find('인증번호'), undefined);
    assert.equal(ui.find('인증번호 받기').props.disabled, false);
    ui.find('인증번호 받기').props.onPress(); await tick();
    assert.ok(ui.find('인증번호')); ui.unmount();
  }
});

test('발송·확인에서 null 또는 비정상 예외가 와도 안내하고 다시 입력할 수 있다', async () => {
  for (const reason of [null, undefined, 'failure', { message: {} }]) {
    const ui = setup({ send: async () => { throw reason; } });
    ui.find('인증번호 받기').props.onPress(); await tick();
    assert.ok(nodes(ui.render()).some(n => n.props.accessibilityRole === 'alert'));
    assert.equal(ui.find('인증번호 받기').props.disabled, false); ui.unmount();
    const verifying = setup({ send: async () => ({ expiresIn: 180, retryAfter: 0 }), verify: async () => { throw reason; } });
    verifying.find('인증번호 받기').props.onPress(); await tick();
    verifying.find('인증번호').props.onChange('123456');
    verifying.find('인증 확인').props.onPress(); await tick();
    assert.ok(nodes(verifying.render()).some(n => n.props.accessibilityRole === 'alert'));
    assert.equal(verifying.find('인증번호').props.editable, true); verifying.unmount();
  }
});

test('화면 종료 후 늦은 인증 성공은 완료 화면을 표시하지 않는다', async () => {
  let resolve;
  const ui = setup({ send: async () => ({ expiresIn: 180, retryAfter: 0 }), verify: () => new Promise(r => { resolve = r; }) });
  ui.find('인증번호 받기').props.onPress(); await tick();
  ui.find('인증번호').props.onChange('123456');
  ui.find('인증 확인').props.onPress(); ui.unmount(); resolve(); await tick();
  assert.equal(ui.find('다음'), undefined);
});

test('발송·확인 요청이 겹쳐도 동시에 하나만 실행하고 확인 성공 후 재전송을 막는다', async () => {
  let resolveVerify, checks = 0, sends = 0;
  const ui = setup({ send: async () => { sends++; return { expiresIn: 180, retryAfter: 0 }; },
    verify: () => { checks++; return new Promise(r => { resolveVerify = r; }); } });
  ui.find('인증번호 받기').props.onPress(); await tick();
  ui.find('인증번호').props.onChange('123456');
  const verify = ui.find('인증 확인').props.onPress;
  const resend = ui.find('인증번호 재전송').props.onPress;
  verify(); verify(); resend();
  assert.equal(checks, 1); assert.equal(sends, 1);
  resolveVerify(); await tick();
  assert.ok(ui.find('다음')); assert.equal(ui.find('인증번호 재전송'), undefined);
  ui.unmount();
});

test('재전송 실패 후 기존 입력을 유지하고 다시 재전송하면 번호와 오류를 초기화한다', async () => {
  let sends = 0;
  const ui = setup({ send: async () => { if (++sends === 2) throw new Error('발송 실패'); return { expiresIn: 180, retryAfter: 0 }; } });
  ui.find('인증번호 받기').props.onPress(); await tick();
  ui.find('인증번호').props.onChange('123456');
  ui.find('인증번호 재전송').props.onPress(); await tick();
  assert.equal(ui.find('인증번호').props.value, '123456');
  assert.ok(nodes(ui.render()).some(n => n.props.children === '발송 실패'));
  ui.find('인증번호 재전송').props.onPress(); await tick();
  assert.equal(ui.find('인증번호').props.value, '');
  assert.ok(!nodes(ui.render()).some(n => n.props.accessibilityRole === 'alert'));
  ui.unmount();
});
