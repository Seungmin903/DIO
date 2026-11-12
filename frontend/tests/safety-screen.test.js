import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as model from '../src/safety/safetyModel.js';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json')), babel = expo('@babel/core');
const compile = file => babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code;
const code = compile('../src/safety/SafetyScreen.js');
const providerCode = compile('../src/safety/SafetyProvider.js');
// 신고 접수는 확인창(접수하기)을 한 번 거친다(지라 686)
const submitReport = async ui => { ui.find('신고 접수하기').props.onPress(); const dialog = nodes(ui.render()).find(n => n.props?.confirmLabel === '접수하기'); return dialog.props.onConfirm(); };
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const label = n => n.props?.label || n.props?.accessibilityLabel || [n.props?.children].flat(Infinity).filter(x => typeof x === 'string' || typeof x === 'number').join('');
function setup(report, store, screenProps = {}) {
  const states = [], refs = [], deps = [], cleanups = []; let si = 0, ri = 0, ei = 0, serial = 0;
  const react = {
    useState: initial => { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef: initial => refs[ri++] ??= { current: initial },
    useEffect: (fn, next) => { const i = ei++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn(); } },
  };
  const native = { Platform: { OS: 'android' } };
  for (const type of ['ActivityIndicator', 'Image', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View']) native[type] = type;
  const mocks = { react, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'safe', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }, './safetyModel': model,
    '../shared/useFormFactor': { useFormFactor: () => ({ isPhone: true }) }, '../shared/theme': { colors: {} },
    './styles': { safetyStyles: new Proxy({}, { get: (_, key) => key }) }, 'expo-crypto': { randomUUID: () => `22222222-2222-4222-8222-${String(++serial).padStart(12, '0')}` } };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), mod, mod.exports);
  const target = { id: '25', nickname: '친구', role: 'EDITOR', participation: 'CURRENT' };
  const props = { request: { kind: 'participants', target, diary: { id: '11111111-1111-4111-8111-111111111111', title: '기록', members: [target] } },
    user: { userId: '10', nickname: '나' }, store: { mode: 'server', participants: async () => [target], refresh() {}, report },
    state: { status: 'ready', blocks: [] }, onClose() {}, evidencePicker: async () => [{ uri: 'file:///evidence.png', fileName: 'evidence.png', mimeType: 'image/png', size: 500 }], ...screenProps };
  if (store) props.store = store;
  const render = () => { si = ri = ei = 0; if (store) props.state = store.getSnapshot(); return mod.exports.default(props); };
  return { render, find: text => nodes(render()).find(n => label(n) === text), unmount: () => cleanups.forEach(fn => fn?.()) };
}
const sharedDiary = { id: 'local-diary', sharedDiaryId: 'shared-diary', title: '공유 기록' };
const blockedMember = { id: '25', nickname: '친구', role: 'EDITOR', participation: 'CURRENT', blockedByMe: true };
const flush = () => new Promise(resolve => setImmediate(resolve));

function mountProvider(overrides) {
  let request, pendingRef, aliveRef, jobRef, cleanup, refIndex;
  const adapter = {
    mode: 'server', listParticipants: async () => [blockedMember],
    listWarningDismissals: async () => [], dismissWarning: async () => {},
    ...overrides,
  };
  const store = model.createSafetyStore(adapter);
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useState: () => [request, next => { request = next; }],
    useMemo: factory => factory(),
    useCallback: callback => callback,
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useRef: initial => {
      switch (refIndex++) {
        case 0: return pendingRef ??= { current: initial };
        case 1: return aliveRef ??= { current: initial };
        default: return jobRef ??= { current: initial };
      }
    },
    useEffect: effect => { cleanup ??= effect(); },
  };
  const mocks = { react, './safetyModel': { ...model, createSafetyStore: () => store } };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', providerCode)(
    id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }),
    mod, mod.exports,
  );
  const user = { mode: 'authenticated', userId: '10' };
  const render = () => {
    refIndex = 0;
    return mod.exports.default({ user, adapter }).props;
  };
  const context = render().value;
  return { open: context.canOpenDiary, warning: () => render().children[1]?.props, unmount: () => cleanup() };
}

