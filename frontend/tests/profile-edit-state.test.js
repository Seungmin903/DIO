import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as validation from '../src/auth/validation.js';
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
function setup(service = {}, photoPicker = async () => null, options = {}) {
  const { getProfilePhotoSource, ...screenOptions } = options;
  const states = [],
    refs = [],
    deps = [],
    cleanups = [],
    keyboard = {},
    updates = [];
  let si = 0,
    ri = 0,
    ei = 0,
    leave,
    parentBack,
    closed = 0,
    ended = 0;
  const react = {
    useState(initial) {
      const i = si++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === 'function' ? value(states[i]) : value;
        },
      ];
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
        return {
          remove() {
            keyboard[name].delete(fn);
          },
        };
      },
    },
    BackHandler: {
      addEventListener() {
        assert.fail('프로필 화면은 상위 앱에 뒤로가기를 위임해야 한다');
      },
    },
  };
  for (const name of [
    'ActivityIndicator',
    'Image',
    'KeyboardAvoidingView',
    'Pressable',
    'ScrollView',
    'Text',
    'TextInput',
    'View',
  ])
    native[name] = name;
  const mocks = {
    react,
    'react-native': native,
    './validation': validation,
    './profileStyles': { profileStyles: new Proxy({}, { get: (_, key) => key }) },
    '../shared/theme': { colors: {} },
  };
  const load = (id) =>
    mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id });
  const hook = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/auth/useProfileKeyboard.js'))(
    load,
    hook,
    hook.exports,
  );
  mocks['./useProfileKeyboard'] = hook.exports;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/auth/ProfileEditScreen.js'))(
    load,
    mod,
    mod.exports,
  );
  const registerLeaveGuard = (guard, onBack) => {
    leave = guard;
    parentBack = onBack;
    return () => {
      leave = null;
      parentBack = null;
    };
  };
  const user = {
    accountId: 'one',
    provider: 'email',
    nickname: '소연',
    email: 'a@b.com',
    photoUri: 'file:///old.jpg',
  };
  const render = () => {
    si = ri = ei = 0;
    return mod.exports.default({
      user,
      service,
      photoPicker,
      getProfilePhotoSource,
      onClose() {
        closed++;
      },
      onUpdate(value) {
        updates.push(value);
      },
      onEndSession() {
        ended++;
      },
      registerLeaveGuard,
      ...screenOptions,
    });
  };
  return {
    render,
    keyboard,
    updates,
    user,
    back: () => parentBack(),
    parentBack: () => parentBack(),
    leave: (action) => leave(action),
    closed: () => closed,
    ended: () => ended,
    unmount: () => cleanups.forEach((fn) => fn?.()),
  };
}
const nodes = (n) =>
  !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
const find = (ui, label) =>
  nodes(ui.render()).find(
    (n) =>
      n.props.accessibilityLabel === label ||
      (n.type?.name !== 'FormRow' && n.props.label === label),
  );
