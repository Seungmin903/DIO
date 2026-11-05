import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backTarget, createRouteMemory } from '../src/diary/utils/routeMemory.js';
import { normalizePageForFormFactor } from '../src/diary/components/profileNavigationModel.js';

const HOME = { page: 'library', filter: 'all' };

test('게스트에서 로그인하면 보던 화면에서 이어 간다', () => {
  const memory = createRouteMemory(HOME);
  memory.remember({ page: 'studio', filter: 'shared' }, null);
  assert.deepEqual(memory.read('member-a'), { page: 'studio', filter: 'shared' });
});

test('편집기는 돌아올 수 없어 보관함으로 기억한다', () => {
  const memory = createRouteMemory(HOME);
  memory.remember({ page: 'editor', filter: 'all' }, null);
  assert.equal(memory.read(null).page, 'library');
});

test('회원 계정을 벗어나면 다음 사람에게 넘기지 않는다', () => {
  const memory = createRouteMemory(HOME);
  memory.remember({ page: 'trash', filter: 'shared' }, 'member-a');
  assert.deepEqual(memory.read(null), HOME);
  memory.remember({ page: 'trash', filter: 'shared' }, 'member-a');
  assert.deepEqual(memory.read('member-b'), HOME);
});

test('같은 회원은 다시 그려져도 그 자리다', () => {
  const memory = createRouteMemory(HOME);
  memory.remember({ page: 'profile', filter: 'all' }, 'member-a');
  assert.equal(memory.read('member-a').page, 'profile');
});

// 뒤로 키 순서와 복원 시 불러오기는 App · 보관함 본문 안의 연결이라 코드에서 순서를 고정한다
test('휴지통에서 시작한 회원 본문은 목록을 불러온다', () => {
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  assert.match(app, /useEffect\(\(\) => \{ if \(member && page === 'trash'\) diaryState\.store\.loadTrash\(\)/);
});

// 폰에는 설정 화면이 없다: 태블릿에서 기억한 settings 가 폰(분할 화면 · 재로그인)으로 이어지면 마이페이지로 열리고, 뒤로 키도 마이페이지 기준이다
test('기억된 settings 는 폰에서 마이페이지로, 태블릿에서는 설정으로 열린다', () => {
  const memory = createRouteMemory(HOME);
  memory.remember({ page: 'settings', filter: 'all' }, 'member-a');
  const remembered = memory.read('member-a').page;
  assert.equal(remembered, 'settings');
  assert.equal(normalizePageForFormFactor(remembered, true), 'profile');
  assert.equal(normalizePageForFormFactor(remembered, false), 'settings');
  for (const page of ['library', 'studio', 'profile', 'trash', 'editor']) {
    assert.equal(normalizePageForFormFactor(page, true), page);
    assert.equal(normalizePageForFormFactor(page, false), page);
  }
  assert.deepEqual(backTarget({ page: normalizePageForFormFactor(remembered, true), filter: 'all' }, HOME), HOME);
  // App 은 화면을 고르기 전에 정규화한 값을 쓴다
  const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8');
  assert.match(app, /const page = normalizePageForFormFactor\(rawPage, isPhone\);/);
});

test('뒤로 키: 다른 화면은 기본 보관함으로, 기본 보관함이면 앱에 맡긴다', () => {
  assert.deepEqual(backTarget({ page: 'trash', filter: 'all' }, HOME), HOME);
  assert.deepEqual(backTarget({ page: 'profile', filter: 'all' }, HOME), HOME);
  assert.deepEqual(backTarget({ page: 'library', filter: 'shared' }, HOME), HOME);
  assert.equal(backTarget({ page: 'library', filter: 'all' }, HOME), null);
});

test('검색이 열려 있으면 뒤로 키는 앱을 나가지 않고 검색만 닫는다', () => {
  const library = readFileSync(new URL('../src/diary/screens/LibraryScreen.js', import.meta.url), 'utf8');
  assert.match(library, /if \(Platform\.OS !== 'android' \|\| !searchOpen\) return undefined;/);
  assert.match(library, /hardwareBackPress', \(\) => \{ setSearchOpen\(false\); setQuery\(''\); return true; \}/);
});
