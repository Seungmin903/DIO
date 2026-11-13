import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as query from '../src/diary/utils/libraryQuery.js';
import * as selectionUtils from '../src/diary/utils/diarySelection.js';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
const compile = file => babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), { configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code;

// 얕은 렌더: 훅을 흉내 내고, 자식 컴포넌트는 이름(문자열)으로 남긴다
function setup(file, extra = {}) {
  const state = [], refs = []; let cursor = 0, refCursor = 0;
  const hooks = { memo: fn => fn, useState: initial => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
    useRef: initial => { const i = refCursor++; return refs[i] ??= { current: initial }; }, useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {} };
  class Value { constructor(v) { this.v = v; } interpolate() { return 1; } setValue(v) { this.v = v; } }
  const styles = new Proxy({}, { get: (_, name) => name });
  const mocks = { react: hooks,
    'react-native': { Platform: { OS: 'web' }, Keyboard: { addListener: () => ({ remove() {} }) }, StyleSheet: { create: x => x }, View: 'view', Text: 'text', Pressable: 'press', TextInput: 'input', ScrollView: 'scroll', FlatList: 'list',
      Animated: { timing: () => ({ start() {}, stop() {} }), Value, View: 'view', Text: 'text', createAnimatedComponent: () => 'list', event: () => () => {} }, Easing: { cubic: () => {}, out: x => x } },
    '../../shared/theme': { bubble: {}, colors: {}, DISABLED_OPACITY: 0.4 },
    '../constants': { C: {}, FILTERS: [{ id: 'personal', label: '모든 다이어리' }, { id: 'favorite', label: '즐겨찾기' }],
      LIBRARY_SCOPES: [{ id: 'personal', label: '내 다이어리', tabLabel: '내 다이어리', icon: 'book', empty: '' }, { id: 'shared', label: '공유된 다이어리', tabLabel: '공유된 다이어리', icon: 'people', empty: '' }],
      CAROUSEL_STEP: 250, CAROUSEL_ITEM_WIDTH: 220, CAROUSEL_GAP: 30 },
    '../styles': { styles }, '../components/OpenBookShelf': { __esModule: true, default: 'OpenBookShelf', preloadOpenBooks: () => {} },
    '../utils/useDiaryGrid': { useDiaryGrid: () => null }, '../utils/carouselFollow': { carouselMotion: () => ({ card: {}, info: {} }) },
    '../utils/diarySelection': selectionUtils, '../utils/libraryQuery': query,
    '../components/EmptyState': { __esModule: true, default: 'EmptyState', LoadingSpot: 'LoadingSpot' }, ...extra };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compile(file))(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports);
  return props => { cursor = 0; refCursor = 0; return module.exports.default(props); };
}
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
const find = (tree, label) => nodes(tree).find(n => n.props?.accessibilityLabel === label);
const popover = (tree, label) => nodes(tree).find(n => n.type === './PopoverMenu' && n.props.label === label);

test('+ 메뉴: 만들기 · 참여가 모두 있으면 말풍선 메뉴를 열고 각 항목이 해당 동작을 한다', () => {
  const calls = [];
  const render = setup('../src/diary/components/LibraryCreateMenu.js');
  const props = { compact: true, onCreate: () => calls.push('create'), onJoinLink: link => calls.push(link) };
  let tree = render(props);
  const fab = find(tree, '새 다이어리 메뉴');
  assert.equal(fab.props.accessibilityState.expanded, false);
  assert.equal(popover(tree, '새 다이어리 메뉴 목록').props.open, false);
  fab.props.onPress(); tree = render(props);
  assert.equal(popover(tree, '새 다이어리 메뉴 목록').props.open, true);
  assert.equal(find(tree, '새 다이어리 메뉴').props.accessibilityState.expanded, true);
  find(tree, '새 다이어리 만들기').props.onPress(); tree = render(props);
  assert.deepEqual(calls, ['create']);
  assert.equal(popover(tree, '새 다이어리 메뉴 목록').props.open, false);

  find(tree, '새 다이어리 메뉴').props.onPress(); tree = render(props);
  find(tree, '초대 링크로 참여').props.onPress(); tree = render(props);
  assert.equal(popover(tree, '새 다이어리 메뉴 목록').props.open, false);
  assert.equal(popover(tree, '초대 링크로 참여').props.open, true);
  // 빈 칸이면 참여를 누를 수 없다
  assert.equal(find(tree, '초대 링크로 참여하기').props.disabled, true);
  find(tree, '받은 초대 링크').props.onChangeText('  https://k15f106.p.ssafy.io/invite/1.abc  '); tree = render(props);
  assert.equal(find(tree, '초대 링크로 참여하기').props.disabled, false);
  find(tree, '초대 링크로 참여하기').props.onPress(); tree = render(props);
  assert.deepEqual(calls, ['create', 'https://k15f106.p.ssafy.io/invite/1.abc']);
  assert.equal(popover(tree, '초대 링크로 참여').props.open, false);
  // 닫은 뒤 다시 열면 칸이 비어 있다
  find(tree, '새 다이어리 메뉴').props.onPress(); tree = render(props);
  find(tree, '초대 링크로 참여').props.onPress(); tree = render(props);
  assert.equal(find(tree, '받은 초대 링크').props.value, '');
});

