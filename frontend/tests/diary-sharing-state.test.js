import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationSender } from '../src/notifications/notificationPresentation.js';
import * as validation from '../src/sharing/sharingContracts.js';
const require = createRequire(import.meta.url),
  expo = createRequire(require.resolve('expo/package.json')),
  babel = expo('@babel/core');
const code = babel.transformSync(
  readFileSync(new URL('../src/sharing/SharingHub.js', import.meta.url), 'utf8'),
  {
    configFile: false,
    babelrc: false,
    plugins: [
      [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
      expo.resolve('@babel/plugin-transform-modules-commonjs'),
    ],
  },
).code;
function setup(runtime = {}, photoPicker, initialRequest = { mode: 'invitations' }, callbacks = {}) {
  const states = [],
    refs = [],
    deps = [],
    cleanups = [],
    keyboard = {};
  let si = 0,
    ri = 0,
    ei = 0;
  const react = {
    useState: (initial) => {
      const i = si++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === 'function' ? value(states[i]) : value;
        },
      ];
    },
    useRef: (initial) => (refs[ri++] ??= { current: initial }),
    useEffect: (fn, next) => {
      const i = ei++;
      if (!deps[i] || next.some((v, j) => v !== deps[i][j])) {
        cleanups[i]?.();
        deps[i] = next;
        cleanups[i] = fn();
      }
    },
  };
  const native = {
    Keyboard: {
      dismiss() {},
      addListener: (name, fn) => {
        keyboard[name] = fn;
        return {
          remove() {
            delete keyboard[name];
          },
        };
      },
    },
    Platform: { OS: 'android' },
  };
  for (const name of [
    'ActivityIndicator',
    'KeyboardAvoidingView',
    'Pressable',
    'ScrollView',
    'Switch',
    'Text',
    'TextInput',
    'View',
  ])
    native[name] = name;
  const mocks = {
    react,
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'safe' },
    '../shared/useFormFactor': { useFormFactor: () => ({ isPhone: false }) },
    '../shared/theme': { colors: {} },
    './sharingContracts': validation,
    './sharingApi': { isSharingDiaryId: id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '') },
    './styles': { sharingStyles: new Proxy({}, { get: (_, k) => k }) },
    '../notifications/NotificationPanel': { invitationStatusLabel: (v) => v },
    '../notifications/notificationPresentation': { notificationSender },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) =>
      mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }),
    mod,
    mod.exports,
  );
  const invite = { inviteId: 'i', status: 'PENDING', diary: { diaryId: 'd', title: '초대' } };
  runtime = {
    self: { id: 'self', nickname: '소연' },
    invitationGateway: { get: async () => invite },
    hasMembership: () => false,
    ...runtime,
  };
  const model = {
    store: { refresh() {}, open: async () => invite },
    list: { status: 'success' },
    count: { data: {} },
    items: [{ id: 'n', inviteId: 'i', title: '초대', status: 'PENDING', actionable: true }],
    more: {},
    mutation: { status: 'idle' },
  };
  let request = initialRequest;
  const render = () => {
    si = ri = ei = 0;
    return mod.exports.default({
      request,
      runtime,
      model,
      photoPicker,
      ...callbacks,
      onClose: () => {
        request = null;
      },
    });
  };
  render();
  return {
    render,
    model,
    keyboard,
    runtime,
    unmount: () => cleanups.forEach((fn) => fn?.()),
    close: () => {
      request = null;
    },
  };
}
const nodes = (n) =>
  !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const find = (tree, label) =>
  nodes(tree).find((n) => n.props.accessibilityLabel === label || n.props.label === label);
const tick = () => new Promise((r) => setImmediate(r));

test('수락 후 저장 중 이탈 차단 안내는 공유 창의 접근 가능한 경고로 보이고 재시도할 수 있다', async () => {
  let blocked = true, accepts = 0, opens = 0;
  const diary = { id: 'd', members: [{ id: 'self', nickname: '소연', role: 'EDITOR' }] };
  const ui = setup({ server: true, canOpenDiary: true, accept: async () => { accepts++; return diary; } },
    undefined, { mode: 'invitations' }, { onOpenDiary: async () => {
      opens++; if (blocked) throw new Error('입력·자르기와 저장을 마친 뒤 다이어리를 열어 주세요.');
    } });
  await nickname(ui); find(ui.render(), '수락하고 참여하기').props.onPress(); await tick();
  const alert = nodes(ui.render()).find(n => n.props.accessibilityRole === 'alert' && n.props.children === '입력·자르기와 저장을 마친 뒤 다이어리를 열어 주세요.');
  assert.ok(alert); assert.equal(accepts, 1); assert.equal(opens, 1);
  blocked = false; find(ui.render(), '다이어리 열기').props.onPress(); await tick();
  assert.equal(accepts, 1); assert.equal(opens, 2);
  assert.ok(!nodes(ui.render()).some(n => n.props.accessibilityRole === 'alert' && n.props.children === alert.props.children));
  ui.unmount();
});

test('수락 후 서버 다이어리를 바로 열고 열기 실패는 수락 재전송 없이 재시도한다', async () => {
  let accepts = 0, opens = 0, release;
  const diary = { id: 'd', members: [{ id: 'self', nickname: '소연', role: 'EDITOR' }] };
  const ui = setup({ server: true, canOpenDiary: true, accept: async () => { accepts++; return diary; } },
    undefined, { mode: 'invitations' }, { onOpenDiary: async id => {
      assert.equal(id, 'd');
      if (++opens === 1) throw new Error('페이지를 불러오지 못했어요.');
      await new Promise(resolve => { release = resolve; });
    } });
  await nickname(ui);
  find(ui.render(), '수락하고 참여하기').props.onPress(); await tick();
  assert.equal(accepts, 1); assert.equal(opens, 1);
  assert.equal(find(ui.render(), '수락하고 참여하기'), undefined);
  assert.ok(nodes(ui.render()).some(n => n.props.children === '페이지를 불러오지 못했어요.'));
  const retry = find(ui.render(), '다이어리 열기');
  retry.props.onPress(); retry.props.onPress(); await tick();
  assert.equal(accepts, 1); assert.equal(opens, 2);
  assert.equal(find(ui.render(), '다이어리 열기').props.disabled, true);
  release(); await tick();
  assert.equal(find(ui.render(), '다이어리 열기').props.disabled, false);
  assert.ok(!nodes(ui.render()).some(n => n.props.children === '페이지를 불러오지 못했어요.'));
  ui.unmount();
});

