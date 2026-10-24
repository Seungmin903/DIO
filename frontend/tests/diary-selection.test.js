import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { toggleSelection, visibleSelection } from '../src/diary/utils/diarySelection.js';
import { markTrashed } from '../src/diary/utils/trashRetention.js';

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/components/DiaryCard.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
});
function loadCard() {
  const module = { exports: {} };
  const load = (id) => {
    if (id === 'react') return { memo: (fn) => fn };
    if (id === 'react-native') return { Animated: { View: 'animated' }, Pressable: 'button', Text: 'text', View: 'view' };
    if (id === '../constants') return { C: {} };
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
const Card = loadCard();
const diary = { id: 'd1', title: '여행', favorite: false };

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
  const events = [];
  const props = { diary, layout, carouselActive: true, onOpen: (d) => events.push(['open', d.id]), onToggleSelect: (d) => events.push(['toggle', d.id]),
    onEdit() {}, onFavorite() {}, onDelete() {} };
  const pressable = (tree) => nodes(tree).find((n) => n.type === 'button' && n.props.accessibilityLabel?.startsWith('여행 '));

  const normal = Card(props);
  pressable(normal).props.onPress();
  assert.deepEqual(events, [['open', 'd1']]);
  assert.ok(nodes(normal).some((n) => n.props?.accessibilityLabel === '여행 휴지통으로 이동'));

  events.length = 0;
  const picking = Card({ ...props, selecting: true, selected: false });
  const card = pressable(picking);
  assert.equal(card.props.accessibilityRole, 'checkbox');
  assert.deepEqual(card.props.accessibilityState, { checked: false });
  card.props.onPress();
  assert.deepEqual(events, [['toggle', 'd1']]);
  for (const label of ['여행 수정', '즐겨찾기 추가', '여행 휴지통으로 이동']) assert.ok(!nodes(picking).some((n) => n.props?.accessibilityLabel === label), label);

  const chosen = pressable(Card({ ...props, selecting: true, selected: true }));
  assert.deepEqual(chosen.props.accessibilityState, { checked: true });
  assert.ok(chosen.props.style({ pressed: false }).includes('cardSelected'));
});