test('+ 메뉴: 만들기만 있으면 바로 만들고, 참여만 있으면 바로 링크 칸을 연다', () => {
  const calls = [];
  const createOnly = setup('../src/diary/components/LibraryCreateMenu.js');
  const a = { onCreate: () => calls.push('create') };
  find(createOnly(a), '새 다이어리 만들기').props.onPress();
  assert.deepEqual(calls, ['create']);
  assert.equal(popover(createOnly(a), '새 다이어리 메뉴 목록').props.open, false);

  const joinOnly = setup('../src/diary/components/LibraryCreateMenu.js');
  const b = { onJoinLink: link => calls.push(link) };
  let tree = joinOnly(b);
  find(tree, '초대 링크로 참여').props.onPress(); tree = joinOnly(b);
  assert.equal(popover(tree, '초대 링크로 참여').props.open, true);
  find(tree, '받은 초대 링크').props.onSubmitEditing(); tree = joinOnly(b);
  assert.deepEqual(calls, ['create'], '빈 칸 제출은 무시한다');
  find(tree, '받은 초대 링크').props.onChangeText('link'); tree = joinOnly(b);
  find(tree, '받은 초대 링크').props.onSubmitEditing();
  assert.deepEqual(calls, ['create', 'link']);

  assert.equal(setup('../src/diary/components/LibraryCreateMenu.js')({}), null);
});

test('보관함: 공유된 다이어리 탭은 참여만, 즐겨찾기 · 관리 중에는 + 를 숨긴다', () => {
  const render = setup('../src/diary/screens/LibraryScreen.js');
  const menu = tree => nodes(tree).find(n => n.type === '../components/LibraryCreateMenu');
  const base = { compact: true, diaries: [{ id: 'a', title: '일기' }], sort: 'updated', view: 'grid', carousel: 0, onCarouselChange: () => {}, onCreate: () => {}, onJoinLink: () => {} };
  let m = menu(render({ ...base, filter: 'personal' }));
  assert.ok(m.props.onCreate && m.props.onJoinLink);
  m = menu(render({ ...base, filter: 'shared' }));
  assert.equal(m.props.onCreate, undefined);
  assert.ok(m.props.onJoinLink);
  assert.equal(menu(render({ ...base, filter: 'favorite' })), undefined);
  assert.equal(menu(render({ ...base, filter: 'personal', selection: [] })), undefined);
  // 참여 콜백이 없는 공유 탭(개발용 목업)은 + 가 없다
  assert.equal(menu(render({ ...base, filter: 'shared', onJoinLink: undefined })), undefined);
});

test('App: + 메뉴의 링크는 받은 초대 링크와 같은 흐름(setMailInvitation)으로 넘긴다', () => {
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  assert.match(app, /const joinInviteLink = useCallback\(link => setMailInvitation\(\{ link \}\), \[\]\);/);
  assert.match(app, /onJoinInviteLink=\{joinInviteLink\}/);
  assert.match(app, /onJoinLink=\{onJoinInviteLink\}/);
  const hub = readFileSync(new URL('../src/sharing/SharingHub.js', import.meta.url), 'utf8');
  assert.doesNotMatch(hub, /accessibilityLabel="받은 초대 링크"/, '공유 창 안의 링크 칸은 없앴다');
});