test('프로필 후처리 경고는 수락 완료 화면에 남기고 열기 버튼으로 재시도한다', async () => {
  let opens = 0;
  const diary = { id: 'd', profileWarning: '참여했어요. 프로필을 다시 확인해 주세요.', members: [{ id: 'self', role: 'EDITOR' }] };
  const ui = setup({ server: true, canOpenDiary: true, accept: async () => diary },
    undefined, { mode: 'invitations' }, { onOpenDiary: async () => { opens++; } });
  await nickname(ui); find(ui.render(), '수락하고 참여하기').props.onPress(); await tick();
  assert.equal(opens, 0);
  assert.ok(nodes(ui.render()).some(n => n.props.children === diary.profileWarning));
  find(ui.render(), '다이어리 열기').props.onPress(); await tick();
  assert.equal(opens, 1); ui.unmount();
});

test('개인 사본은 취소 시 생성하지 않고 이름을 유지해 실패 재시도하며 연타를 차단한다', async () => {
  const diary = { id: 'd', title: '공유 기록', members: [{ id: 'self', nickname: '소연', role: 'EDITOR' }] };
  let count = 0, resolve;
  const ui = setup({ registerDiary: () => diary, createPersonalCopy: (_id, title) => {
    count++;
    if (count === 1) return Promise.reject(new Error('다시 시도해 주세요.'));
    return new Promise(done => { resolve = () => done({ id: 'copy', title }); });
  } }, undefined, { diary });
  find(ui.render(), '개인 사본 만들기').props.onPress();
  assert.equal(find(ui.render(), '개인 사본 이름').props.value, '공유 기록 사본');
  find(ui.render(), '사본 만들기 취소').props.onPress();
  assert.equal(count, 0);
  find(ui.render(), '개인 사본 만들기').props.onPress();
  find(ui.render(), '개인 사본 이름').props.onChangeText('   ');
  assert.equal(find(ui.render(), '개인 사본 생성').props.disabled, true);
  find(ui.render(), '개인 사본 이름').props.onChangeText('나의 기록');
  find(ui.render(), '개인 사본 생성').props.onPress();
  await tick();
  assert.equal(find(ui.render(), '개인 사본 이름').props.value, '나의 기록');
  const create = find(ui.render(), '개인 사본 생성');
  create.props.onPress(); create.props.onPress();
  assert.equal(count, 2);
  resolve(); await tick();
  assert.ok(find(ui.render(), '사본 만들기 완료'));
  assert.equal(find(ui.render(), '개인 사본 생성'), undefined);
});

test('실서버와 개인 원본에는 목 사본 만들기를 노출하지 않는다', () => {
  for (const options of [{ server: true }, { localSource: true }]) {
    const diary = { id: 'd', title: '원본', localSource: options.localSource,
      members: [{ id: 'self', nickname: '소연', role: 'OWNER' }] };
    const ui = setup({ ...options, registerDiary: () => diary, getSharing: async () => diary,
      createPersonalCopy: () => { throw new Error('호출 금지'); } }, undefined, { diary });
    assert.equal(find(ui.render(), '개인 사본 만들기'), undefined);
  }
});

test('참여자 ⋯ 말풍선의 소유권 양도: 취소는 유지하고 실패는 재시도, 성공하면 편집자 화면(양도 · 내보내기 없음)', async () => {
  const diary = { id: 'd', title: '관리', members: [
    { id: 'self', nickname: '소연', role: 'OWNER' },
    { id: 'friend', nickname: '모아', role: 'EDITOR' },
  ] };
  let attempts = 0;
  const ui = setup({ registerDiary: () => diary, transferOwner: async () => {
    if (++attempts === 1) throw new Error('다시 시도해 주세요.');
    return { ...diary, members: diary.members.map(m => ({ ...m, role: m.id === 'self' ? 'EDITOR' : 'OWNER' })) };
  } }, undefined, { diary });
  const action = label => { find(ui.render(), '모아 메뉴').props.onPress(); return nodes(ui.render()).find(n => Array.isArray(n.props?.actions))?.props.actions.find(a => a.label === label); };
  assert.equal(find(ui.render(), '참여자 관리'), undefined); // 따로 관리 화면 · 버튼 없음
  action('모아 소유권 양도').onPress();
  const confirm = () => nodes(ui.render()).find(n => n.props.confirmLabel === '양도');
  confirm().props.onCancel();
  assert.equal(attempts, 0);
  action('모아 소유권 양도').onPress();
  confirm().props.onConfirm();
  await tick();
  action('모아 소유권 양도').onPress();
  confirm().props.onConfirm();
  await tick();
  assert.equal(attempts, 2);
  assert.ok(find(ui.render(), '다이어리 참여 해제'));
  // 이제 편집자라 양도 · 내보내기가 없다(신고 · 차단 연결도 없는 하네스라 ⋯ 자체가 없다)
  assert.equal(find(ui.render(), '모아 메뉴'), undefined);
});

test('실서버 참여자 ⋯ 말풍선에도 연결된 양도 · 내보내기가 있다(소유자)', () => {
  const diary = { id: 'd', title: '관리', members: [
    { id: 'self', nickname: '소연', role: 'OWNER' }, { id: 'friend', nickname: '모아', role: 'EDITOR' },
  ] };
  const ui = setup({ server: true, registerDiary: () => diary, getSharing: async () => diary,
    transferOwner: () => { throw new Error('호출하면 안 됨'); } }, undefined, { diary });
  find(ui.render(), '모아 메뉴').props.onPress();
  const actions = nodes(ui.render()).find(n => Array.isArray(n.props?.actions)).props.actions.map(a => a.label);
  assert.ok(actions.includes('모아 소유권 양도'));
  assert.ok(actions.includes('모아 내보내기'));
});

