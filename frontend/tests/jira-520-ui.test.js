import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('팔레트: 선택은 실선 하나, 편집 중에는 모두 같은 점선(선택 굵기를 겹치지 않고 실선으로 되돌린다)', () => {
  const source = read('../src/editor/components/controls/EditablePalette.js');
  assert.match(source, /editing \? s\.editing : \[s\.solid, value === entry && paletteSwatchStyles\.chosen\]/);
  assert.match(source, /solid:\{borderStyle:'solid'\}/);
});

test('글자 잘림: 슬라이더 이름 · 값, 맞춤 칸, 레이어 종류가 한 줄로 들어간다', () => {
  const slider = read('../src/editor/components/controls/Slider.js');
  assert.match(slider, /name: \{ width: 56,/);
  assert.match(slider, /inputCompact: \{ width: 52,/);
  assert.match(read('../src/diary/components/FormControls.js'), /allowFontScaling=\{false\} numberOfLines=\{1\}[^>]*>맞춤/);
  assert.match(read('../src/editor/components/panels/LayerPanel.js'), /styles\.rowType\} numberOfLines=\{1\}>\{OBJECT_TYPE_LABELS/);
});
