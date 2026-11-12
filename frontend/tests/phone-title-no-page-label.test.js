import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('폰 편집기 상단 바: 이름 아래 쪽수 줄이 없어 연필이 오른쪽 아이콘과 같은 중심선에 놓인다', () => {
  assert.doesNotMatch(read('../src/editor/components/chrome/TopBar.js'), /pageLabel/);
  assert.doesNotMatch(read('../src/editor/screens/EditorScreen.js'), /pageLabel=/);
});

test('폰 편집기 뒤로 버튼: 로고 없이 화살표만 두고 누를 자리는 hitSlop 포함 48을 지킨다', () => {
  const source = read('../src/editor/components/chrome/TopBar.js');
  const phoneHome = source.slice(source.indexOf('if (compact) {'), source.indexOf('styles.docTitle'));
  assert.match(phoneHome, /chevronLeft/);
  assert.doesNotMatch(phoneHome, /BrandLogo/);
  assert.match(source, /homeCompact: \{ minWidth: 36, minHeight: 48/);
});

test('682: 태블릿 편집기 · 읽기 화면의 돌아가기는 ‹ + 집 모양 홈 아이콘(로고 대신, 폰은 ‹ 그대로)', () => {
  const top = read('../src/editor/components/chrome/TopBar.js');
  const tabletHome = top.slice(top.indexOf('accessibilityLabel="다이어리 홈" hitSlop={6} style={({ pressed })'), top.indexOf('<View style={{ flex: 1 }} />'));
  assert.match(tabletHome, /<Icon name="chevronLeft" size=\{CHEVRON_SIZE\} \/>\s*<Icon name="house" size=\{HOME_ICON\} \/>/);
  assert.doesNotMatch(top, /BrandLogo/);
  const reading = read('../src/editor/components/chrome/ReadingChrome.js');
  assert.match(reading, /<Icon name="chevronLeft" size=\{20\} \/><Icon name="house" size=\{22\} \/>/);
  assert.doesNotMatch(reading, /BrandLogo/);
  assert.match(read('../src/editor/components/controls/Icon.js'), /house: 'M15 21v-8/);
});