test('초대 상세는 취소·만료·정원 초과를 구분하고 사용 불가 초대에 수락을 제공하지 않는다', async () => {
  for (const [status, full, message] of [['REVOKED', false, '취소된 초대예요.'], ['EXPIRED', false, '만료된 초대예요.'], ['PENDING', true, '참여 인원이 가득 찼어요.']]) {
    const ui = setup({ invitationGateway: { get: async () => ({ inviteId: 'i', status, full, inviter: '친구', memberCount: 4, diary: { title: '초대 기록' } }) } });
    find(ui.render(), '초대 초대 상세').props.onPress();
    await tick();
    const tree = ui.render();
    assert.ok(nodes(tree).some(n => n.props?.children === message));
    assert.equal(find(tree, '참여 프로필 설정'), undefined);
    assert.ok(find(tree, '초대 기록 다이어리 표지'));
    find(tree, '이전 공유 화면').props.onPress();
    assert.ok(find(ui.render(), '초대 초대 상세'));
    ui.unmount();
  }
});

test('초대 상세에서 참여 프로필로 이동하기 전에 최신 상태를 재확인한다', async () => {
  let status = 'PENDING';
  const ui = setup({ invitationGateway: { get: async () => ({ inviteId: 'i', status, diary: { title: '초대 기록' } }) } });
  find(ui.render(), '초대 초대 상세').props.onPress();
  await tick();
  status = 'REVOKED';
  find(ui.render(), '참여 프로필 설정').props.onPress();
  await tick();
  assert.equal(find(ui.render(), '다이어리 닉네임'), undefined);
  assert.ok(nodes(ui.render()).some(n => n.props?.children === '취소된 초대예요.'));
  ui.unmount();
});

test('이메일 초대는 잘못된 입력·연타를 차단하고 실패 후 입력을 유지해 재시도한다', async () => {
  const diary = { id: 'local', members: [{ id: 'self', role: 'OWNER' }] };
  let resolve, calls = 0;
  const ui = setup({ registerDiary: () => diary, sendEmailInvite: () => {
    calls++;
    return new Promise(r => { resolve = r; });
  } }, undefined, { diary });
  // 이메일 칸은 공유 창 첫 화면 초대 구역에 바로 있다(노션처럼, 지라 686)
  assert.equal(find(ui.render(), '참여자의 내보내기 허용'), undefined);
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, true);
  find(ui.render(), '초대할 이메일').props.onChangeText('friend@example.com');
  const send = find(ui.render(), '이메일 초대 보내기');
  send.props.onPress(); send.props.onPress();
  assert.equal(calls, 1);
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, true);
  resolve({ ...diary, emailInvites: [{ id: 'sent', email: 'friend@example.com', status: 'PENDING' }] });
  await tick();
  assert.equal(find(ui.render(), '초대할 이메일').props.value, '');
  // 보낸 초대 목록 화면은 없다(노션처럼 칸 + 초대만, 지라 686)
  assert.equal(find(ui.render(), '보낸 초대'), undefined);
  assert.equal(find(ui.render(), 'friend@example.com 초대 취소'), undefined);
  assert.ok(find(ui.render(), '초대 링크 복사'));
  ui.runtime.sendEmailInvite = async () => { throw new Error('통신 실패'); };
  find(ui.render(), '초대할 이메일').props.onChangeText('retry@example.com');
  find(ui.render(), '이메일 초대 보내기').props.onPress();
  await tick();
  assert.equal(find(ui.render(), '초대할 이메일').props.value, 'retry@example.com');
  assert.ok(nodes(ui.render()).some(n => n.props?.children === '통신 실패'));
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, false);
  ui.unmount();
});

test('정원 초과와 서버 미연결에서는 목 이메일 요청을 실행할 수 없다', async () => {
  const full = { id: 'local', members: [{ id: 'self', role: 'OWNER' }, ...['a', 'b', 'c'].map(id => ({ id, role: 'EDITOR' }))] };
  const ui = setup({ registerDiary: () => full, sendEmailInvite: async () => full }, undefined, { diary: full });
  assert.equal(find(ui.render(), '추가 인원 안내'), undefined); // 유료 안내는 출시 전까지 감춘다
  // 가득 차면 이메일 칸 · 초대 · 복사가 모두 꺼지고 상태 줄이 이유를 말한다(지라 686)
  assert.ok(nodes(ui.render()).some(n => [n.props?.children].flat().join('') === '정원이 다 차서 더 초대할 수 없어요.'));
  assert.equal(find(ui.render(), '초대할 이메일').props.editable, false);
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, true);
  assert.equal(find(ui.render(), '초대 링크 복사').props.disabled, true);
  ui.unmount();
  const diary = { id: 'server', members: [{ id: 'self', role: 'OWNER' }] };
  const server = setup({ server: true, registerDiary: () => diary, getSharing: async () => diary }, undefined, { diary });
  await tick();
  assert.equal(find(server.render(), '초대할 이메일'), undefined);
  server.unmount();
});

