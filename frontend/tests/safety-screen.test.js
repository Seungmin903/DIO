import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as model from '../src/safety/safetyModel.js';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
const code = babel.transformSync(readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
// 신고 접수는 확인창(접수하기)을 한 번 거친다(지라 686)
const submitReport = async ui => { ui.find('신고 접수하기').props.onPress(); const dialog = nodes(ui.render()).find(n => n.props?.confirmLabel === '접수하기'); return dialog.props.onConfirm(); };
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const label = n => n.props?.label || n.props?.accessibilityLabel || [n.props?.children].flat(Infinity).filter(x => typeof x === 'string' || typeof x === 'number').join('');
function setup(report, store) {
  const states = [], refs = [], deps = [], cleanups = []; let si = 0, ri = 0, ei = 0, serial = 0;
  const react = {
    useState: initial => { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef: initial => refs[ri++] ??= { current: initial },
    useEffect: (fn, next) => { const i = ei++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn(); } },
  };
  const native = { Platform: { OS: 'android' } };
  for (const type of ['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View']) native[type] = type;
  const mocks = { react, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'safe' }, './safetyModel': model,
    '../shared/useFormFactor': { useFormFactor: () => ({ isPhone: true }) }, '../shared/theme': { colors: {} },
    './styles': { safetyStyles: new Proxy({}, { get: (_, key) => key }) }, 'expo-crypto': { randomUUID: () => `22222222-2222-4222-8222-${String(++serial).padStart(12, '0')}` } };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), mod, mod.exports);
  const target = { id: '25', nickname: '친구', role: 'EDITOR', participation: 'CURRENT' };
  const props = { request: { kind: 'participants', target, diary: { id: '11111111-1111-4111-8111-111111111111', title: '기록', members: [target] } },
    user: { userId: '10', nickname: '나' }, store: { mode: 'server', participants: async () => [target], refresh() {}, report },
    state: { status: 'ready', blocks: [] }, onClose() {}, evidencePicker: async () => [{ uri: 'file:///evidence.png', fileName: 'evidence.png', mimeType: 'image/png', size: 500 }] };
  if (store) props.store = store;
  const render = () => { si = ri = ei = 0; if (store) props.state = store.getSnapshot(); return mod.exports.default(props); };
  return { render, find: text => nodes(render()).find(n => label(n) === text), unmount: () => cleanups.forEach(fn => fn?.()) };
}
test('신고 화면은 실패 후 설명·증빙·요청 ID를 보존하고 성공한 뒤 새 신고에만 ID를 바꾼다', async () => {
  const calls = [];
  const ui = setup(async input => { calls.push(input); if (calls.length === 1) throw new Error('네트워크 실패'); return { reportId: '101' }; });
  try {
    ui.render(); await new Promise(resolve => setImmediate(resolve));
    ui.find('신고하기').props.onPress(); ui.find('욕설·괴롭힘').props.onPress();
    ui.find('상세 설명').props.onChangeText('구체적인 설명');
    await ui.find('사진 첨부 (0/3)').props.onPress();
    await submitReport(ui);
    assert.equal(ui.find('상세 설명').props.value, '구체적인 설명'); assert.ok(ui.find('증빙 사진 1 확대'));
    await submitReport(ui);
    assert.equal(calls[0].clientRequestId, calls[1].clientRequestId); assert.equal(calls[1].photos.length, 1);
    ui.find('확인').props.onPress(); ui.find('친구 메뉴').props.onPress(); ui.find('신고하기').props.onPress(); ui.find('욕설·괴롭힘').props.onPress();
    await submitReport(ui);
    assert.notEqual(calls[2].clientRequestId, calls[1].clientRequestId); assert.equal(calls[2].description, '');
  } finally { ui.unmount(); }
});

