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
test('시작 화면은 네이티브 배경과 맞추고 이미지 로드 후 준비를 알린다',()=>{
 const config=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8'));
 const {default:BootSplash,SPLASH}=load('../src/shared/BootSplash.js',{
  react:{useEffect:()=>{},useRef:value=>({current:value}),useState:value=>[value,()=>{}]},
  'react-native':{View:'View',Image:'Image',Animated:{View:'AnimatedView',Value:class {interpolate(value){return value}}},StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:844})},
  'react-native-svg':{__esModule:true,default:'Svg',Path:'Path'},
  '../../app.json':config,
 });
 let ready=0;
 const tree=BootSplash({onReady:()=>ready++});
 assert.equal(tree.props.style.backgroundColor,SPLASH.backgroundColor);
 assert.equal(SPLASH.backgroundColor,'#F0ECFD');
 assert.equal(ready,0);
 tree.props.children[1].props.children.props.onLoadEnd();
 assert.equal(ready,1);
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

function splashRuntime(reduceMotion) {
 const slots=[], pending=[];
 let cursor=0, starts=0, stops=0, finish;
 const {default:Splash}=load('../src/shared/BootSplash.js',{
  react:{
   useRef(value){const index=cursor++;return slots[index]??= {current:value}},
   useState(value){const index=cursor++;slots[index]??= {value};return [slots[index].value,next=>{slots[index].value=next}]},
   useEffect(effect,deps){
    const index=cursor++,previous=slots[index];
    if(previous&&deps.every((value,i)=>Object.is(value,previous.deps[i])))return;
    previous?.cleanup?.();
    const slot={deps};slots[index]=slot;pending.push(()=>{slot.cleanup=effect()});
   },
  },
  'react-native':{
   View:'View',Image:'Image',StyleSheet:{create:value=>value,absoluteFill:{}},
   useWindowDimensions:()=>({width:390,height:844}),
   AccessibilityInfo:{isReduceMotionEnabled:reduceMotion},
   Easing:{bezier:()=>{},inOut:()=>{},ease:()=>{}},
   Animated:{View:'AnimatedView',Value:class{constructor(value){this.value=value} setValue(value){this.value=value} interpolate(value){return value}},
    timing:()=>({}),delay:()=>({}),sequence:()=>({start(callback){starts++;finish=callback},stop(){stops++}})},
  },
  'react-native-svg':{__esModule:true,default:'Svg',Path:'Path'},
  '../../app.json':JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8')),
 });
 return {
  render(onComplete){cursor=0;const tree=Splash({onComplete});this.opacity=tree.props.children[1].props.style[1].opacity;pending.splice(0).forEach(effect=>effect());return tree.props.children[1].props.children.props},
  finish(){finish?.({finished:true})},
  unmount(){slots.forEach(slot=>slot.cleanup?.())},
  get starts(){return starts},get stops(){return stops},
 };
}
const flushSplash=()=>new Promise(resolve=>setImmediate(resolve));

test('스플래시는 콜백 변경에도 애니메이션을 유지하고 최신 콜백을 한 번 호출한다',async()=>{
 const runtime=splashRuntime(async()=>false);let old=0,current=0;
 const first=()=>old++,latest=()=>current++;
 runtime.render(first).onLoadEnd();runtime.render(first);await flushSplash();
 assert.equal(runtime.opacity.value,1);
 runtime.render(latest);
 assert.equal(runtime.starts,1);assert.equal(runtime.stops,0);
 runtime.finish();runtime.finish();assert.equal(old,0);assert.equal(current,1);
 runtime.unmount();assert.equal(runtime.stops,1);
});

test('이미지 오류 후 loadEnd가 와도 빈 애니메이션과 중복 완료가 없다',async()=>{
 const runtime=splashRuntime(async()=>false);let completed=0;
 const done=()=>completed++,image=runtime.render(done);
 image.onError();image.onLoadEnd();runtime.render(done);await flushSplash();
 image.onError();assert.equal(completed,1);assert.equal(runtime.starts,0);runtime.unmount();
});

test('동작 줄이기와 접근성 조회 실패는 애니메이션 없이 완료한다',async()=>{
 for(const query of [async()=>true,async()=>{throw new Error('unavailable')}]){
  const runtime=splashRuntime(query);let completed=0;const done=()=>completed++;
  runtime.render(done).onLoadEnd();runtime.render(done);await flushSplash();
  assert.equal(runtime.opacity.value,0);
  assert.equal(completed,1);assert.equal(runtime.starts,0);runtime.unmount();
 }
});

test('언마운트 후 접근성 응답과 애니메이션 종료는 완료를 호출하지 않는다',async()=>{
 let resolve;const runtime=splashRuntime(()=>new Promise(done=>{resolve=done}));let completed=0;
 const done=()=>completed++;
 runtime.render(done).onLoadEnd();runtime.render(done);runtime.unmount();resolve(false);await flushSplash();
 assert.equal(runtime.opacity.value,0);
 assert.equal(runtime.starts,0);assert.equal(completed,0);
 const animated=splashRuntime(async()=>false);
 animated.render(done).onLoadEnd();animated.render(done);await flushSplash();animated.unmount();animated.finish();
 assert.equal(animated.stops,1);assert.equal(completed,0);
});

test('Android 아이콘은 표시 영역을 채우고 얼굴과 책갈피 중심은 안전 영역에 있다',async()=>{
 const Jimp=require('jimp-compact');
 const image=await Jimp.read(fileURLToPath(new URL('../assets/images/adaptive-icon.png',import.meta.url)));
 assert.equal(image.bitmap.width,1024);assert.equal(image.bitmap.height,1024);
 const radius=1024*66/108/2;
 const size=Math.round(1024*72/108),offset=Math.floor((1024-size)/2);
 // Original SVG coordinates for both eyes, the smile, and the bookmark center.
 for(const [x,y] of [[290,694],[649,776],[445,834],[1102,593]]){
  const px=Math.round(offset+x*size/1254),py=Math.round(offset+y*size/1254);
  assert.ok(Math.hypot(px-512,py-512)<radius);
  assert.equal(Jimp.intToRGBA(image.getPixelColor(px,py)).a,255);
 }
 assert.ok(Jimp.intToRGBA(image.getPixelColor(offset+size/2,offset+size-1)).a>0);
});

test('설치 아이콘은 정사각형 전체가 불투명하고 모서리까지 원본 색으로 채워진다',async()=>{
 const Jimp=require('jimp-compact');
 const icon=await Jimp.read(fileURLToPath(new URL('../assets/images/icon.png',import.meta.url)));
 assert.equal(icon.bitmap.width,1024);assert.equal(icon.bitmap.height,1024);
 icon.scan(0,0,1024,1024,function(x,y,index){assert.equal(this.bitmap.data[index+3],255)});
 assert.equal(icon.getPixelColor(0,0),0xf0ecfdff);
 assert.equal(icon.getPixelColor(0,1023),0xf0ecfdff);
 const source=await Jimp.read(fileURLToPath(new URL('../assets/brand/launcher/app-icon-square-combined.png',import.meta.url)));
 source.resize(1024,1024,Jimp.RESIZE_HERMITE);
 assert.deepEqual(icon.bitmap.data,source.bitmap.data);
 const adaptive=await Jimp.read(fileURLToPath(new URL('../assets/images/adaptive-icon.png',import.meta.url)));
 assert.equal(Jimp.intToRGBA(adaptive.getPixelColor(171,171)).a,0);
 const config=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8'));
 assert.equal(config.expo.android.adaptiveIcon.backgroundColor,'#F0ECFD');
});