test('소유자가 연 공유 창에 쓸 수 있는 링크가 없으면 바로 하나 만들고(콜드 스타트), 쓸 수 있는 링크는 만료 시각만 적는다', async () => {
  const diary = { id: 'local', link: 'https://dio.example/invite/old', linkExpiresAt: '2000-01-01T00:00:00Z',
    members: [{ id: 'self', role: 'OWNER' }],
    emailInvites: [{ id: 'sent', email: 'friend@example.com', status: 'PENDING' }] };
  let calls = 0, made = 0;
  const fresh = { ...diary, link: 'https://dio.example/invite/new', linkExpiresAt: '2099-01-01T11:41:00' };
  const ui = setup({ registerDiary: () => diary, sendEmailInvite: async () => diary,
    createLink: async () => { made++; return fresh; },
    cancelEmailInvite: async () => { calls++; return { ...diary, emailInvites: [{ ...diary.emailInvites[0], status: 'CANCELLED' }] }; },
  }, undefined, { diary });
  ui.render(); // 만료 상태 effect가 적용된 다음 렌더를 확인한다.
  ui.render(); await tick();
  // 콜드 스타트: 소유자가 창을 열었는데 쓸 수 있는 링크가 없으면 바로 하나 만든다(한 번만, 지라 686)
  ui.render(); await tick();
  assert.equal(made, 1);
  assert.ok(nodes(ui.render()).some(n => n.props?.children === 'https://dio.example/invite/new'));
  ui.render(); await tick();
  assert.equal(made, 1, '같은 링크 상태로 두 번 만들지 않는다');
  // 쓸 수 있는 링크: 칸에 주소, 상태 줄에 만료 시각만, '초대 링크로 초대' 옆 새로고침 → 확인창
  const live = setup({ registerDiary: () => fresh, createLink: async () => { made++; return fresh; } }, undefined, { diary: fresh });
  live.render(); live.render();
  assert.ok(nodes(live.render()).some(n => n.props?.children === 'https://dio.example/invite/new'));
  assert.ok(nodes(live.render()).some(n => [n.props?.children].flat().join('') === '초대 링크가 오전 11:41에 만료돼요.'));
  find(live.render(), '초대 링크 다시 만들기').props.onPress();
  assert.ok(nodes(live.render()).some(n => n.props?.confirmLabel === '다시 만들기'));
  live.unmount();
  ui.unmount();
});
test('실제 공유에서 편집자는 링크를 복사 · 다시 만들 수 없고(소유자만) 지원하지 않는 내보내기 설정을 숨긴다', async () => {
  const diary = { id: 'server-diary', title: '서버 기록', members: [{ id: 'self', nickname: '소연', role: 'EDITOR' }] };
  const ui = setup({ server: true, supportsExportSettings: false, canOpenDiary: false,
    registerDiary: () => diary, getSharing: async () => diary }, undefined, { diary });
  await tick();
  const tree = ui.render();
  assert.equal(find(tree, '초대 링크 복사'), undefined);
  assert.equal(find(tree, '초대 링크 다시 만들기'), undefined);
  assert.equal(find(tree, '참여자의 내보내기 허용'), undefined);
  assert.equal(find(tree, '다이어리 열기'), undefined);
  assert.equal(find(tree, '완료'), undefined); // 닫기는 머리줄 X(지라 686)
  assert.ok(find(tree, '공유 창 닫기'));
  ui.unmount();
});

test('실제 받은 초대는 읽음·삭제를 가장하지 않고 별도 확인 버튼 없이 별칭 형식을 검증한다', async () => {
  const ui = setup({ server: true, supportsReadState: false, checkNickname: async () => '소연' });
  assert.equal(find(ui.render(), '모두 읽음'), undefined);
  assert.equal(find(ui.render(), '초대 알림 삭제'), undefined);
  await nickname(ui);
  assert.equal(find(ui.render(), '다이어리 닉네임 형식 확인'), undefined);
  assert.equal(find(ui.render(), '다이어리 닉네임 중복 확인'), undefined);
  ui.unmount();
});
async function nickname(ui) {
  find(ui.render(), '초대 초대 수락').props.onPress();
  await tick();
  return ui.render();
}
test('차단 멤버가 있는 초대는 취소 시 수락하지 않고 명시적으로 확인한 뒤에만 확인값을 전송한다', async () => {
  const calls = [];
  const invite = { inviteId: 'i', status: 'PENDING', diary: { diaryId: 'd', title: '초대' }, requiresBlockedMemberConfirmation: true };
  const ui = setup({ invitationGateway: { get: async () => invite }, accept: async (id, name, options) => {
    calls.push(options); return { id: 'd', members: [{ id: 'self', nickname: name, role: 'EDITOR' }] };
  } });
  await nickname(ui);
  const dialog = () => nodes(ui.render()).find(n => n.props?.confirmLabel === '계속 참여하기');
  assert.equal(dialog().props.open, true); assert.equal(calls.length, 0);
  dialog().props.onCancel(); assert.equal(calls.length, 0);
  find(ui.render(), '참여 프로필 설정').props.onPress(); await tick();
  dialog().props.onConfirm();
  find(ui.render(), '수락하고 참여하기').props.onPress(); await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].acknowledgeBlockedMembers, true);
  ui.unmount();
});
test('수락 시점에 차단 확인이 새로 필요하면 409를 자동 우회하지 않고 다시 확인한다', async () => {
  const calls = [];
  const ui = setup({ accept: async (id, name, options) => {
    calls.push(options);
    if (calls.length === 1) throw Object.assign(new Error('차단 확인 필요'), { code: 'BLOCKED_MEMBER_CONFIRMATION_REQUIRED', status: 409 });
    return { id: 'd', members: [{ id: 'self', nickname: name, role: 'EDITOR' }] };
  } });
  await nickname(ui);
  find(ui.render(), '수락하고 참여하기').props.onPress(); await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].acknowledgeBlockedMembers, undefined);
  const dialog = nodes(ui.render()).find(n => n.props?.confirmLabel === '계속 참여하기');
  assert.equal(dialog.props.open, true);
  dialog.props.onConfirm(); await tick();
  assert.equal(calls.length, 2); assert.equal(calls[1].acknowledgeBlockedMembers, true);
  ui.unmount();
});
test('참여 닉네임은 별도 확인 없이 형식으로 판단하고 같은 이름도 입력할 수 있다', async () => {
  const ui = setup();
  await nickname(ui);
  assert.equal(find(ui.render(), '다이어리 닉네임 중복 확인'), undefined);
  find(ui.render(), '다이어리 닉네임').props.onChangeText('a');
  assert.equal(find(ui.render(), '수락하고 참여하기').props.disabled, true);
  find(ui.render(), '다이어리 닉네임').props.onChangeText('하루');
  assert.equal(find(ui.render(), '수락하고 참여하기').props.disabled, false);
  find(ui.render(), '닉네임 설정 취소').props.onPress();
  await nickname(ui);
  assert.equal(find(ui.render(), '다이어리 닉네임').props.value, '소연');
  ui.unmount();
});

