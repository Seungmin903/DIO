import test from 'node:test';
import assert from 'node:assert/strict';
import { spreadOf } from '../src/diary/utils/bookSpread.js';

const page = filled => ({ objects: filled ? [{ id: 'x' }] : [] });

test('펼침면은 좌철 실물처럼 오른쪽이 홀수 쪽이고 1쪽이면 왼쪽은 면지다', () => {
  assert.equal(spreadOf([]), null);
  const one = spreadOf([page(true)]);
  assert.equal(one.left, 'endpaper'); assert.equal(one.label, '1 / 1');
  const odd = spreadOf([page(true), page(true), page(true)]);
  assert.deepEqual([odd.latest, odd.label], [3, '2–3 / 3']);
  const even = spreadOf([page(true), page(true)]);
  assert.equal(even.right, 'blank'); assert.equal(even.label, '2 / 2');
  const evenMore = spreadOf([page(false), page(true), page(false)]);
  assert.deepEqual([evenMore.latest, evenMore.label], [2, '2–3 / 3']);
  assert.equal(spreadOf([page(false), page(false)]).latest, 1);
});
