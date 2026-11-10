import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as query from '../src/diary/utils/libraryQuery.js';
import * as selectionUtils from '../src/diary/utils/diarySelection.js';

// 스와이프 · 펼쳐서 보기에서 휴지통으로 옮길 때 옆 다이어리가 커졌다 작아지던(움찔하던) 문제. 기기(네이티브 드라이버)에서만 생긴다.
// 1) 화면에 남은 카드가 애니메이션 노드를 바꿔 받으면 react-native 가 옛 노드 값을 기본값으로 되돌린다
//    (createAnimatedPropsHook 의 useAnimatedPropsLifecycle → restoreDefaultValues: transform · opacity 초기화. 마운트 해제에는 되돌리지 않는다).
//    → 노드는 자리마다 한 번만 만들어 유지하고, 자리가 바뀐 카드는 노드만 바꾸지 않고 새로 마운트한다.
// 2) 스크롤 이벤트는 네이티브 드라이버라 JS 쪽 scrollX 가 바뀌지 않는데, 새로 그리거나 마운트할 때는 그 JS 값으로 크기를 계산한다
//    (AnimatedEvent: 네이티브면 setValue 없이 리스너만 · AnimatedTransform.__getValueWithStaticTransforms: 그릴 때 JS 값).
//    → 넘기기가 끝나면 JS 값을 실제 위치로 맞춘다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
const compile = file => babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), { configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code;

// library-controls.test.js 와 같은 가짜 React · react-native. Animated.Value 는 setValue 를 기록한다(네이티브처럼 스크롤로는 바뀌지 않는다)
function setup() {
  const state = [], refs = [], effects = [], cleanups = [], values = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, made = 0; // made: 만든 애니메이션 노드 수
  const hooks = {
    memo: fn => fn,
    useState: initial => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v }] },
    useRef: initial => { const i = refCursor++; return refs[i] ??= { current: initial } },
    useCallback: fn => fn,
    useEffect: (fn, deps) => { const i = effectCursor++; if (!effects[i] || deps.some((v, j) => v !== effects[i][j])) { cleanups[i]?.(); effects[i] = deps; cleanups[i] = fn() } },
  };
  // useMemo 도 의존성이 같으면 이전 값을 돌려준다(노드 유지 여부를 보려고)
  const memos = []; let memoCursor = 0;
  hooks.useMemo = (fn, deps) => { const i = memoCursor++; if (!memos[i] || deps.some((v, j) => v !== memos[i].deps[j])) memos[i] = { deps, value: fn() }; return memos[i].value };
  hooks.useLayoutEffect = hooks.useEffect;
  class Value { constructor(v) { this.v = v; this.sets = []; values.push(this) } interpolate() { return 1 } setValue(v) { this.v = v; this.sets.push(v) } }
  const styles = new Proxy({}, { get: (_, name) => name });
  const mocks = {
    '../components/OpenBookShelf': { __esModule: true, default: 'OpenBookShelf', preloadOpenBooks: () => {} },
    '../components/EmptyState': { __esModule: true, default: 'EmptyState', LoadingSpot: 'LoadingSpot' },
    '../utils/useDiaryGrid': { useDiaryGrid: () => null },
    '../utils/carouselFollow': { carouselMotion: (_scrollX, index) => ({ card: { index, made: ++made }, info: {} }) },
    '../utils/railMotion': { markRailMoving: () => {}, useRailMoving: () => false },
    '../../editor/services/storage': {},
    '../../auth/loginGate': { useLoginEntry: () => () => {} },
    react: hooks,
    'react-native': { Platform: { OS: 'android' }, BackHandler: { addEventListener: () => ({ remove() {} }) }, View: 'view', Text: 'text', Pressable: 'press', TextInput: 'input', ScrollView: 'scroll', FlatList: 'list',
      Animated: { timing: () => ({ start() {}, stop() {} }), Value, View: 'view', Text: 'text', createAnimatedComponent: () => 'list', event: (_mapping, config) => event => config?.listener?.(event) }, Easing: { cubic: () => {}, out: x => x } },
    '../constants': { C: {}, FILTERS: [{ id: 'personal', label: '모든 다이어리' }, { id: 'favorite', label: '즐겨찾기' }],
      LIBRARY_SCOPES: [{ id: 'personal', label: '내 다이어리', tabLabel: '내 다이어리', icon: 'book', empty: '내 다이어리가 없어요' }],
      CAROUSEL_STEP: 250, CAROUSEL_ITEM_WIDTH: 220, CAROUSEL_GAP: 30 },
    '../styles': { styles },
    '../utils/diarySelection': selectionUtils,
    '../utils/libraryQuery': query,
    '../hooks/useLibraryMetadata': { useLibraryMetadata: () => ({}) },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compile('../src/diary/screens/LibraryScreen.js'))(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports);
  const render = props => { cursor = 0; refCursor = 0; effectCursor = 0; memoCursor = 0; return module.exports.default(props) };
  render.unmount = () => cleanups.forEach(fn => fn?.());
  render.values = values;
  return render;
}
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children, node.props?.done].flat(Infinity).flatMap(nodes)];
const diaries = [{ id: 'a', title: '가' }, { id: 'b', title: '나' }, { id: 'c', title: '다' }, { id: 'd', title: '라' }];
const props = moved => ({ compact: false, diaries, filter: 'personal', sort: 'title', view: 'carousel', carousel: 0, onCarouselChange: index => moved.push(index), onViewChange() {} });
const carouselList = tree => nodes(tree).find(node => node.type === 'list' && node.props?.horizontal);
// 스와이프 카드 목록(FlatList) 의 renderItem 으로 index 자리 카드를 그린다
const cardAt = (tree, items, index) => carouselList(tree).props.renderItem({ item: items[index], index });
// 카드 크기를 계산하는 scrollX: 처음 위치(carousel * CAROUSEL_STEP)로 만든 Animated.Value
const scrollXOf = render => render.values[0];