test('수락 중 연타를 막고 완료 전 취소는 참여시키지 않는다', async () => {
  let calls = 0,
    resolve;
  const ui = setup({
    checkNickname: async () => '소연',
    accept: () => {
      calls++;
      return new Promise((r) => (resolve = r));
    },
  });
  await nickname(ui);
  find(ui.render(), '닉네임 설정 취소').props.onPress();
  assert.equal(calls, 0);
  await nickname(ui);
  await tick();
  const button = find(ui.render(), '수락하고 참여하기');
  assert.equal(button.props.disabled, false);
  button.props.onPress();
  button.props.onPress();
  assert.equal(calls, 1);
  ui.close();
  ui.render();
  resolve({ id: 'd', members: [{ id: 'self', nickname: '소연', role: 'EDITOR' }] });
  await tick();
  assert.equal(ui.render(), null);
  ui.unmount();
});
test('키보드 표시 후 공유 입력칸의 실제 위치를 측정해 스크롤하고 리스너를 정리한다', async () => {
  const ui = setup();
  await nickname(ui);
  const tree = ui.render(),
    scroll = nodes(tree).find((n) => n.type === 'ScrollView'),
    field = find(tree, '다이어리 닉네임'),
    moves = [];
  scroll.props.ref.current = {
    measureInWindow: (fn) => fn(0, 0, 390, 300),
    scrollTo: (value) => moves.push(value),
  };
  field.props.ref.current = { measureInWindow: (fn) => fn(24, 350, 300, 48) };
  field.props.onFocus();
  ui.keyboard.keyboardDidShow({ endCoordinates: { screenY: 300 } });
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(moves, [{ y: 114, animated: true }]);
  ui.unmount();
  assert.deepEqual(ui.keyboard, {});
});
test('공유 화면은 React Native가 지원하는 접근성 역할만 사용한다', () => {
  const source = readFileSync(
    new URL(
      '../node_modules/react-native/ReactCommon/react/renderer/components/view/AccessibilityPrimitives.h',
      import.meta.url,
    ),
    'utf8',
  );
  const body = source.match(/enum class AccessibilityRole[^\{]*\{([\s\S]*?)\};/)[1];
  const supported = new Set(body.split(',').map((value) => value.trim().toLowerCase()));
  for (const file of ['SharingHub.js', 'SharingEntry.js']) {
    const ast = babel.parseSync(
      readFileSync(new URL(`../src/sharing/${file}`, import.meta.url), 'utf8'),
      { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } },
    );
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'JSXAttribute' &&
        node.name?.name === 'accessibilityRole' &&
        node.value?.type === 'StringLiteral'
      )
        assert.ok(
          supported.has(node.value.value.toLowerCase()),
          `지원하지 않는 역할: ${node.value.value}`,
        );
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    };
    visit(ast);
  }
});

test('상단 얼굴은 나를 뺀 참여자만 보여 주고 목록 창을 열지 않는다', () => {
  const entryCode = babel.transformSync(
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
  let anchor = null,
    refIndex = 0;
  const refs = [{ current: null }, { current: true }, { current: 0 }];
  const react = {
    useRef: () => refs[refIndex++],
    useState: () => [
      anchor,
      (value) => {
        anchor = value;
      },
    ],
    useEffect() {},
  };
  const native = {
    useWindowDimensions: () => ({ width: 390, height: 844 }),
    Image: 'Image',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    View: 'View',
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', entryCode)(
    (id) =>
      id === 'react'
        ? react
        : id === 'react-native-safe-area-context'
          ? { useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) }
          : id === 'react-native'
            ? native
            : id === 'react/jsx-runtime'
              ? require(id)
              : id === './styles'
                ? { sharingStyles: {} }
                : { __esModule: true, default: id },
    mod,
    mod.exports,
  );
  const members = [
    { id: 'self', nickname: '소연', presence: '편집 중' },
    { id: 'friend', nickname: '하루', presence: '자리 비움' },
    { id: 'third', nickname: '모아', presence: '편집 중' },
  ];
  const render = () => {
    refIndex = 0;
    return mod.exports.default({ members, onPress() {} });
  };
  const tree = render();
  // 나(self)는 빼고 다른 두 사람 얼굴만, 누르는 목록 창은 없다(지라 680: 자세히 보기는 공유 창)
  const faces = nodes(tree).filter((n) => ['하루', '모아', '소연'].includes(n.props.accessibilityLabel));
  assert.deepEqual(faces.map((n) => n.props.accessibilityLabel), ['하루', '모아']);
  assert.ok(!nodes(tree).some((n) => n.props.onRequestClose));
  assert.ok(!nodes(tree).some((n) => n.props.accessibilityLabel === '참여자 3명 보기'));
});

test('초대 사진 선택 취소는 유지하고 기본 프로필 복구·최종 수락 사진을 분리한다', async () => {
  let selected = 'file:///diary.png',
    accepted;
  const ui = setup(
    {
      checkNickname: async () => '소연',
      accept: async (id, nickname, options) => {
        accepted = options;
        return {
          id: 'd',
          members: [{ id: 'self', nickname, photoUri: options.photoUri, role: 'EDITOR' }],
        };
      },
    },
    async () => selected,
  );
  await nickname(ui);
  const draft = () =>
    nodes(find(ui.render(), '다이어리 프로필 사진 선택')).find((n) => n.props.member)?.props.member;
  assert.equal(draft().photoUri, null);
  find(ui.render(), '다이어리 프로필 사진 선택').props.onPress();
  find(ui.render(), '다이어리 사진 선택').props.onPress();
  await tick();
  assert.equal(draft().photoUri, 'file:///diary.png');
  selected = null;
  find(ui.render(), '다이어리 프로필 사진 선택').props.onPress();
  find(ui.render(), '다이어리 사진 선택').props.onPress();
  await tick();
  assert.equal(draft().photoUri, 'file:///diary.png');
  find(ui.render(), '다이어리 프로필 사진 선택').props.onPress();
  find(ui.render(), '기본 프로필로 변경').props.onPress();
  await tick();
  assert.equal(draft().photoUri, null);
  selected = 'file:///final.png';
  find(ui.render(), '다이어리 프로필 사진 선택').props.onPress();
  find(ui.render(), '다이어리 사진 선택').props.onPress();
  await tick();
  await tick();
  find(ui.render(), '수락하고 참여하기').props.onPress();
  await tick();
  assert.deepEqual(accepted, { photoUri: 'file:///final.png' });
  ui.unmount();
});

