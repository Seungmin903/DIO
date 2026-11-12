import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as bus from '../src/handwriting/studioBus.js';
import { HANDWRITING_FONT_CREATION_ENABLED } from '../src/shared/featureFlags.js';
const require=createRequire(import.meta.url), expo=createRequire(require.resolve('expo/package.json'));
function load(file, resolve) {
  const {code}=expo('@babel/core').transformSync(readFileSync(new URL(file,import.meta.url),'utf8'),{
    configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  const m={exports:{}};
  new Function('require','module','exports',code)(id=>id==='react/jsx-runtime'?require(id):resolve(id),m,m.exports);
  return m.exports.default;
}
test('폰트 제작기 실제 EditorModal은 전체 화면·슬라이드·방향과 미저장 뒤로가기 확인을 전달한다', async () => {
  const Modal=load('../src/editor/components/controls/EditorModal.js',id=>id==='react-native'?{Modal:'native-modal'}:{});
  const Studio=load('../src/handwriting/HandwritingStudio.js',id=>{
    if(id==='react-native')return {StyleSheet:{create:value=>value},Platform:{OS:"android"}};
    if(id==='react')return {useEffect(){},useSyncExternalStore:(_subscribe,snapshot)=>snapshot()};
    if(id.endsWith('/EditorModal'))return {__esModule:true,default:Modal};
    if(id.endsWith('/studioBus.js'))return bus;
    if(id.endsWith('/featureFlags.js'))return {HANDWRITING_FONT_CREATION_ENABLED:true};
    if(id.endsWith('/theme'))return {colors:{},radius:{md:12,lg:20}};
    if(id.endsWith('/useFillGrid'))return {__esModule:true,default:({ cell, gap }) => ({ onLayout() {}, columns: 1, cellWidth: cell, spreadGap: gap })};
    return {};
  });
  let confirmed=0;
  bus.openFontStudio({open:'font-1',manage:true}); // 버스는 실제 스위치를 따른다 — 꺼진 빌드에서도 열리는 관리 화면으로 연다
  const unregister=bus.setStudioCloseGuard(async()=>{confirmed++;return false});
  try {
    const rendered=Studio();assert.equal(rendered.type,Modal);
    const native=rendered.type(rendered.props);
    assert.equal(native.type,'native-modal');
    assert.equal(native.props.visible,true);
    assert.equal(native.props.presentationStyle,'fullScreen');
    assert.equal(native.props.animationType,'none');
    assert.deepEqual(native.props.supportedOrientations,['portrait','landscape']);
    assert.equal(native.props.onRequestClose,bus.closeFontStudio);
    await native.props.onRequestClose();
    assert.equal(confirmed,1);assert.ok(bus.studioSnapshot());
    unregister();await native.props.onRequestClose();
    assert.equal(bus.studioSnapshot(),null);
    assert.equal(Studio().props.visible,false);
  } finally {unregister();await bus.closeFontStudio();}
});

test('폰트 만들기를 끄면 새로 만들기 · 작성 중 열기는 버스에서 막고, 완성 폰트 관리만 연다', { skip: HANDWRITING_FONT_CREATION_ENABLED && '폰트 만들기 켜짐' }, async () => {
  const Modal=load('../src/editor/components/controls/EditorModal.js',id=>id==='react-native'?{Modal:'native-modal'}:{});
  const Studio=load('../src/handwriting/HandwritingStudio.js',id=>{
    if(id==='react-native')return {StyleSheet:{create:value=>value},Platform:{OS:"android"}};
    if(id==='react')return {useEffect(){},useSyncExternalStore:(_subscribe,snapshot)=>snapshot()};
    if(id.endsWith('/EditorModal'))return {__esModule:true,default:Modal};
    if(id.endsWith('/studioBus.js'))return bus;
    if(id.endsWith('/featureFlags.js'))return {HANDWRITING_FONT_CREATION_ENABLED:false};
    if(id.endsWith('/theme'))return {colors:{},radius:{md:12,lg:20}};
    if(id.endsWith('/useFillGrid'))return {__esModule:true,default:({ cell, gap }) => ({ onLayout() {}, columns: 1, cellWidth: cell, spreadGap: gap })};
    return {};
  });
  try {
    for (const options of [{create:true},{open:'draft-1'},{}]) {
      bus.openFontStudio(options);
      assert.equal(bus.studioSnapshot(),null); // 열린 것으로 남지 않는다(뒤로가기 가로채기 없음)
      assert.equal(Studio().props.visible,false);
    }
    bus.openFontStudio({open:'font-1',manage:true});
    assert.deepEqual(bus.studioSnapshot(),{open:'font-1',manage:true});
    assert.equal(Studio().props.visible,true);
  } finally { await bus.closeFontStudio(); }
});
