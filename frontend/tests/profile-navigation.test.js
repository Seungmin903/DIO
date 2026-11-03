import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileSettingsNavigation, shouldShowProfileSettingsButton } from '../src/diary/components/profileNavigationModel.js';

test('폰 마이페이지에서만 설정 버튼을 표시한다', () => {
  const openSettings = () => {};
  assert.equal(shouldShowProfileSettingsButton({ compact: true, settingsPage: false, onOpenSettings: openSettings }), true);
  assert.equal(shouldShowProfileSettingsButton({ compact: false, settingsPage: false, onOpenSettings: openSettings }), false);
  assert.equal(shouldShowProfileSettingsButton({ compact: true, settingsPage: true, onOpenSettings: openSettings }), false);
  assert.equal(shouldShowProfileSettingsButton({ compact: true, settingsPage: false, onOpenSettings: undefined }), false);
});

test('폰의 설정 버튼은 설정 화면으로 이동하고 태블릿에는 이동 함수를 주지 않는다', () => {
  const calls = [];
  const phoneAction = createProfileSettingsNavigation(true, page => calls.push(page));
  phoneAction();
  assert.deepEqual(calls, ['settings']);
  assert.equal(createProfileSettingsNavigation(false, () => {}), undefined);
});