test('사진이 없는 참여자는 사람 실루엣 대신 서버 참여자 색의 모아 얼굴 기본 프로필을 표시한다', () => {
  const avatarCode = babel.transformSync(
    readFileSync(new URL('../src/sharing/MemberAvatar.js', import.meta.url), 'utf8'),
    {
      configFile: false,
      babelrc: false,
      plugins: [
        [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
        expo.resolve('@babel/plugin-transform-modules-commonjs'),
      ],
    },
  ).code;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', avatarCode)(
    (id) =>
      id === 'react-native'
        ? { Image: 'Image' }
        : id === 'react/jsx-runtime'
          ? require(id)
          : id === '../shared/theme'
            ? { DISABLED_OPACITY: 0.4 }
            : { __esModule: true, default: 'DefaultAvatar' },
    mod,
    mod.exports,
  );
  const member = { id: '7', nickname: '소연', color: '#CFA18C' };
  const fallback = mod.exports.default({ member });
  assert.equal(fallback.type, 'DefaultAvatar');
  assert.equal(fallback.props.user, member);
  const photo = mod.exports.default({ member: { nickname: '소연', photoUri: 'file:///one.png' } });
  assert.equal(photo.type, 'Image');
  assert.equal(photo.props.source.uri, 'file:///one.png');
});

test('공유 창의 프로필 수정은 취소 시 버리고 형식 검증으로 사진·닉네임을 함께 저장한다', async () => {
  const original = {
    id: 'd',
    title: '초대',
    members: [{ id: 'self', nickname: '소연', photoUri: null, role: 'EDITOR' }],
  };
  let saved = [];
  const ui = setup(
    {
      checkNickname: async () => '소연',
      accept: async () => structuredClone(original),
      checkProfileNickname: async (id, value) => value,
      updateProfile: async (id, profile) => {
        saved.push(profile);
        return { ...original, members: [{ ...original.members[0], ...profile }] };
      },
    },
    async () => 'file:///new.png',
  );
  await nickname(ui);
  await tick();
  find(ui.render(), '수락하고 참여하기').props.onPress();
  await tick();
  find(ui.render(), '이 다이어리 프로필 수정').props.onPress();
  assert.ok(find(ui.render(), '변경 사항 저장').props.disabled);
  find(ui.render(), '다이어리 닉네임').props.onChangeText('버릴이름');
  find(ui.render(), '다이어리 프로필 사진 선택').props.onPress();
  find(ui.render(), '다이어리 사진 선택').props.onPress();
  await tick();
  find(ui.render(), '프로필 수정 취소').props.onPress();
  assert.equal(saved.length, 0);
  find(ui.render(), '이 다이어리 프로필 수정').props.onPress();
  assert.equal(find(ui.render(), '다이어리 닉네임').props.value, '소연');
  assert.equal(
    nodes(find(ui.render(), '다이어리 프로필 사진 선택')).find((n) => n.props.member).props.member
      .photoUri,
    null,
  );
  find(ui.render(), '다이어리 닉네임').props.onChangeText('새이름');
  assert.equal(find(ui.render(), '변경 사항 저장').props.disabled, false);
  await tick();
  find(ui.render(), '다이어리 프로필 사진 선택').props.onPress();
  find(ui.render(), '다이어리 사진 선택').props.onPress();
  await tick();
  find(ui.render(), '변경 사항 저장').props.onPress();
  await tick();
  assert.deepEqual(saved, [{ nickname: '새이름', photoUri: 'file:///new.png' }]);
  assert.ok(find(ui.render(), '이 다이어리 프로필 수정'));
  ui.unmount();
});

test('공유 창에서 다른 초대 수락·탈퇴 후 뒤로가면 빈 창 대신 원래 다이어리를 복원한다', async () => {
  const original = {
    id: 'a',
    title: '원래 다이어리',
    members: [{ id: 'self', nickname: '소연', role: 'OWNER' }],
  };
  const other = {
    id: 'b',
    title: '다른 다이어리',
    members: [{ id: 'self', nickname: '소연', role: 'EDITOR' }],
  };
  const ui = setup(
    {
      registerDiary: () => structuredClone(original),
      getSharing: async () => structuredClone(original),
      checkNickname: async () => '소연',
      accept: async () => structuredClone(other),
      leave: async () => {},
    },
    undefined,
    { diary: { id: 'a', title: '원래 다이어리' } },
  );
  find(ui.render(), '알림, 새 초대 없음').props.onPress();
  await nickname(ui);
  await tick();
  find(ui.render(), '수락하고 참여하기').props.onPress();
  await tick();
  find(ui.render(), '다이어리 참여 해제').props.onPress();
  nodes(ui.render())
    .find((n) => n.props.confirmLabel === '참여 해제')
    .props.onConfirm();
  await tick();
  // 공유 창에서 들어온 알림 화면은 ‹(이전 공유 화면)로 원래 다이어리 공유 화면에 돌아온다(지라 686)
  find(ui.render(), '이전 공유 화면').props.onPress();
  await tick();
  // 원래 다이어리(내가 소유자)의 공유 화면으로 돌아왔다: 참여 해제 버튼이 없고 소유자 줄이 보인다(제목 칸은 지라 686 에서 뺐다)
  const back = ui.render();
  assert.ok(find(back, '공유 창 닫기'));
  assert.equal(find(back, '다이어리 참여 해제'), undefined);
  assert.ok(nodes(back).some((n) => [n.props?.children].flat().join('') === '소유자'));
  ui.unmount();
});

test('닉네임 입력에서 취소하면 예약된 키보드 스크롤이 다음 화면에 적용되지 않는다', async () => {
  const ui = setup();
  await nickname(ui);
  const tree = ui.render(),
    scroll = nodes(tree).find((n) => n.type === 'ScrollView'),
    field = find(tree, '다이어리 닉네임'),
    moves = [];
  scroll.props.ref.current = {
    measureInWindow: (fn) => fn(0, 0, 390, 300),
    scrollTo: (value) => moves.push(value),
  };
  field.props.ref.current = { measureInWindow: (fn) => fn(24, 350, 300, 48) };
  field.props.onFocus();
  find(ui.render(), '닉네임 설정 취소').props.onPress();
  ui.render();
  await new Promise((r) => setTimeout(r, 110));
  assert.deepEqual(
    moves.filter((value) => value.animated),
    [],
  );
  ui.unmount();
});