test('휴지통 이동으로 카드 수가 줄어도 자리가 그대로인 카드는 같은 애니메이션 노드 · 같은 key 를 유지한다(노드를 바꾸면 react-native 가 기본값으로 되돌려 튄다)', () => {
  const moved = [], render = setup(), base = { ...props(moved), carousel: 1 }
  let tree = render(base)
  const before = [0, 1, 2].map(index => cardAt(tree, diaries, index))
  const rest = diaries.filter(diary => diary.id !== 'b') // a b c d 에서 가운데(b)를 휴지통으로
  tree = render({ ...base, diaries: rest })
  const after = [0, 1].map(index => cardAt(tree, rest, index))
  // 왼쪽(a, 자리 0): 노드 · key 그대로 → 다시 연결도, 기본값 되돌리기도 없다
  assert.equal(after[0].props.animatedStyle, before[0].props.animatedStyle)
  assert.equal(after[0].key, before[0].key)
  // 자리 1 노드도 다시 만들지 않는다(자리마다 한 번)
  assert.equal(after[1].props.animatedStyle, before[1].props.animatedStyle)
  render.unmount()
})

test('휴지통 이동으로 옆 카드가 당겨져 자리가 바뀌면 그 카드는 노드만 바꾸지 않고 새로 마운트한다(key 에 자리 포함)', () => {
  const moved = [], render = setup(), base = { ...props(moved), carousel: 1 }
  let tree = render(base)
  const rightBefore = cardAt(tree, diaries, 2) // c: 가운데 오른쪽
  const rest = diaries.filter(diary => diary.id !== 'b')
  tree = render({ ...base, diaries: rest })
  const centerAfter = cardAt(tree, rest, 1) // c 가 가운데로 당겨짐
  assert.equal(centerAfter.props.diary.id, 'c')
  assert.notEqual(centerAfter.key, rightBefore.key, '자리가 바뀌면 key 가 달라 새로 마운트된다(마운트 해제에는 기본값으로 되돌리지 않는다)')
  assert.equal(centerAfter.props.animatedStyle.index, 1)
  render.unmount()
})

