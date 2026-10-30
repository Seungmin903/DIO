import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as bus from '../src/handwriting/studioBus.js';
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
    if(id.endsWith('/theme'))return {colors:{}};
    return {};
  });
  let confirmed=0;
  bus.openFontStudio();
  const unregister=bus.setStudioCloseGuard(async()=>{confirmed++;return false});
  try {
    const rendered=Studio();assert.equal(rendered.type,Modal);
    const native=rendered.type(rendered.props);
    assert.equal(native.type,'native-modal');
    assert.equal(native.props.visible,true);
    assert.equal(native.props.presentationStyle,'fullScreen');
    assert.equal(native.props.animationType,'slide');
    assert.deepEqual(native.props.supportedOrientations,['portrait','landscape']);
    assert.equal(native.props.onRequestClose,bus.closeFontStudio);
    await native.props.onRequestClose();
    assert.equal(confirmed,1);assert.ok(bus.studioSnapshot());
    unregister();await native.props.onRequestClose();
    assert.equal(bus.studioSnapshot(),null);
    assert.equal(Studio().props.visible,false);
  } finally {unregister();await bus.closeFontStudio();}
});
