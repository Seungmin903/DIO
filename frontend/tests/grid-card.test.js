import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { cardTapAction } from '../src/diary/utils/libraryView.js';
import { isSharedDiary } from '../src/diary/utils/libraryQuery.js';

// 태블릿 한눈에 보기: DiaryCard 의 cell 경로와 useDiaryGrid 훅(폰이면 null, 태블릿이면 칸 크기 · 간격)을 확인한다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
function compile(file, load) {
  const { code } = babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(load, module, module.exports);
  return module.exports;
}

// useState 상태를 렌더 사이에 이어 가는 간단한 훅 하네스
let states = [], cursor = 0;
const react = {
  memo: fn => fn,
  useRef: initial => ({ current: initial }),
  useCallback: fn => fn,
  useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
};
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];

const RawCard = compile('../src/diary/components/DiaryCard.js', id => {
  if (id === 'react') return react;
  if (id === '../../shared/FavoriteStar') return { __esModule: true, default: 'star' };
  if (id === './DiaryActionBubble') return { __esModule: true, default: 'sheet' };
  if (id === '../utils/deskInk') return { useDeskDark: () => false };
  if (id === '../utils/coverDesign') return { COVER_GRADIENTS: [], normalizeCover: () => ({ enabled: true, kind: 'color', color: '#BDC2E1' }) };
  if (id === 'react-native') return { Animated: { View: 'animated' }, Pressable: 'button', Text: 'text', View: 'view' };
  if (id === '../constants') return { C: {} };
  if (id === '../utils/libraryQuery') return { isSharedDiary };
  if (id === '../utils/libraryView') return { cardTapAction };
  if (id === './SelectionMark') return { __esModule: true, default: 'SelectionMark' };
  if (id === '../../shared/theme') return { DISABLED_OPACITY: 0.45 };
  if (id === '../styles') return { styles: new Proxy({}, { get: (_, key) => key }) };
  if (id.endsWith('/AppIcon') || id === './Cover') return { __esModule: true, default: 'mock' };
  return require(id);
}).default;
const Card = props => { cursor = 0; return RawCard(props); };
const diary = { id: 'd1', title: '여행' };
const flat = style => [style].flat(Infinity).filter(Boolean);
// 표지가 알려 주는 안쪽 간격(세로 표지는 칸 가운데에 놓여 왼쪽에서 떨어진다)을 주고 다시 그린다
const withInset = (props, inset = 40) => {
  states = [];
  const first = Card({ diary, ...props });
  nodes(first).find(node => typeof node.props.onInset === 'function').props.onInset(inset);
  return Card({ diary, ...props });
};
// 카드 자체(바깥 Pressable)는 트리에서 가장 먼저 나오는 button 이다(그 안의 더보기 버튼보다 앞)
const cardStyle = tree => flat(nodes(tree).find(node => node.type === 'button').props.style({ pressed: false }));
// 스타일 이름은 문자열(목 styles 가 키를 그대로 돌려준다), 값은 객체다. 이름 · 폭 · 안쪽 간격으로 찾는다
const infoStyle = tree => flat(nodes(tree).find(node => node.type === 'animated' && flat(node.props.style).includes('cardInfo')).props.style);
const has = (styles, key) => styles.some(style => typeof style === 'object' && key in style);

test('태블릿 칸(cell)을 주면 카드 폭을 그 값으로 고정하고 제목 · ⋯ 는 표지 양끝에 맞춘다', () => {
  const tree = withInset({ layout: 'grid', cell: 212 });
  assert.ok(cardStyle(tree).some(style => style?.width === 212), '카드 폭');
  assert.ok(infoStyle(tree).some(style => style?.marginLeft === 40 && style?.marginRight === 40), '표지 양끝');
});

test('cell 이 없으면(폰) 퍼센트 폭 그대로 두고 제목 · ⋯ 를 표지 양끝에 맞춘다', () => {
  const tree = withInset({ layout: 'grid', compact: true });
  assert.ok(!has(cardStyle(tree), 'width'), '고정 폭이 없다');
  assert.ok(infoStyle(tree).some(style => style?.marginLeft === 40 && style?.marginRight === 40), '표지 양끝');
});

test('스와이프는 cell 과 무관하게 제목이 표지 왼쪽 끝을 따른다', () => {
  const tree = withInset({ layout: 'carousel', cell: 212 });
  assert.ok(!cardStyle(tree).some(style => style?.width === 212), '스와이프 카드 폭은 그대로');
  assert.ok(infoStyle(tree).some(style => style?.marginLeft === 40));
});

const loadHook = ({ windowWidth }) => {
  const gridLayout = compile('../src/diary/utils/gridLayout.js', id => require(id));
  return compile('../src/diary/utils/useDiaryGrid.js', id => {
    if (id === 'react') return react;
    if (id === 'react-native') return { useWindowDimensions: () => ({ width: windowWidth, height: 800 }) };
    if (id === '../components/SideRail') return { RAIL_WIDTH: { collapsed: 78, expanded: 218 } };
    if (id === './gridLayout') return gridLayout;
    return require(id);
  }).useDiaryGrid;
};
const useGrid = (options, ...args) => { cursor = 0; return loadHook(options)(...args); };

test('useDiaryGrid: 폰이면 null 이라 퍼센트 배치를 그대로 쓴다', () => {
  states = [];
  assert.equal(useGrid({ windowWidth: 412 }, true), null);
});

test('useDiaryGrid: 태블릿은 첫 프레임에 창 폭으로 짐작한 칸 크기 · 간격을 돌려준다', () => {
  states = [];
  // 1194 - 메뉴 78 - 좌우 여백 30x2 = 1056 → 5권, 칸 195
  const grid = useGrid({ windowWidth: 1194 }, false);
  assert.equal(grid.cell, 195);
  assert.deepEqual(grid.style, { width: 5 * 195 + 4 * 20, columnGap: 20, rowGap: 32, alignSelf: 'center' });
  assert.equal(typeof grid.onLayout, 'function');
});

test('useDiaryGrid: 줄 간격은 화면이 정할 수 있고, 잰 폭이 짐작보다 우선한다', () => {
  states = [];
  const hook = loadHook({ windowWidth: 1194 });
  cursor = 0; const first = hook(false, 14);
  assert.equal(first.style.rowGap, 14);
  first.onLayout({ nativeEvent: { layout: { width: 696 } } }); // 세로로 든 폭
  cursor = 0; const measured = hook(false, 14);
  assert.equal(measured.cell, 212);
  assert.equal(measured.style.width, 3 * 212 + 2 * 20);
});
