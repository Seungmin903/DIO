import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { toggleSelection, visibleSelection } from '../src/diary/utils/diarySelection.js';
import { markTrashed } from '../src/diary/utils/trashRetention.js';
import { isSharedDiary } from '../src/diary/utils/libraryQuery.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/components/DiaryCard.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
});
// useState 상태를 렌더 사이에 이어 가는 간단한 훅 하네스(더보기 시트 열림 상태 확인용)
let hookStates = [], hookCursor = 0;
const resetHooks = () => { hookStates = []; hookCursor = 0; };
function loadCard() {
  const module = { exports: {} };
  const load = (id) => {
    if (id === 'react') return {
      memo: (fn) => fn,
      useRef: (initial) => ({ current: initial }),
      useState: (initial) => { const i = hookCursor++; if (!(i in hookStates)) hookStates[i] = initial; return [hookStates[i], (value) => { hookStates[i] = typeof value === 'function' ? value(hookStates[i]) : value; }]; },
    };
    if (id === '../../shared/FavoriteStar') return { __esModule: true, default: 'star' };
    if (id === './DiaryActionBubble') return { __esModule: true, default: 'sheet' };
    if (id === '../utils/deskInk') return { useDeskDark: () => false };
    if (id === '../utils/coverDesign') return { COVER_GRADIENTS: [], normalizeCover: () => ({ enabled: true, kind: 'color', color: '#BDC2E1' }) };
    if (id === 'react-native') return { Animated: { View: 'animated' }, Pressable: 'button', Text: 'text', View: 'view' };
    if (id === '../constants') return { C: {} };
    if (id === '../utils/libraryQuery') return { isSharedDiary };
    if (id === '../../shared/theme') return { DISABLED_OPACITY: 0.45 };
    if (id === '../styles') return { styles: new Proxy({}, { get: (_, key) => key }) };
    if (id.endsWith('/AppIcon') || id === './Cover') return { __esModule: true, default: 'mock' };
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(load, module, module.exports);
  return module.exports.default;
}
function nodes(value) {
  if (!value || typeof value !== 'object') return [];
  return [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
}
const RawCard = loadCard();
const Card = (props) => { hookCursor = 0; return RawCard(props); };
const diary = { id: 'd1', title: '여행', favorite: false };

test('카드는 로컬 요약·목 응답의 실제 페이지 수를 사용하고 0과 미확인·실패를 구분한다', () => {
  const count = props => nodes(Card({ diary, ...props })).find(node => node.props.testID === 'diary-page-count-d1').props.children;
  assert.equal(count({ diary: { ...diary, pageCount: 5 } }), '5페이지');
  assert.equal(count({ diary: { ...diary, pageCount: 5 }, pageCount: 3 }), '3페이지');
  assert.equal(count({ pageCount: 0 }), '0페이지');
  assert.equal(count({}), '페이지 수 확인 중');
  for (const pageCount of [null, -1, 2.5, '12', NaN]) assert.equal(count({ pageCount }), '페이지 수 확인 불가');
  assert.equal(count({ diary: { ...diary, pageCount: 5 }, pageCount: null }), '페이지 수 확인 불가');
});

test('선택 목록은 누를 때마다 넣고 빼며, 보이지 않는 다이어리는 선택에서 뺀다', () => {
  assert.deepEqual(toggleSelection([], 'a'), ['a']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(visibleSelection(['a', 'b', 'c'], [{ id: 'c' }, { id: 'a' }]), ['a', 'c']);
  assert.deepEqual(visibleSelection(['a'], []), []);
});

test('고른 다이어리에만 삭제 시각을 기록하고 원본 목록과 이미 버린 항목의 기한은 바꾸지 않는다', () => {
  const list = [{ id: 'a', trashedAt: null }, { id: 'b', trashedAt: null }, { id: 'c', trashedAt: '2026-10-01T00:00:00.000Z' }];
  const next = markTrashed(list, ['a', 'c'], '2026-10-22T00:00:00.000Z');
  assert.deepEqual(next.map((d) => d.trashedAt), ['2026-10-22T00:00:00.000Z', null, '2026-10-01T00:00:00.000Z']);
  assert.equal(list[0].trashedAt, null);
  assert.equal(next[1], list[1]);
});

for (const layout of ['grid', 'carousel']) test(`${layout}: 관리 모드에서 카드를 누르면 열지 않고 선택만 바꾸며 카드 안 버튼을 숨긴다`, () => {
  resetHooks();
  const events = [];
  const props = { diary, layout, carouselActive: true, onOpen: (d) => events.push(['open', d.id]), onToggleSelect: (d) => events.push(['toggle', d.id]),
    onEdit() {}, onFavorite() {}, onDelete() {} };
  const pressable = (tree) => nodes(tree).find((n) => n.type === 'button' && n.props.accessibilityLabel?.startsWith('여행 '));

  const normal = Card(props);
  pressable(normal).props.onPress();
  assert.deepEqual(events, [['open', 'd1']]);
  // 즐겨찾기는 왼쪽 위 별 버튼, 수정 · 휴지통은 표지 위 더보기 버튼 뒤(동작 시트)에 있다
  assert.ok(nodes(normal).some((n) => n.props?.accessibilityLabel === '여행 더보기'));
  assert.ok(nodes(normal).some((n) => n.props?.accessibilityLabel === '즐겨찾기 추가'));
  for (const label of ['여행 수정', '여행 휴지통으로 이동']) assert.ok(!nodes(normal).some((n) => n.props?.accessibilityLabel === label), label);

  events.length = 0;
  resetHooks();
  const picking = Card({ ...props, selecting: true, selected: false });
  const card = pressable(picking);
  assert.equal(card.props.accessibilityRole, 'checkbox');
  assert.deepEqual(card.props.accessibilityState, { checked: false });
  card.props.onPress();
  assert.deepEqual(events, [['toggle', 'd1']]);
  for (const label of ['여행 더보기', '여행 수정', '즐겨찾기 추가', '여행 휴지통으로 이동']) assert.ok(!nodes(picking).some((n) => n.props?.accessibilityLabel === label), label);

  const chosen = pressable(Card({ ...props, selecting: true, selected: true }));
  assert.deepEqual(chosen.props.accessibilityState, { checked: true });
  assert.ok(chosen.props.style({ pressed: false }).includes('cardSelected'));
});

test('스와이프에서는 가운데(고른) 카드에만 더보기 버튼이 있다', () => {
  resetHooks();
  const label = '여행 더보기';
  assert.ok(nodes(Card({ diary, layout: 'carousel', carouselActive: true, onOpen() {} })).some((n) => n.props?.accessibilityLabel === label));
  resetHooks();
  assert.ok(!nodes(Card({ diary, layout: 'carousel', carouselActive: false, onOpen() {} })).some((n) => n.props?.accessibilityLabel === label));
  resetHooks();
  assert.ok(nodes(Card({ diary, layout: 'grid', onOpen() {} })).some((n) => n.props?.accessibilityLabel === label));
});

test('더보기 시트: 수정 · 휴지통으로 이동을 같은 이름으로 열고, 누르면 시트를 닫은 뒤 동작을 실행하며 카드는 열지 않는다', () => {
  resetHooks();
  const calls = [];
  const props = { diary, layout: 'grid', onOpen: (d) => calls.push(['open', d.id]), onFavorite: (id) => calls.push(['favorite', id]), onEdit: (d) => calls.push(['edit', d.id]), onDelete: (d) => calls.push(['delete', d.id]) };
  let tree = Card(props);
  const more = nodes(tree).find((n) => n.props?.accessibilityLabel === '여행 더보기');
  assert.equal(more.props.accessibilityState.expanded, false);
  more.props.onPress({ stopPropagation() { calls.push(['stop']); } });
  assert.deepEqual(calls, [['stop']]); // 카드의 열기 동작으로 올라가지 않는다
  tree = Card(props);
  const sheet = nodes(tree).find((n) => n.type === 'sheet');
  assert.ok(sheet);
  assert.deepEqual(sheet.props.actions.map((a) => a.label), ['여행 수정', '여행 휴지통으로 이동']);
  assert.equal(sheet.props.title, '여행');
  calls.length = 0;
  sheet.props.actions[1].onPress();
  assert.deepEqual(calls, [['delete', 'd1']]);
  tree = Card(props);
  assert.ok(!nodes(tree).some((n) => n.type === 'sheet')); // 동작 뒤 시트가 닫힌다
  assert.ok(nodes(tree).find((n) => n.props?.accessibilityLabel === '여행 더보기').props.accessibilityState.expanded === false);
});

test('더보기 시트는 권한 · 콜백이 없는 동작을 숨기거나 끄고, 즐겨찾기는 별 버튼이 맡는다', () => {
  const sheetOf = (extra) => {
    resetHooks();
    const props = { diary, layout: 'grid', onOpen() {}, ...extra };
    nodes(Card(props)).find((n) => n.props?.accessibilityLabel === '여행 더보기').props.onPress({ stopPropagation() {} });
    return nodes(Card(props)).find((n) => n.type === 'sheet');
  };
  // 공유 다이어리의 읽기 전용 구성원: 수정 · 휴지통이 없으니 더보기 버튼 자체를 두지 않는다(즐겨찾기는 왼쪽 위 별로)
  resetHooks();
  assert.ok(!nodes(Card({ diary: { ...diary, canManage: false }, layout: 'grid', onOpen() {} })).some((n) => n.props?.accessibilityLabel === '여행 더보기'));
  const noDelete = sheetOf({ diary: { ...diary, canDelete: false }, onEdit() {} });
  assert.deepEqual(noDelete.props.actions.map((a) => a.id), ['edit']);
  const noEdit = sheetOf({ diary: { ...diary, canEdit: false }, onEdit() {}, onDelete() {} });
  assert.ok(noEdit.props.actions.find((a) => a.id === 'edit').disabled);
  // 즐겨찾기는 표지 왼쪽 위의 별 버튼이 켜고 끈다(한 별 · 안 한 별 모두 보이고, 누르면 카드는 열지 않는다)
  const star = (extra) => { resetHooks(); return nodes(Card({ diary: { ...diary, ...extra.diary }, layout: 'grid', onOpen() {}, ...extra.props })).find((n) => n.type === 'button' && n.props.accessibilityLabel?.startsWith('즐겨찾기')); };
  assert.equal(star({ props: { onFavorite() {} } }).props.accessibilityLabel, '즐겨찾기 추가');
  assert.equal(star({ diary: { favorite: true }, props: { onFavorite() {} } }).props.accessibilityLabel, '즐겨찾기 해제');
  const calls = [];
  star({ props: { onFavorite: (id) => calls.push(id) } }).props.onPress({ stopPropagation() { calls.push('stop'); } });
  assert.deepEqual(calls, ['stop', 'd1']);
});