test('손으로 넘겨 멈추면(스크롤 끝) JS 쪽 scrollX 를 멈춘 위치로 맞춘다(새로 마운트되는 카드가 처음부터 맞는 크기로 그려지게)', () => {
  const moved = [], render = setup()
  const tree = render(props(moved))
  const scrollX = scrollXOf(render)
  assert.equal(scrollX.v, 0)
  carouselList(tree).props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 500 } } })
  assert.equal(scrollX.v, 500, '네이티브가 멈춘 위치와 같아야 다음에 다시 그릴 때 카드 크기가 맞다')
  assert.deepEqual(moved, [2])
  render.unmount()
})

test('화살표로 넘기면 부드러운 이동이 끝난 뒤 JS 쪽 scrollX 를 스크롤이 실제로 알려 준 위치로 맞춘다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  for (const [reported, label] of [[250, '목표까지 갔으면 그 위치'], [120, '시간 안에 목표까지 못 갔으면 실제 위치(카드 크기와 위치가 어긋나지 않게)']]) {
    const moved = [], render = setup()
    const tree = render(props(moved))
    const scrollX = scrollXOf(render)
    nodes(tree).find(node => node.props?.accessibilityLabel === '다음 다이어리').props.onPress()
    carouselList(tree).props.onScroll({ nativeEvent: { contentOffset: { x: reported } } }) // 네이티브: 스크롤 이벤트는 JS 값을 바꾸지 않는다
    assert.equal(scrollX.v, 0, '이동 중에는 바꾸지 않는다(이동 도중에 바꾸면 카드가 튄다)')
    t.mock.timers.tick(1000)
    assert.equal(scrollX.v, reported, label)
    assert.deepEqual(moved, [1])
    render.unmount()
  }
})

test('펼쳐서 보기도 자리마다 노드를 유지하고 자리가 바뀐 책은 새로 마운트하며, 멈춘 뒤 · 화살표 이동이 끝난 뒤 JS 쪽 scrollValue 를 맞춘다', () => {
  const shelf = readFileSync(new URL('../src/diary/components/OpenBookShelf.js', import.meta.url), 'utf8')
  assert.match(shelf, /const motionCache = useMemo\(\(\) => new Map\(\), \[scrollValue, step\]\);/)
  assert.match(shelf, /if \(!motionCache\.has\(at\)\) motionCache\.set\(at, carouselMotion\(/)
  assert.match(shelf, /<OpenBook key=\{`\$\{diary\.id\}:\$\{at\}`\}/)
  // settle: 스냅 위치에 멈췄으면 scrollValue 를 그 위치로(덜 맞으면 마저 붙인 뒤 다시 settle 된다)
  assert.match(shelf, /if \(Math\.abs\(row\.offsets\[at\] - x\) > 1\) scrollRef\.current\?\.scrollTo\?\.\(\{ x: row\.offsets\[at\], animated: true \}\);[\s\S]{0,400}?else scrollValue\.setValue\(x\);/)
  // goTo: 이동이 끝나는 타이머에서 scrollValue 도 스크롤이 실제로 알려 준 마지막 위치로(목표로 덮기 전에)
  assert.match(shelf, /moveTimer\.current = setTimeout\(\(\) => \{ target\.current = null; if \(Number\.isFinite\(scrollX\.current\)\) scrollValue\.setValue\(scrollX\.current\); scrollX\.current = row\.offsets\[at\];/)
})

test('다시 마운트된 카드는 기억해 둔 표지 안쪽 여백으로 시작한다(이름 줄이 옆으로 움찔하지 않게)', () => {
  const card = readFileSync(new URL('../src/diary/components/DiaryCard.js', import.meta.url), 'utf8')
  assert.match(card, /const coverInsetMemory = new Map\(\);/)
  assert.match(card, /useState\(\(\) => coverInsetMemory\.get\(insetKey\) \?\? 0\)/)
  assert.match(card, /coverInsetMemory\.set\(insetKey, value\)/)
})