test('내용을 바꾼 재시도가 충돌해도 최초 설명·사유·사진을 복원해 같은 ID로 재시도한다', async () => {
  const calls = [];
  const ui = setup(async input => {
    calls.push(input);
    if (calls.length < 3) throw new Error(calls.length === 1 ? '응답 유실' : 'REPORT_REQUEST_CONFLICT');
    return { reportId: '101' };
  });
  try {
    ui.render(); await new Promise(resolve => setImmediate(resolve));
    ui.find('신고하기').props.onPress(); ui.find('욕설·괴롭힘').props.onPress();
    ui.find('상세 설명').props.onChangeText('처음 전송한 설명');
    await ui.find('사진 첨부 (0/3)').props.onPress();
    await submitReport(ui);
    ui.find('기타').props.onPress(); ui.find('상세 설명').props.onChangeText('바뀐 설명');
    ui.find('증빙 사진 1 삭제').props.onPress();
    await submitReport(ui);
    assert.equal(calls[1].description, '바뀐 설명'); assert.equal(calls[1].photos.length, 0);
    ui.find('처음 전송한 내용으로 되돌리기').props.onPress();
    assert.equal(ui.find('상세 설명').props.value, '처음 전송한 설명');
    assert.equal(ui.find('욕설·괴롭힘').props.accessibilityState.checked, true);
    assert.ok(ui.find('증빙 사진 1 확대'));
    await submitReport(ui);
    assert.deepEqual(calls[2], calls[0]);
    assert.equal(calls[1].clientRequestId, calls[0].clientRequestId);
    assert.equal(ui.find('처음 전송한 내용으로 되돌리기'), undefined);
  } finally { ui.unmount(); }
});

test('참여자 화면은 기존 차단 목록을 먼저 조회하고 차단·해제 후에도 다른 차단을 보존한다', async () => {
  let resolveList, loads = 0;
  const existing = { id: '24', nickname: '기존 친구', blockedAt: '2026-11-03' };
  const store = model.createSafetyStore({ mode: 'server',
    listBlocks: () => { loads++; return new Promise(resolve => { resolveList = resolve; }); },
    listParticipants: async () => [{ id: '25', nickname: '친구', blockedByMe: false }],
    block: async () => ({ id: '25', nickname: '친구', blockedAt: '2026-11-04' }), unblock: async () => {},
  });
  const ui = setup(async () => {}, store);
  try {
    ui.render(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(loads, 1); assert.equal(ui.find('차단하기').props.disabled, true);
    resolveList([existing]); await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.find('차단하기').props.disabled, false);
    ui.find('차단하기').props.onPress();
    let dialog = nodes(ui.render()).find(n => n.props?.open && n.props?.confirmLabel === '차단하기');
    dialog.props.onConfirm(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(store.getSnapshot().blocks.map(row => row.id), ['25', '24']);
    ui.find('친구 메뉴').props.onPress(); ui.find('차단 해제').props.onPress();
    dialog = nodes(ui.render()).find(n => n.props?.open && n.props?.confirmLabel === '차단 해제');
    dialog.props.onConfirm(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(store.getSnapshot().blocks, [existing]);
    ui.find('친구 메뉴').props.onPress();
    assert.equal(ui.find('차단하기').props.disabled, false);
  } finally { ui.unmount(); }
});

test('686: 신고 접수는 확인창을 거치고, "신고와 함께 차단하기"를 켜면 접수 뒤 차단한다', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8')
  assert.match(src, /onPress=\{\(\) => setQuestion\(\{ kind: 'submit' \}\)\}/)
  assert.match(src, /question\?\.kind === 'submit' \? '신고를 접수할까요\?'/)
  assert.match(src, /accessibilityLabel="신고와 함께 차단하기"/)
  assert.match(src, /if \(alsoBlock && !blocked\(target\.id\)\) \{\s*try \{ await store\.block\(target, request\.diary\.sharedDiaryId \|\| request\.diary\.id\); \} catch \{ blockError = true; \}/)
  assert.match(src, /신고는 접수됐지만 차단하지 못했어요\./)
})

test('AI 리뷰: 신고와 함께 차단하기 · 차단 실패 표시는 초안을 비울 때(다른 사람 신고 · 닫기) 함께 꺼진다', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8')
  assert.match(src, /function clearDraft\(\) \{[^}]*setAlsoBlock\(false\); setBlockFailed\(false\); \}/)
  assert.match(src, /function startReport\(member\) \{ clearDraft\(\);/)
})

test('머리줄 ‹ · X 통일: X 는 창 전체를 닫고, 쓰던 신고는 버릴지 묻고, 공유 다이어리 안내는 ‹ 와 같게 닫는다', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8')
  assert.match(src, /\{!isPhone && <Pressable accessibilityRole="button" accessibilityLabel="창 닫기" disabled=\{busy\} onPress=\{closeAll\}/)
  assert.match(src, /if \(screen === 'warning'\) \{ back\(\); return; \}/)
  assert.match(src, /if \(screen === 'report' && dirty\) \{ setQuestion\(\{ kind: 'discard', closeAll: true \}\); return; \}/)
  assert.match(src, /if \(request\.direct \|\| current\.closeAll\) \{ onClose\(\); return; \}/)
})
