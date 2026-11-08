import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('팔레트: 선택은 실선 하나, 편집 중에는 점선이고 고치는 칸만 굵게(605), 편집을 끝내면 실선으로 다시 그린다(604)', () => {
  const source = read('../src/editor/components/controls/EditablePalette.js');
  assert.match(source, /editing \? \[s\.editing, \(editIndex \?\? palette\.colors\.indexOf\(value\)\) === index && s\.editFocus\] : \[s\.solid, value === entry && paletteSwatchStyles\.chosen\]/);
  assert.match(source, /key=\{editing \? 'edit' : 'pick'\}/);
  assert.match(source, /solid:\{borderStyle:'solid'\}/);
});

test('글자 잘림: 슬라이더 이름 · 값과 레이어 종류가 한 줄로 들어간다', () => {
  const slider = read('../src/editor/components/controls/Slider.js');
  assert.match(slider, /name: \{ width: 56,/);
  assert.match(slider, /inputCompact: \{ width: 52,/);
  assert.match(read('../src/editor/components/panels/LayerPanel.js'), /styles\.rowType\} numberOfLines=\{1\}>\{objectTypeLabel\(object\)/);
});

test('표지 맞춤 칸은 시스템 글자 확대 없이 한 줄로 표시한다', () => {
  const require = createRequire(import.meta.url);
  const expo = createRequire(require.resolve('expo/package.json'));
  const { code } = expo('@babel/core').transformSync(read('../src/diary/components/FormControls.js'), {
    configFile: false,
    babelrc: false,
    plugins: [
      expo.resolve('@babel/plugin-transform-modules-commonjs'),
      [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
    ],
  });
  const module = { exports: {} };
  const imports = {
    react: { createContext: value => value, useContext: context => context },
    'react-native': { Pressable: 'Pressable', View: 'View', Text: 'Text', StyleSheet: { create: styles => styles } },
    '../../shared/theme': { colors: {} },
  };
  new Function('require', 'module', 'exports', code)(
    id => id === 'react/jsx-runtime' ? require(id) : imports[id] ?? {}, module, module.exports,
  );
  const swatch = module.exports.AutoSwatch({ color: '#000000', label: '맞춤' });
  const text = swatch.props.children.props.children;
  assert.equal(text.props.children, '맞춤');
  assert.equal(text.props.allowFontScaling, false);
  assert.equal(text.props.numberOfLines, 1);
});
