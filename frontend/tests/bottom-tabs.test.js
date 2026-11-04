import assert from 'node:assert/strict';
import test from 'node:test';
import { BOTTOM_TABS, isBottomTabSelected, navigateBottomTab } from '../src/diary/components/bottomTabModel.js';

test('하단 바는 좁은 폰 폭을 위해 다섯 개 목적지로 고정한다', () => {
  assert.equal(BOTTOM_TABS.length, 5);
  assert.deepEqual(BOTTOM_TABS.map(tab => tab.label), ['내 기록', '공유', '공방', '마이페이지', '휴지통']);
});

test('보관함 탭은 현재 범위와 일치할 때만 선택된다', () => {
  const personal = BOTTOM_TABS.find(tab => tab.filter === 'personal');
  const shared = BOTTOM_TABS.find(tab => tab.filter === 'shared');
  assert.equal(isBottomTabSelected('library', 'personal', personal), true);
  assert.equal(isBottomTabSelected('library', 'personal', shared), false);
});

test('탭은 페이지와 선택 범위를 함께 전달해 이동한다', () => {
  const calls = [];
  navigateBottomTab((...args) => calls.push(args), BOTTOM_TABS[1]);
  assert.deepEqual(calls, [['library', 'shared']]);
});
