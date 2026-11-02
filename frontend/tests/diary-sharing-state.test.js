import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as validation from '../src/sharing/sharingPreview.js';
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
function setup(runtime = {}, photoPicker, initialRequest = { mode: 'invitations' }) {
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
    './sharingPreview': validation,
    './styles': { sharingStyles: new Proxy({}, { get: (_, k) => k }) },
    '../notifications/NotificationPanel': { invitationStatusLabel: (v) => v },
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
      onClose: () => {
        request = null;
      },
    });
  };
  render();
  return {
    render,
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

test('참여자 관리의 취소는 유지하고 양도 실패는 재시도, 성공은 편집자 화면으로 복귀한다', async () => {
  const diary = { id: 'd', title: '관리', members: [
    { id: 'self', nickname: '소연', role: 'OWNER' },
    { id: 'friend', nickname: '모아', role: 'EDITOR' },
  ] };
  let attempts = 0;
  const ui = setup({ registerDiary: () => diary, transferOwner: async () => {
    if (++attempts === 1) throw new Error('다시 시도해 주세요.');
    return { ...diary, members: diary.members.map(m => ({ ...m, role: m.id === 'self' ? 'EDITOR' : 'OWNER' })) };
  } }, undefined, { diary });
  find(ui.render(), '참여자 관리').props.onPress();
  find(ui.render(), '모아 소유권 양도').props.onPress();
  const confirm = () => nodes(ui.render()).find(n => n.props.confirmLabel === '양도');
  confirm().props.onCancel();
  assert.equal(attempts, 0);
  find(ui.render(), '모아 소유권 양도').props.onPress();
  confirm().props.onConfirm();
  await tick();
  assert.ok(find(ui.render(), '모아 소유권 양도'));
  find(ui.render(), '모아 소유권 양도').props.onPress();
  confirm().props.onConfirm();
  await tick();
  assert.equal(attempts, 2);
  assert.equal(find(ui.render(), '참여자 관리'), undefined);
  assert.ok(find(ui.render(), '다이어리 참여 해제'));
});

test('실서버 참여자 관리도 연결된 양도 기능을 제공한다', () => {
  const diary = { id: 'd', title: '관리', members: [
    { id: 'self', nickname: '소연', role: 'OWNER' }, { id: 'friend', nickname: '모아', role: 'EDITOR' },
  ] };
  const ui = setup({ server: true, registerDiary: () => diary, getSharing: async () => diary,
    transferOwner: () => { throw new Error('호출하면 안 됨'); } }, undefined, { diary });
  find(ui.render(), '참여자 관리').props.onPress();
  assert.ok(find(ui.render(), '모아 소유권 양도'));
  assert.ok(find(ui.render(), '모아 참여 해제'));
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
  assert.equal(find(ui.render(), '초대할 이메일'), undefined);
  assert.equal(find(ui.render(), '참여자의 내보내기 허용'), undefined);
  find(ui.render(), '이메일로 초대').props.onPress();
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, true);
  find(ui.render(), '초대할 이메일').props.onChangeText('friend@example.com');
  const send = find(ui.render(), '이메일 초대 보내기');
  send.props.onPress(); send.props.onPress();
  assert.equal(calls, 1);
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, true);
  resolve({ ...diary, emailInvites: [{ id: 'sent', email: 'friend@example.com', status: 'PENDING' }] });
  await tick();
  assert.equal(find(ui.render(), '초대할 이메일').props.value, '');
  assert.ok(find(ui.render(), 'friend@example.com 초대 취소'));
  find(ui.render(), '이전 공유 화면').props.onPress();
  assert.ok(find(ui.render(), '초대 링크 만들기'));
  assert.equal(find(ui.render(), '초대할 이메일'), undefined);
  find(ui.render(), '이메일로 초대').props.onPress();
  assert.ok(find(ui.render(), 'friend@example.com 초대 취소'));
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
  assert.ok(find(ui.render(), '추가 인원 안내'));
  assert.equal(find(ui.render(), '초대 링크 만들기').props.disabled, true);
  find(ui.render(), '이메일로 초대').props.onPress();
  assert.equal(find(ui.render(), '초대할 이메일').props.editable, false);
  ui.unmount();
  const diary = { id: 'server', members: [{ id: 'self', role: 'OWNER' }] };
  const server = setup({ server: true, registerDiary: () => diary, getSharing: async () => diary }, undefined, { diary });
  await tick();
  assert.equal(find(server.render(), '이메일로 초대'), undefined);
  server.unmount();
});