const press = (ui, label) => {
  const node = find(ui, label);
  assert.ok(node, `missing ${label}`);
  node.props.onPress();
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('직접 회원정보 폼 진입, 취소·뒤로가기 시 변경 확인과 계속 수정하기를 제공한다', () => {
  const ui = setup();
  assert.ok(find(ui, '닉네임'));
  find(ui, '닉네임').props.onChangeText('수정이름');
  press(ui, '취소');
  assert.equal(ui.closed(), 0);
  assert.ok(find(ui, '계속 수정하기'));
  press(ui, '계속 수정하기');
  assert.equal(find(ui, '닉네임').props.value, '수정이름');
  ui.back();
  assert.ok(find(ui, '저장하지 않고 나가기'));
  ui.back();
  assert.equal(find(ui, '닉네임').props.value, '수정이름');
  ui.back();
  press(ui, '저장하지 않고 나가기');
  assert.equal(ui.closed(), 1);
  ui.unmount();
});
test('사이드 메뉴 이탈도 미저장 확인을 거치며 취소하면 기존 수정값을 유지한다', () => {
  const ui = setup();
  find(ui, '닉네임').props.onChangeText('변경이름');
  ui.render();
  let navigated = 0;
  ui.leave(() => navigated++);
  assert.equal(navigated, 0);
  press(ui, '계속 수정하기');
  assert.equal(find(ui, '닉네임').props.value, '변경이름');
  ui.leave(() => navigated++);
  press(ui, '저장하지 않고 나가기');
  assert.equal(navigated, 1);
  assert.equal(find(ui, '닉네임').props.value, '소연');
  ui.unmount();
});
test('사진 선택 취소 보존·사진만 변경 저장·새 기준값 이후 이탈은 추가 경고가 없다', async () => {
  const ui = setup({ updateProfile: async (user, draft) => ({ ...user, ...draft }) });
  assert.equal(find(ui, '닉네임 중복 확인'), undefined);
  find(ui, '닉네임').props.onChangeText('다른이름');
  assert.equal(find(ui, '변경사항 저장').props.disabled, false);
  find(ui, '닉네임').props.onChangeText('소연');
  assert.equal(find(ui, '닉네임 중복 확인'), undefined);
  press(ui, '프로필 사진 변경');
  await tick();
  assert.equal(find(ui, '변경사항 저장').props.disabled, true);
  press(ui, '프로필 사진 삭제');
  assert.equal(find(ui, '변경사항 저장').props.disabled, false);
  press(ui, '변경사항 저장');
  await tick();
  assert.equal(ui.updates[0].photoUri, null);
  assert.equal(find(ui, '변경사항 저장').props.disabled, true);
  press(ui, '취소');
  assert.equal(ui.closed(), 1);
  ui.unmount();
});
test('중복 확인 없이 저장하고 실패 시 입력을 유지한다', async () => {
 const ui=setup({updateProfile:async()=>{throw new Error('저장 실패')}});
 find(ui,'닉네임').props.onChangeText('다른이름');assert.equal(find(ui,'변경사항 저장').props.disabled,false);
 press(ui,'변경사항 저장');await tick();assert.equal(find(ui,'닉네임').props.value,'다른이름');assert.equal(ui.updates.length,0);
 assert.ok(nodes(ui.render()).some(n=>n.props.children==='저장 실패'));ui.unmount();
});

test('탈퇴합니다 정확히 입력해야 탈퇴 가능하고 취소는 수정값을 보존하며 연타는 한 번만 실행한다', async () => {
  let resolve,
    calls = 0;
  const ui = setup({
    withdraw: () => {
      calls++;
      return new Promise((r) => {
        resolve = r;
      });
    },
  });
  find(ui, '닉네임').props.onChangeText('임시이름');
  press(ui, '회원 탈퇴');
  assert.equal(find(ui, '탈퇴하기').props.disabled, true);
  for (const text of ['탈퇴', '탈퇴합니다 ', ' 탈퇴합니다']) {
    find(ui, '탈퇴 확인 문구').props.onChangeText(text);
    assert.equal(find(ui, '탈퇴하기').props.disabled, true);
  }
  press(ui, '확인 창 닫기');
  assert.equal(find(ui, '닉네임').props.value, '임시이름');
  press(ui, '회원 탈퇴');
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
test('비밀번호 닫기 시 확인창을 거치고 계속 수정 또는 버리기를 선택한다', () => {
  const ui = setup();
  press(ui, '비밀번호 변경');
  find(ui, '새 비밀번호').props.onChangeText('Changed123');
  press(ui, '확인 창 닫기');
  press(ui, '계속 수정하기');
  assert.equal(find(ui, '새 비밀번호').props.value, 'Changed123');
  press(ui, '확인 창 닫기');
  press(ui, '저장하지 않고 나가기');
  press(ui, '비밀번호 변경');
  assert.equal(find(ui, '새 비밀번호').props.value, '');
  ui.unmount();
});
test('키보드 후 입력 위치 재측정·언마운트 리스너 및 예약 작업 정리', async () => {
  const ui = setup(),
    moves = [],
    tree = ui.render();
  nodes(tree).find((n) => n.type === 'ScrollView').props.ref.current = {
    measureInWindow: (fn) => fn(0, 100, 400, 400),
    scrollTo: (value) => moves.push(value),
  };
  find(ui, '닉네임').props.form.focus({ measureInWindow: (fn) => fn(20, 380, 300, 48) });
  for (const listener of ui.keyboard.keyboardDidShow)
    listener({ endCoordinates: { screenY: 320 } });
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.deepEqual(moves, [{ y: 124, animated: true }]);
  ui.unmount();
  assert.ok(Object.values(ui.keyboard).every((set) => set.size === 0));
});

test('상위 앱의 Android 뒤로가기도 편집 화면에 위임하고 내 공간으로 한 단계 복귀한다', () => {
  const ui = setup(); ui.render(); ui.parentBack(); assert.equal(ui.closed(), 1);
  find(ui, '닉네임').props.onChangeText('수정이름'); ui.render(); ui.parentBack();
  assert.equal(ui.closed(), 1); assert.ok(find(ui, '계속 수정하기'));
  ui.parentBack(); assert.equal(find(ui, '닉네임').props.value, '수정이름');
  ui.parentBack(); press(ui, '저장하지 않고 나가기'); assert.equal(ui.closed(), 2); ui.unmount();
});

test('탈퇴 요청 실패 후 문구·프로필을 유지하고 다시 시도할 수 있다', async () => {
  let calls = 0;
  const ui = setup({ withdraw: async () => { if (++calls === 1) throw new Error('일시 오류'); } });
  find(ui, '닉네임').props.onChangeText('수정이름'); press(ui, '회원 탈퇴');
  find(ui, '탈퇴 확인 문구').props.onChangeText('탈퇴합니다'); press(ui, '탈퇴하기'); await tick();
  assert.equal(ui.ended(), 0); assert.equal(find(ui, '탈퇴 확인 문구').props.value, '탈퇴합니다');
  assert.equal(find(ui, '닉네임').props.value, '수정이름'); assert.equal(find(ui, '탈퇴하기').props.disabled, false);
  press(ui, '탈퇴하기'); await tick(); assert.equal(ui.ended(), 1); ui.unmount();
});

test('사진 선택의 늦은 응답과 실패는 언마운트·기존 프로필을 손상시키지 않는다', async () => {
  let resolve;
  const ui = setup({}, () => new Promise(r => { resolve = r; }));
  press(ui, '프로필 사진 변경'); press(ui, '프로필 사진 선택'); ui.unmount(); resolve('file:///late.jpg'); await tick(); assert.deepEqual(ui.updates, []);
  const failed = setup({}, async () => { throw new Error('사진 선택 오류'); });
  press(failed, '프로필 사진 변경'); press(failed, '프로필 사진 선택'); await tick();
  assert.ok(nodes(failed.render()).some(n => n.type === 'Image' && n.props.source.uri === 'file:///old.jpg'));
  assert.ok(nodes(failed.render()).some(n => n.props.children === '사진 선택 오류'));
  assert.equal(find(failed, '변경사항 저장').props.disabled, true); failed.unmount();
});

test('저장된 서버 프로필 사진도 회원정보 수정 화면에서 인증 source로 렌더링한다', () => {
  const source = { uri: 'https://server.example/api/v1/auth/profile-photos/abc', headers: { Authorization: 'Basic test' } };
  const ui = setup({}, undefined, { getProfilePhotoSource: () => source });
  const photo = nodes(ui.render()).find((node) => node.type === 'Image' && node.props.accessibilityLabel === '프로필 사진');
  assert.deepEqual(photo.props.source, source);
  ui.unmount();
});

test('실제 계정은 현재 사진을 변경하거나 기본 이미지로 되돌릴 수 있다', () => {
  // 사진 변경은 메뉴(사진 선택 · 기본 이미지로 되돌리기)로 연다
  const ui = setup({}, undefined, { photoEditable: true });
  press(ui, '프로필 사진 변경');
  assert.ok(find(ui, '프로필 사진 선택'));
  assert.ok(find(ui, '프로필 사진 삭제'));
  assert.equal(nodes(ui.render()).some((node) => node.props.children === '프로필 사진 변경은 준비 중이에요.'), false);
  ui.unmount();
});

test('서버 계정은 기존 비밀번호 창만 열고 성공 후 세션을 종료한다',async()=>{
 let calls=0;const ui=setup({changePassword:async()=>{calls++}},undefined,{passwordOnly:true,user:{mode:'authenticated',userId:'7',provider:'email',nickname:'회원'}});
 assert.equal(find(ui,'닉네임'),undefined);assert.equal(find(ui,'회원 탈퇴'),undefined);
 find(ui,'현재 비밀번호').props.onChangeText('Password123!');find(ui,'새 비밀번호').props.onChangeText('Changed123!');find(ui,'새 비밀번호 확인').props.onChangeText('Changed123!');
 press(ui,'변경');await tick();assert.equal(calls,1);assert.equal(ui.ended(),1);ui.unmount();
});
test('일반 회원정보 화면의 직접 비밀번호 변경도 인증 세션을 종료한다',async()=>{
 const ui=setup({changePassword:async()=>{}},undefined,{user:{mode:'authenticated',userId:'7',provider:'email',nickname:'회원'}});
 press(ui,'비밀번호 변경');find(ui,'현재 비밀번호').props.onChangeText('Password123!');find(ui,'새 비밀번호').props.onChangeText('Changed123!');find(ui,'새 비밀번호 확인').props.onChangeText('Changed123!');
 press(ui,'변경');await tick();assert.equal(ui.ended(),1);ui.unmount();
});
test('서버 비밀번호 창 취소는 회원정보 수정 화면으로 넘어가지 않는다',()=>{
 const ui=setup({},undefined,{passwordOnly:true});press(ui,'취소');assert.equal(ui.closed(),1);ui.unmount();
});
