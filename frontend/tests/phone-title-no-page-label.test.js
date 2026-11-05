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
