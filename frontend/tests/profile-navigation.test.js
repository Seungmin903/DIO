import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizePageForFormFactor, showsInlineSettings } from '../src/diary/components/profileNavigationModel.js';
import { BOTTOM_TABS, isBottomTabSelected } from '../src/diary/components/bottomTabModel.js';

test('폰에서 settings 는 마이페이지로, 그 외 화면과 태블릿은 그대로다', () => {
  assert.equal(normalizePageForFormFactor('settings', true), 'profile');
  assert.equal(normalizePageForFormFactor('settings', false), 'settings');
  assert.equal(normalizePageForFormFactor('profile', true), 'profile');
});

test('설정은 폰 마이페이지에만 펼쳐지고 태블릿은 별도 화면을 쓴다', () => {
  assert.equal(showsInlineSettings({ compact: true, section: 'profile' }), true);
  assert.equal(showsInlineSettings({ compact: false, section: 'profile' }), false);
  assert.equal(showsInlineSettings({ compact: false, section: 'settings' }), false);
});

test('정규화된 페이지에서 하단 탭은 마이페이지 하나만 선택된다', () => {
  const page = normalizePageForFormFactor('settings', true);
  assert.deepEqual(BOTTOM_TABS.map(tab => isBottomTabSelected(page, 'personal', tab)), [false, false, false, false, true]);
});

test('App 은 settings 로 가는 진입이 태블릿 좌측 바뿐이고 폰 설정 진입 코드를 두지 않는다', () => {
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  assert.ok(!app.includes('onOpenSettings'));
  assert.ok(app.includes('normalizePageForFormFactor(rawPage, isPhone)'));
  const rail = readFileSync(new URL('../src/diary/components/SideRail.js', import.meta.url), 'utf8');
  assert.ok(rail.includes("item('settings'"));
});
