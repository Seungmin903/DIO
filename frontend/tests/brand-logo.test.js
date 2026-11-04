import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
function load(file,mocks,dev=false){
 const code=expo('@babel/core').transformSync(readFileSync(new URL(file,import.meta.url),'utf8'),{configFile:false,babelrc:false,
 plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};
 new Function('require','module','exports','__DEV__',code)(id=>id==='react/jsx-runtime'?require(id):id.endsWith('.png')?id:mocks[id],mod,mod.exports,dev);
 return mod.exports;
}
test('로고는 지정 크기와 새 크기에 준비된 이미지를 선택하며 로드 콜백을 전달한다',()=>{
 const {default:Logo}=load('../src/shared/BrandLogo.js',{'react-native':{Image:'Image'}});
 for(const [size,expected] of [[24,24],[28,28],[30,30],[32,32],[52,52],[160,160],[40,52],[80,160],[200,160]]){
  const ready=()=>{};const tree=Logo({size,onLoadEnd:ready});
  assert.ok(tree.props.source.endsWith(`mascot-${expected}.png`));
  assert.deepEqual(tree.props.style,{width:size,height:size});assert.equal(tree.props.onLoadEnd,ready);
 }
});
test('시작 로고 크기는 네이티브 설정과 같고 onReady를 이미지 로드 완료로 전달한다',()=>{
 const config=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8'));
 const module=load('../src/shared/BootSplash.js',{'react-native':{View:'View',StyleSheet:{create:v=>v,absoluteFill:{}}},'../../app.json':config,'./BrandLogo':{__esModule:true,default:'Logo'}});
 const ready=()=>{};const tree=module.default({onReady:ready});
 assert.equal(module.LOGO_HEIGHT,config.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-splash-screen')[1].imageWidth);
 assert.equal(tree.props.children.props.size,module.LOGO_HEIGHT);
 assert.equal(tree.props.children.props.onLoadEnd,ready);
});

test('지원 밖 크기는 개발 모드에서 한 번 안내하고 준비 이미지를 사용한다',()=>{
 const messages=[],original=console.warn;
 console.warn=message=>messages.push(message);
 try {
  const {default:Logo}=load('../src/shared/BrandLogo.js',{'react-native':{Image:'Image'}},true);
  Logo({size:52});Logo({size:200});Logo({size:200});
  assert.equal(messages.length,1);assert.match(messages[0],/200/);assert.match(messages[0],/brand:icons/);
 } finally {console.warn=original;}
});

test('Android 아이콘의 모든 전경 픽셀은 중앙 원형 안전 영역 안에 있다',async()=>{
 const Jimp=require('jimp-compact');
 const image=await Jimp.read(fileURLToPath(new URL('../assets/images/adaptive-icon.png',import.meta.url)));
 assert.equal(image.bitmap.width,1024);assert.equal(image.bitmap.height,1024);
 const radius=1024*66/108/2;
 let visible=0;
 image.scan(0,0,1024,1024,function(x,y,index){
  if(this.bitmap.data[index+3]){visible++;assert.ok(Math.hypot(x+0.5-512,y+0.5-512)<=radius,`outside safe zone: ${x},${y}`);}
 });
 assert.ok(visible>0);
});