test('보낸 초대 취소는 확인 후에만 적용하고 만료된 링크 복사를 막는다', async () => {
  const diary = { id: 'local', link: 'https://dio.example/invite/old', linkExpiresAt: '2000-01-01T00:00:00Z',
    members: [{ id: 'self', role: 'OWNER' }],
    emailInvites: [{ id: 'sent', email: 'friend@example.com', status: 'PENDING' }] };
  let calls = 0;
  const ui = setup({ registerDiary: () => diary, sendEmailInvite: async () => diary,
    cancelEmailInvite: async () => { calls++; return { ...diary, emailInvites: [{ ...diary.emailInvites[0], status: 'CANCELLED' }] }; },
  }, undefined, { diary });
  ui.render(); // 만료 상태 effect가 적용된 다음 렌더를 확인한다.
  assert.equal(find(ui.render(), '초대 링크 복사').props.disabled, true);
  find(ui.render(), '이메일로 초대').props.onPress();
  find(ui.render(), 'friend@example.com 초대 취소').props.onPress();
  const dialog = nodes(ui.render()).find(n => n.props?.confirmLabel === '초대 취소');
  dialog.props.onCancel();
  assert.equal(calls, 0);
  find(ui.render(), 'friend@example.com 초대 취소').props.onPress();
  nodes(ui.render()).find(n => n.props?.confirmLabel === '초대 취소').props.onConfirm();
  await tick();
  assert.equal(calls, 1);
  assert.equal(find(ui.render(), 'friend@example.com 초대 취소'), undefined);
  ui.unmount();
});
test('실제 공유는 편집자도 링크를 만들고 지원하지 않는 내보내기 설정을 숨긴다', async () => {
  const diary = { id: 'server-diary', title: '서버 기록', members: [{ id: 'self', nickname: '소연', role: 'EDITOR' }] };
  const ui = setup({ server: true, supportsExportSettings: false, canOpenDiary: false,
    registerDiary: () => diary, getSharing: async () => diary }, undefined, { diary });
  await tick();
  const tree = ui.render();
  assert.ok(find(tree, '초대 링크 만들기'));
  assert.equal(find(tree, '참여자의 내보내기 허용'), undefined);
  assert.equal(find(tree, '다이어리 열기'), undefined);
  assert.ok(find(tree, '완료'));
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

test('프로필 원은 참여자 목록을 열고 창 밖 터치·시스템 뒤로가기로 닫힌다', () => {
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
  let tree = render();
  const circles = find(tree, '참여자 3명 보기');
  nodes(tree).find((n) => n.props.ref).props.ref.current = {
    measureInWindow: (fn) => fn(330, 40, 52, 44),
  };
  circles.props.onPress();
  tree = render();
  assert.ok(nodes(tree).some((n) => [n.props.children].flat().join('') === '공유 중인 사람 · 3명'));
  assert.ok(nodes(tree).some((n) => [n.props.children].flat().join('') === '나 · 편집 중'));
  const card = nodes(tree).find((n) => n.type === 'Pressable' && Array.isArray(n.props.style));
  assert.ok(card.props.style[1].left + card.props.style[1].width <= 382);
  let stopped = false;
  card.props.onPress({
    stopPropagation() {
      stopped = true;
    },
  });
  assert.ok(stopped);
  assert.ok(anchor);
  nodes(tree)
    .find((n) => n.props.testID === 'sharing-people-outside')
    .props.onPress();
  assert.equal(anchor, null);
  circles.props.onPress();
  tree = render();
  nodes(tree)
    .find((n) => n.props.onRequestClose)
    .props.onRequestClose();
  assert.equal(anchor, null);
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

test('사진이 없는 참여자는 이름 첫 글자 대신 기본 사람 아이콘을 표시한다', () => {
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
            ? { colors: {} }
            : { __esModule: true, default: 'Icon' },
    mod,
    mod.exports,
  );
  const fallback = mod.exports.default({ member: { nickname: '소연' } });
  assert.equal(fallback.props.name, 'person');
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
  // 알림 화면에는 뒤로 가기 버튼이 없다. 기기 뒤로 가기(창의 onRequestClose)로 원래 다이어리 공유 화면에 돌아온다.
  assert.equal(find(ui.render(), '이전 공유 화면'), undefined);
  nodes(ui.render()).find((n) => n.props.onRequestClose).props.onRequestClose();
  await tick();
  const summary = nodes(ui.render()).find((n) => n.type?.name === 'DiarySummary');
  assert.equal(summary?.props.diary.id, 'a');
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

test('실서버 편집자도 이메일을 보내고 보낸 목록을 새로고침하거나 더 볼 수 있다',async()=>{
  let sent=0,more=0,refresh=0;
  const diary={id:'server',members:[{id:'self',role:'EDITOR'}],emailInvites:[],emailNextPage:1};
  const ui=setup({server:true,registerDiary:()=>diary,getSharing:async()=>{refresh++;return diary},
    sendEmailInvite:async()=>{sent++;return diary},loadMoreEmailInvites:async()=>{more++;return {...diary,emailNextPage:null}}},undefined,{diary});
  await tick();find(ui.render(),'이메일로 초대').props.onPress();
  find(ui.render(),'초대할 이메일').props.onChangeText('friend@example.com');
  assert.equal(find(ui.render(),'이메일 초대 보내기').props.disabled,false);
  find(ui.render(),'이메일 초대 보내기').props.onPress();await tick();
  assert.equal(sent,1);assert.equal(find(ui.render(),'초대할 이메일').props.value,'');
  find(ui.render(),'보낸 초대 새로고침').props.onPress();await tick();assert.ok(refresh>=2);
  find(ui.render(),'보낸 초대 더 보기').props.onPress();await tick();assert.equal(more,1);
  assert.equal(find(ui.render(),'보낸 초대 더 보기'),undefined);ui.unmount();
});

test('정원이 찬 서버 다이어리는 초대 API가 있어도 이메일 입력과 전송을 비활성화한다',async()=>{
  for(const role of ['OWNER','EDITOR']){
    let sent=0;
    const diary={id:'server-full',members:[{id:'self',role},...Array.from({length:validation.MAX_SHARING_MEMBERS-1},(_,i)=>({id:`friend-${i}`,role:'EDITOR'}))]};
    const ui=setup({server:true,registerDiary:()=>diary,getSharing:async()=>diary,sendEmailInvite:async()=>{sent++;return diary}},undefined,{diary});
    await tick();find(ui.render(),'이메일로 초대').props.onPress();
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
  find(ui.render(), '이메일로 초대').props.onPress();
  assert.equal(find(ui.render(), '초대할 이메일').props.editable, true);
  find(ui.render(), '초대할 이메일').props.onChangeText('friend@example.com');
  assert.equal(find(ui.render(), '이메일 초대 보내기').props.disabled, false);
  find(ui.render(), '이메일 초대 보내기').props.onPress();
  await tick();
  assert.deepEqual(calls, [{ id: 'server-diary', email: 'friend@example.com' }]);
  assert.equal(find(ui.render(), '초대할 이메일').props.value, '');
  ui.unmount();
});
