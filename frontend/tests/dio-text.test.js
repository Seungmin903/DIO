import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/shared/dioText/DioText.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,
  plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const flatten=style=>Array.isArray(style)?Object.assign({},...style.flat(Infinity).filter(Boolean).map(flatten)):style||{};
const mod={exports:{}};
new Function('require','module','exports',code)(id=>id==='react-native'?{StyleSheet:{flatten},Text:'Text',TextInput:'TextInput'}:id==='../fontScope'?{FontScope:{}}:require(id),mod,mod.exports);
const {uiWeight,dioFontStyle}=mod.exports;

test('굵기 단계는 제목만 굵게 두고 본문 · 이름표를 한 단계씩 낮추며 순서를 지킨다', () => {
  assert.equal(uiWeight('800',29),800); assert.equal(uiWeight('900',22),800); assert.equal(uiWeight('700',20),700);
  assert.equal(uiWeight('800',18),700); assert.equal(uiWeight('700',17),600); assert.equal(uiWeight('600',16),500);
  assert.equal(uiWeight('800',15),600); assert.equal(uiWeight('700',15),500); assert.equal(uiWeight('600',12),500);
  assert.equal(uiWeight(undefined,15),400); assert.equal(uiWeight('bold',14),500); assert.equal(uiWeight('300',14),400);
  for (const size of [12,15,17,24]) {
    const ladder=['400','500','600','700','800','900'].map(w=>uiWeight(w,size));
    assert.deepEqual([...ladder].sort((a,b)=>a-b),ladder);
  }
});

test('글꼴을 정하지 않은 글자에만 굵기별 Pretendard 파일을 넣고 정한 글꼴은 그대로 둔다', () => {
  assert.deepEqual(dioFontStyle([{fontSize:15,fontWeight:'700'},{color:'#000'}]),{fontFamily:'Pretendard-Medium',fontWeight:'normal'});
  assert.deepEqual(dioFontStyle({fontSize:28,fontWeight:'800'}),{fontFamily:'Pretendard-ExtraBold',fontWeight:'normal'});
  assert.equal(dioFontStyle({fontFamily:'maruburi',fontWeight:'700'}),null);
  assert.equal(dioFontStyle([{fontSize:20},{fontFamily:'sans-serif'}]),null);
});

test('DioText는 측정용 ref와 onLayout을 실제 네이티브 Text에 전달한다', () => {
  const loaded = { exports: {} };
  const react = { forwardRef: render => render, useContext: () => 'raw' };
  new Function('require','module','exports',code)(id => id === 'react' ? react
    : id === 'react-native' ? { StyleSheet: { flatten }, Text: 'NativeText', TextInput: 'NativeTextInput' }
    : id === '../fontScope' ? { FontScope: { Provider: 'FontScope' } } : require(id), loaded, loaded.exports);
  const ref = { current: { measure() {} } }, onLayout = () => {};
  const element = loaded.exports.Text({ style: { fontSize: 28 }, onLayout, children: 'test' }, ref);
  const nativeText = element.props.children;
  assert.equal(nativeText.type, 'NativeText');
  assert.equal(nativeText.props.ref, ref);
  assert.equal(nativeText.props.onLayout, onLayout);
  assert.equal(typeof nativeText.props.ref.current.measure, 'function');
});