test('서버의 닫기 기록이 있으면 경고를 건너뛰고 차단 참여자가 없으면 기록을 조회하지 않는다', async t => {
  const lookup = t.mock.fn(async () => ['25']);
  const participants = t.mock.fn(async id => id === sharedDiary.sharedDiaryId ? [blockedMember] : []);
  const ui = mountProvider({ listWarningDismissals: lookup, listParticipants: participants });
  t.after(ui.unmount);
  assert.equal(await ui.open(sharedDiary), true);
  assert.equal(ui.warning(), undefined);
  assert.deepEqual(lookup.mock.calls[0].arguments, [sharedDiary.sharedDiaryId]);
  assert.equal(await ui.open({ ...sharedDiary, sharedDiaryId: 'another-shared-diary' }), true);
  assert.equal(ui.warning(), undefined);
  assert.equal(lookup.mock.callCount(), 1);
  assert.equal(participants.mock.callCount(), 2);
});

test('기록 조회 실패 시 경고가 뜨고 저장 실패 후 같은 경고에서 다시 시도할 수 있다', async t => {
  let attempts = 0;
  const save = t.mock.fn(async () => { if (++attempts === 1) throw new Error('저장 실패'); });
  const ui = mountProvider({ listWarningDismissals: async () => { throw new Error('조회 실패'); }, dismissWarning: save });
  t.after(ui.unmount);
  let admitted;
  const opening = ui.open(sharedDiary).then(result => { admitted = result; });
  await flush();
  assert.equal(ui.warning().request.kind, 'warning');
  const screen = setup(undefined, undefined, ui.warning());
  t.after(screen.unmount);
  screen.find('이 다이어리에서 다시 보지 않기').props.onPress();
  await screen.find('계속하기').props.onPress();
  await flush();
  assert.ok(screen.find('저장 실패'));
  assert.equal(admitted, undefined);
  assert.ok(ui.warning());
  await screen.find('계속하기').props.onPress();
  await opening;
  assert.equal(admitted, true);
  assert.equal(ui.warning(), undefined);
  assert.deepEqual(save.mock.calls.map(call => call.arguments), [[sharedDiary.sharedDiaryId, ['25']], [sharedDiary.sharedDiaryId, ['25']]]);
});

test('이전 경고의 저장이 늦게 끝나도 새 경고를 닫거나 새 입장 요청을 해소하지 않는다', async t => {
  let completeSave;
  const ui = mountProvider({ dismissWarning: () => new Promise(resolve => { completeSave = resolve; }) });
  t.after(ui.unmount);
  const first = ui.open(sharedDiary);
  await flush();
  const previous = ui.warning();
  const saving = previous.onWarning(true, true, previous.request.rows, sharedDiary);

  const nextDiary = { ...sharedDiary, id: 'next-local-diary', sharedDiaryId: 'next-shared-diary' };
  const second = ui.open(nextDiary);
  assert.equal(await first, false);
  await flush();
  completeSave();
  await saving;

  const next = ui.warning();
  assert.equal(next.request.diary, nextDiary);
  await next.onWarning(false, false, next.request.rows, nextDiary);
  assert.equal(await second, false);
});