test('실서버 편집자에게는 이메일 초대 · 초대 링크가 없다(소유자만, 지라 686)',async()=>{
  let sent=0,more=0,refresh=0;
  const diary={id:'server',members:[{id:'self',role:'EDITOR'}],emailInvites:[],emailNextPage:1};
  const ui=setup({server:true,registerDiary:()=>diary,getSharing:async()=>{refresh++;return diary},
    sendEmailInvite:async()=>{sent++;return diary},loadMoreEmailInvites:async()=>{more++;return {...diary,emailNextPage:null}}},undefined,{diary});
  await tick();
  assert.equal(find(ui.render(),'초대할 이메일'),undefined);
  assert.equal(find(ui.render(),'초대 링크 복사'),undefined);
  assert.equal(sent,0);ui.unmount();
});

test('정원이 찬 서버 다이어리는 초대 API가 있어도 이메일 입력과 전송을 비활성화한다',async()=>{
  for(const role of ['OWNER','EDITOR']){
    let sent=0;
    const diary={id:'server-full',members:[{id:'self',role},...Array.from({length:validation.MAX_SHARING_MEMBERS-1},(_,i)=>({id:`friend-${i}`,role:'EDITOR'}))]};
    const ui=setup({server:true,registerDiary:()=>diary,getSharing:async()=>diary,sendEmailInvite:async()=>{sent++;return diary}},undefined,{diary});
    await tick();
    if(role==='EDITOR'){assert.equal(find(ui.render(),'초대할 이메일'),undefined);ui.unmount();continue;}
    find(ui.render(),'초대할 이메일').props.onChangeText('friend@example.com');
    assert.equal(find(ui.render(),'초대할 이메일').props.editable,false);
    assert.equal(find(ui.render(),'이메일 초대 보내기').props.disabled,true);
    assert.equal(sent,0);ui.unmount();
  }
});


test('서버 이메일 초대 화면은 기존 입력란을 활성화하고 입력한 주소로 연결 함수를 호출한다', async () => {
  const diary = { id: 'server-diary', members: [{ id: 'self', role: 'OWNER' }] };
  const calls = [];
  const ui = setup({ server: true, registerDiary: () => diary,
    getSharing: async () => diary,
    sendEmailInvite: async (id, email) => { calls.push({ id, email }); return diary; },
  }, undefined, { diary });
  await tick();
  assert.equal(find(ui.render(), '초대할 이메일').props.editable, true);
  find(ui.render(), '초대할 이메일').props.onChangeText('friend@example.com');
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, false);
  find(ui.render(), '이메일 초대 보내기').props.onPress();
  await tick();
  assert.deepEqual(calls, [{ id: 'server-diary', email: 'friend@example.com' }]);
  assert.equal(find(ui.render(), '초대할 이메일').props.value, '');
  ui.unmount();
});

test('홈 알림에서 연 초대의 이전 버튼은 공유 내부 목록 대신 홈 알림으로 복귀한다', async () => {
  let returned = 0;
  const ui = setup({ invitationGateway: { get: async () => ({ inviteId: 'i', status: 'PENDING', canOpen: true, diary: { diaryId: 'd', title: '초대' } }) } }, undefined,
    { mode: 'invitation', inviteId: 'i', returnToNotifications: true }, { onReturnToNotifications: () => returned++ });
  await tick();
  find(ui.render(), '이전 공유 화면').props.onPress();
  assert.equal(returned, 1);
  ui.unmount();
});

test('홈 초대 상세 진입은 조회 대기 중에도 공유 알림 목록을 표시하지 않는다', async () => {
  let finish;
  const ui = setup({ invitationGateway: { get: () => new Promise(resolve => { finish = resolve; }) } }, undefined,
    { mode: 'invitation', inviteId: 'i', returnToNotifications: true });
  const waiting = ui.render();
  assert.equal(find(waiting, '초대 초대 수락'), undefined);
  assert.equal(find(waiting, '초대 초대 상세'), undefined);
  assert.ok(find(waiting, '이전 공유 화면'));
  finish({ inviteId: 'i', status: 'PENDING', canOpen: true, diary: { diaryId: 'd', title: '초대' } });
  await tick();
  assert.ok(find(ui.render(), '참여 프로필 설정'));
  ui.unmount();
});

test('편집기 직접 초대 ID 진입도 로딩 중 목록을 노출하지 않고 성공 시 상세를 연다', async () => {
  let finish;
  const ui = setup({ invitationGateway: { get: () => new Promise(resolve => { finish = resolve; }) } }, undefined, { mode: 'invitation', inviteId: 'i' });
  const waiting = ui.render();
  assert.equal(find(waiting, '초대 초대 상세'), undefined);
  assert.ok(find(waiting, '초대 불러오는 중'));
  finish({ inviteId: 'i', status: 'PENDING', canOpen: true, diary: { diaryId: 'd', title: '초대' } });
  await tick();
  assert.ok(find(ui.render(), '참여 프로필 설정'));
  find(ui.render(), '이전 공유 화면').props.onPress();
  assert.ok(find(ui.render(), '초대 초대 상세'));
  ui.unmount();
});

test('편집기 직접 초대 조회 실패는 상세 안의 오류로 남고 이전으로 목록에 돌아간다', async () => {
  const ui = setup({ invitationGateway: { get: async () => { throw new Error('초대 조회 실패'); } } }, undefined, { mode: 'invitation', inviteId: 'i' });
  await tick();
  const tree = ui.render();
  assert.ok(nodes(tree).some(node => node.props?.accessibilityRole === 'alert' && node.props.children === '초대 조회 실패'));
  assert.equal(find(tree, '참여 프로필 설정'), undefined);
  assert.equal(find(tree, '초대 초대 상세'), undefined);
  find(tree, '이전 공유 화면').props.onPress();
  assert.ok(find(ui.render(), '초대 초대 상세'));
  ui.unmount();
});

test('임베드 공유의 뒤로가기 핸들러는 최신 상태로 교체되고 언마운트 시 해제된다', () => {
  const registered = [];
  const ui = setup({}, undefined, { mode: 'invitations' }, { embedded: true, onBackReady: handler => registered.push(handler) });
  assert.equal(typeof registered.at(-1), 'function');
  const first = registered.at(-1);
  ui.render();
  assert.ok(registered.includes(null));
  assert.equal(typeof registered.at(-1), 'function');
  assert.notEqual(registered.at(-1), first);
  ui.unmount();
  assert.equal(registered.at(-1), null);
});

