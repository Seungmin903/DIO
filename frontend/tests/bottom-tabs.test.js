import assert from 'node:assert/strict';
import test from 'node:test';
import { BOTTOM_TABS, isBottomTabSelected, navigateBottomTab } from '../src/diary/components/bottomTabModel.js';

test('하단 바는 다섯 개 목적지다(설정은 마이페이지 안)', () => {
  assert.deepEqual(BOTTOM_TABS.map(tab => tab.label), ['내 기록', '공유', '공방', '휴지통', '마이페이지']);
  assert.ok(!BOTTOM_TABS.some(tab => tab.id === 'settings'));
});

test('보관함 탭은 현재 범위와 일치할 때만 선택된다', () => {
  const personal = BOTTOM_TABS.find(tab => tab.filter === 'personal');
  const shared = BOTTOM_TABS.find(tab => tab.filter === 'shared');
  assert.equal(isBottomTabSelected('library', 'personal', personal), true);
  assert.equal(isBottomTabSelected('library', 'personal', shared), false);
});

test('정규화되지 않은 settings 에서도 마이페이지 탭이, 휴지통 화면에서는 휴지통 탭이 선택 상태다', () => {
  assert.deepEqual(BOTTOM_TABS.map(tab => isBottomTabSelected('settings', 'personal', tab)), [false, false, false, false, true]);
  assert.deepEqual(BOTTOM_TABS.map(tab => isBottomTabSelected('trash', 'personal', tab)), [false, false, false, true, false]);
});

test('탭은 페이지와 선택 범위를 함께 전달해 이동한다', () => {
  const calls = [];
  navigateBottomTab((...args) => calls.push(args), BOTTOM_TABS[1]);
  assert.deepEqual(calls, [['library', 'shared']]);
});
