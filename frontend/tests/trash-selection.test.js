import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllSelected, isTrashUrgent, pruneSelection, selectableIds, splitSelection, toggleSelection } from '../src/diary/utils/trashSelection.js';

const DAY = 24 * 60 * 60 * 1000;
const row = (id, canRestore, canDelete) => ({ diary: { id }, canRestore, canDelete });

test('기한이 3일 이하로 남았거나 지났을 때만 긴급이고 기한을 모르면 긴급이 아니다', () => {
  const now = 1_000_000_000_000;
  assert.equal(isTrashUrgent(now + 3 * DAY, now), true);
  assert.equal(isTrashUrgent(now + 3 * DAY + 1, now), false);
  assert.equal(isTrashUrgent(now - DAY, now), true);
  assert.equal(isTrashUrgent(null, now), false);
  assert.equal(isTrashUrgent(undefined, now), false);
  assert.equal(isTrashUrgent(NaN, now), false);
});

test('사라진 항목만 선택에서 빼고 바뀐 게 없으면 같은 배열을 돌려준다', () => {
  const selected = ['a', 'b'];
  assert.equal(pruneSelection(selected, new Set(['a', 'b', 'c'])), selected);
  assert.deepEqual(pruneSelection(selected, new Set(['b'])), ['b']);
  assert.equal(pruneSelection(null, new Set()), null);
  const empty = [];
  assert.equal(pruneSelection(empty, new Set()), empty);
});

test('선택 토글은 선택 모드에서만 동작하고 같은 항목을 다시 누르면 해제한다', () => {
  assert.equal(toggleSelection(null, 'a'), null);
  assert.deepEqual(toggleSelection([], 'a'), ['a']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']);
});

test('고른 항목을 복원 가능 · 삭제 가능으로 나누고 목록에 없는 id 는 무시한다', () => {
  const rows = [row('a', true, true), row('b', false, true), row('c', true, false), row('d', false, false)];
  const { picked, restorable, deletable } = splitSelection(rows, ['a', 'b', 'c', 'd', 'gone']);
  assert.deepEqual(picked.map(item => item.diary.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(restorable.map(item => item.diary.id), ['a', 'c']);
  assert.deepEqual(deletable.map(item => item.diary.id), ['a', 'b']);
  assert.deepEqual(splitSelection(rows, null).picked, []);
});

test('전체 선택은 복원도 삭제도 못 하는 항목을 제외하고 모두 골랐을 때만 참이다', () => {
  const rows = [row('a', true, true), row('b', false, false), row('c', false, true)];
  assert.deepEqual(selectableIds(rows), ['a', 'c']);
  assert.equal(isAllSelected(rows, ['a']), false);
  assert.equal(isAllSelected(rows, ['a', 'c']), true);
  assert.equal(isAllSelected([row('x', false, false)], []), false);
  assert.equal(isAllSelected(rows, null), false);
});
