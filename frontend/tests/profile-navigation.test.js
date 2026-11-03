import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../src/diary/screens/ProfileScreen.js', import.meta.url), 'utf8');

test('폰 마이페이지 설정 버튼은 설정 이동 경로를 사용한다', () => {
  assert.match(appSource, /onOpenSettings=\{isPhone \? \(\) => navigate\('settings'\) : undefined\}/);
  assert.match(profileSource, /const settingsButton = compact && !settingsPage && onOpenSettings/);
  assert.match(profileSource, /accessibilityLabel="설정" onPress=\{onOpenSettings\}/);
});

test('태블릿 마이페이지에는 중복 설정 버튼을 두지 않는다', () => {
  assert.match(appSource, /onOpenSettings=\{isPhone \? \(\) => navigate\('settings'\) : undefined\}/);
  assert.doesNotMatch(profileSource, /const settingsButton = !settingsPage && onOpenSettings/);
});