test('신고 화면은 실패 후 설명·증빙·요청 ID를 보존하고 성공한 뒤 새 신고에만 ID를 바꾼다', async () => {
  const calls = [];
  const ui = setup(async input => { calls.push(input); if (calls.length === 1) throw new Error('네트워크 실패'); return { reportId: '101' }; });
  try {
    ui.render(); await new Promise(resolve => setImmediate(resolve));
    ui.find('신고하기').props.onPress(); ui.find('욕설·괴롭힘').props.onPress(); ui.find('다음').props.onPress();
    ui.find('상세 설명').props.onChangeText('구체적인 설명');
    await ui.find('사진 첨부 (0/3)').props.onPress();
    await submitReport(ui);
    assert.equal(ui.find('상세 설명').props.value, '구체적인 설명'); assert.ok(ui.find('증빙 사진 1 확대'));
    await submitReport(ui);
    assert.equal(calls[0].clientRequestId, calls[1].clientRequestId); assert.equal(calls[1].photos.length, 1);
    ui.find('확인').props.onPress(); ui.find('친구 메뉴').props.onPress(); ui.find('신고하기').props.onPress(); ui.find('욕설·괴롭힘').props.onPress(); ui.find('다음').props.onPress();
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
    ui.find('신고하기').props.onPress(); ui.find('욕설·괴롭힘').props.onPress(); ui.find('다음').props.onPress();
    ui.find('상세 설명').props.onChangeText('처음 전송한 설명');
    await ui.find('사진 첨부 (0/3)').props.onPress();
    await submitReport(ui);
    // 사유는 작성 화면의 '신고 사유' 줄을 눌러 사유 고르기로 돌아가 바꾼다(2026-11-09 지라 537 두 단계)
    ui.find('신고 사유 욕설·괴롭힘 바꾸기').props.onPress(); ui.find('기타').props.onPress(); ui.find('다음').props.onPress();
    ui.find('상세 설명').props.onChangeText('바뀐 설명');
    ui.find('증빙 사진 1 삭제').props.onPress();
    await submitReport(ui);
    assert.equal(calls[1].description, '바뀐 설명'); assert.equal(calls[1].photos.length, 0);
    ui.find('처음 전송한 내용으로 되돌리기').props.onPress();
    assert.equal(ui.find('상세 설명').props.value, '처음 전송한 설명');
    assert.ok(ui.find('신고 사유 욕설·괴롭힘 바꾸기'));
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

test('537: 신고는 사유 고르기(설문 동그라미 + 다음) → 작성 두 단계, 접수는 확인창 한 번', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8')
  assert.match(src, /accessibilityRole="radio"/)
  assert.match(src, /<SafetyButton disabled=\{busy \|\| !reason\} onPress=\{\(\) => \{ setError\(''\); setStep\('write'\); \}\}>다음<\/SafetyButton>/)
  assert.match(src, /if \(screen === 'report' && step === 'write'\) \{ setStep\('reason'\); setError\(''\); return; \}/)
  assert.match(src, /onPress=\{\(\) => setQuestion\(\{ kind: 'submit' \}\)\}/)
  assert.match(src, /question\?\.kind === 'submit' \? `\$\{target\?\.nickname \|\| '사용자'\}님을 신고할까요\?`/)
})

test('537: 차단은 신고와 섞지 않는다 — 체크 대신 접수 화면의 "○○님 차단하기"', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /신고와 함께 차단하기|alsoBlock/)
  assert.match(src, /accessibilityLabel=\{`\$\{target\.nickname\}님 차단하기`\} disabled=\{busy\} onPress=\{\(\) => askBlock\(target\)\}/)
  assert.match(src, /function clearDraft\(\) \{[^}]*setStep\('reason'\); \}/)
  assert.match(src, /function startReport\(member\) \{ clearDraft\(\);/)
  // 차단 확인창 첫 줄: 백엔드가 상대에게 알리지 않는다(BlockService.block 은 user_blocks 한 줄만 저장)
  assert.match(src, /const blockMessage = '· 상대에게 알리지 않아요\\n· 서로 이메일 초대를/)
})

test('537: 카드 없이 줄 + 구분선, 머리줄 연보라 · 본문 흰색, 참여 안내는 가운데 모달', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8')
  const st = fs.readFileSync(new URL('../src/safety/styles.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /s\.card\b/)
  assert.match(st, /panel: \{[^}]*backgroundColor: c\.surface,/)
  assert.match(st, /header: \{[^}]*backgroundColor: c\.surfaceSoft \}/)
  assert.match(st, /listRow: \{ minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c\.cardBorder \}/)
  assert.match(src, /if \(screen === 'warning'\) \{\s*return <EditorModal visible transparent animationType="none" onRequestClose=\{back\}>/)
  assert.match(src, /<View style=\{s\.dialogActions\}>\s*<SafetyButton secondary disabled=\{busy\} onPress=\{back\} style=\{s\.grow\}>돌아가기<\/SafetyButton>/)
})

test('머리줄 ‹ · X 통일: X 는 창 전체를 닫고, 쓰던 신고는 버릴지 묻고, 공유 다이어리 안내는 ‹ 와 같게 닫는다', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/safety/SafetyScreen.js', import.meta.url), 'utf8')
  assert.match(src, /\{!isPhone && <Pressable accessibilityRole="button" accessibilityLabel="창 닫기" disabled=\{busy\} onPress=\{closeAll\}/)
  assert.match(src, /if \(screen === 'warning'\) \{ back\(\); return; \}/)
  assert.match(src, /if \(screen === 'report' && dirty\) \{ setQuestion\(\{ kind: 'discard', closeAll: true \}\); return; \}/)
  assert.match(src, /if \(request\.direct \|\| current\.closeAll\) \{ onClose\(\); return; \}/)
})