test('공유 알림의 발신자 누락은 숨기고 실제 닉네임 다른 사용자는 그대로 표시한다', () => {
  const ui = setup();
  for (const actor of [null, undefined, '', '   ', '다른 사용자', '하루']) {
    ui.model.items[0].actor = actor;
    const labels = nodes(ui.render()).filter(node => node.props?.style === 'invitationActor');
    if (typeof actor === 'string' && actor.trim()) assert.deepEqual(labels.map(node => node.props.children), [`${actor.trim()}님의 초대`]);
    else assert.equal(labels.length, 0);
  }
  ui.unmount();
});

test('홈 초대의 프로필 이전은 상세로 돌아가고 상세 이전만 홈 알림으로 복귀한다', async () => {
  let returned = 0;
  const invitation = { inviteId: 'i', status: 'PENDING', canOpen: true, diary: { diaryId: 'd', title: '초대' } };
  const ui = setup({ invitationGateway: { get: async () => invitation } }, undefined,
    { mode: 'invitation', inviteId: 'i', returnToNotifications: true }, { onReturnToNotifications: () => returned++ });
  await tick();
  find(ui.render(), '참여 프로필 설정').props.onPress();
  await tick();
  find(ui.render(), '다이어리 닉네임').props.onChangeText('작성중인 이름');
  find(ui.render(), '이전 공유 화면').props.onPress();
  assert.ok(find(ui.render(), '참여 프로필 설정'));
  assert.equal(returned, 0);
  find(ui.render(), '이전 공유 화면').props.onPress();
  assert.equal(returned, 1);
  ui.unmount();
});

test('홈에서 연 초대를 거절하면 공유 내부 목록 대신 홈 알림 복귀를 요청한다', async () => {
  let returned = 0, declined = 0;
  const invitation = { inviteId: 'i', status: 'PENDING', canOpen: true, diary: { diaryId: 'd', title: '초대' } };
  const ui = setup({ supportsReadState: false, invitationGateway: { get: async () => invitation }, decline: async () => { declined++; } }, undefined,
    { mode: 'invitation', inviteId: 'i', returnToNotifications: true }, { onReturnToNotifications: () => returned++ });
  await tick();
  find(ui.render(), '상세 초대 삭제').props.onPress();
  nodes(ui.render()).find(node => node.props?.confirmLabel === '삭제' && node.props.onConfirm).props.onConfirm();
  await tick();
  assert.equal(declined, 1); assert.equal(returned, 1);
  ui.unmount();
});

test('AI 리뷰: 복사가 링크를 새로 만든 뒤 클립보드에 실패해도 새 링크는 칸에 남고, 다시 만들기 확인은 createLink 를 부른다', async () => {
  const diary = { id: 'local', members: [{ id: 'self', role: 'OWNER' }] };
  let made = 0;
  const fresh = n => ({ ...diary, link: `https://dio.example/invite/${n}`, linkExpiresAt: '2099-01-01T11:41:00' });
  // 첫 번째(콜드 스타트)는 실패 → '복사'가 새로 만든다(테스트 환경의 클립보드는 없어 복사는 실패한다)
  const ui = setup({ registerDiary: () => diary, createLink: async () => { made++; if (made === 1) throw new Error('잠시 후'); return fresh(made); } }, undefined, { diary });
  ui.render(); ui.render(); await tick(); ui.render(); await tick();
  assert.equal(made, 1);
  find(ui.render(), '초대 링크 복사').props.onPress(); await tick(); await tick();
  assert.equal(made, 2);
  assert.ok(nodes(ui.render()).some(n => n.props?.children === 'https://dio.example/invite/2'), '복사 실패해도 새 링크가 보인다');
  // 다시 만들기 → 확인창 → createLink
  find(ui.render(), '초대 링크 다시 만들기').props.onPress();
  nodes(ui.render()).find(n => n.props?.confirmLabel === '다시 만들기').props.onConfirm(); await tick(); await tick();
  assert.equal(made, 3);
  assert.ok(nodes(ui.render()).some(n => n.props?.children === 'https://dio.example/invite/3'));
  ui.unmount();
});

test('AI 리뷰: 콜드 스타트로 만드는 중에 복사를 누르면 그 결과를 기다려 쓰고 링크를 두 번 만들지 않는다', async () => {
  const diary = { id: 'local', members: [{ id: 'self', role: 'OWNER' }] };
  let made = 0, release;
  const ui = setup({ registerDiary: () => diary, createLink: () => { made++; return new Promise(r => { release = () => r({ ...diary, link: 'https://dio.example/invite/cold', linkExpiresAt: '2099-01-01T11:41:00' }); }); } }, undefined, { diary });
  ui.render(); ui.render(); await tick();
  assert.equal(made, 1);
  find(ui.render(), '초대 링크 복사').props.onPress(); await tick();
  release(); await tick(); await tick();
  assert.equal(made, 1, '복사가 링크를 또 만들지 않는다');
  assert.ok(nodes(ui.render()).some(n => n.props?.children === 'https://dio.example/invite/cold'));
  ui.unmount();
});

test('외부 공유 링크는 기존 참여 화면을 열고 확인을 누른 뒤에만 수락한다', async () => {
  const link = 'https://k15f106.p.ssafy.io/invite/7.' + 'a'.repeat(43);
  const token = link.split('/').at(-1);
  const lookedUp = [], accepted = [];
  const ui = setup({
    resolveLink: async url => {
      lookedUp.push(url);
      return { inviteId: token, token, status: 'PENDING', diary: { diaryId: 'd', title: '초대' } };
    },
    accept: async (id, name) => {
      accepted.push(id);
      return { id: 'd', members: [{ id: 'self', nickname: name, role: 'EDITOR' }] };
    },
  }, undefined, { mode: 'invitation', link });
  ui.render();
  await tick();
  const screen = ui.render();
  assert.deepEqual(lookedUp, [link]);
  assert.deepEqual(accepted, []);
  find(screen, '수락하고 참여하기').props.onPress();
  await tick();
  assert.deepEqual(accepted, [token]);
  ui.unmount();
});
