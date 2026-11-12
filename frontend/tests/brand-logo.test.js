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
const bootModules=()=>({
 './bootIntro':load('../src/shared/bootIntro.js',{}),
 './bootLogoPaths':load('../src/shared/bootLogoPaths.js',{}),
});
const svgMock={__esModule:true,default:'Svg',Path:'Path',ClipPath:'ClipPath',Defs:'Defs'};

test('시작 화면은 네이티브 배경과 맞추고 이미지 로드 후 준비를 알린다',()=>{
 const config=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8'));
 const {default:BootSplash,SPLASH}=load('../src/shared/BootSplash.js',{
  react:{forwardRef:fn=>fn,useEffect:()=>{},useMemo:fn=>fn(),useRef:value=>({current:value}),useState:value=>[value,()=>{}]},
  'react-native':{View:'View',Text:'Text',Image:'Image',Animated:{View:'AnimatedView',Value:class {interpolate(value){return value} addListener(){return 1} removeListener(){}},createAnimatedComponent:c=>c},StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:844})},
  'react-native-svg':svgMock,
  '../../app.json':config,
  ...bootModules(),
 });
 let ready=0;
 const tree=BootSplash({onReady:()=>ready++});
 assert.equal(tree.props.style.backgroundColor,SPLASH.backgroundColor);
 assert.equal(SPLASH.backgroundColor,'#F0ECFD');
 assert.equal(ready,0);
 tree.props.children[1].props.children.props.onLoadEnd();
 assert.equal(ready,1);
 // 인트로 중 터치는 뒤 보관함으로 새지 않는다
 assert.equal(tree.props.pointerEvents,'auto');
 assert.equal(tree.props.onStartShouldSetResponder(),true);
 // 넘기기 안내 글자는 두지 않는다(누르면 넘어가는 기능만)
 assert.equal(tree.props.children.some(child=>child?.type==='Text'),false);
 assert.equal(tree.props.onAccessibilityTap,tree.props.onResponderRelease);
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
 const slots=[], pending=[], finishers=[];
 let cursor=0, starts=0, stops=0;
 const {default:Splash}=load('../src/shared/BootSplash.js',{
  react:{
   useRef(value){const index=cursor++;return slots[index]??= {current:value}},
   useState(value){const index=cursor++;slots[index]??= {value};return [slots[index].value,next=>{slots[index].value=next}]},
   forwardRef:fn=>fn,useMemo:fn=>fn(),
   useEffect(effect,deps){
    const index=cursor++,previous=slots[index];
    if(previous&&deps.every((value,i)=>Object.is(value,previous.deps[i])))return;
    previous?.cleanup?.();
    const slot={deps};slots[index]=slot;pending.push(()=>{slot.cleanup=effect()});
   },
  },
  'react-native':{
   View:'View',Text:'Text',Image:'Image',StyleSheet:{create:value=>value,absoluteFill:{}},
   useWindowDimensions:()=>({width:390,height:844}),
   AccessibilityInfo:{isReduceMotionEnabled:reduceMotion},
   Easing:{linear:()=>{}},
   Animated:{View:'AnimatedView',Value:class{constructor(value){this.value=value} setValue(value){this.value=value} interpolate(value){return value} addListener(){return 1} removeListener(){}},
    // timing 두 개: [0] 펜 선(손글씨, 먼저 끝남) · [1] 모아 · 효과선(끝까지)
    createAnimatedComponent:c=>c,timing:(_value,config)=>({start(callback){starts++;finishers.push({callback,config})},stop(){stops++}})},
  },
  'react-native-svg':svgMock,
  '../../app.json':JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8')),
  ...bootModules(),
 });
 return {
  render(onComplete,onWritten){cursor=0;const tree=Splash({onComplete,onWritten});this.tree=tree;this.opacity=tree.props.children[1].props.style[1].opacity;pending.splice(0).forEach(effect=>effect());return tree.props.children[1].props.children.props},
  write(){finishers.find(f=>!f.config.useNativeDriver)?.callback({finished:true})},
  finish(){finishers.find(f=>f.config.useNativeDriver)?.callback({finished:true})},
  get durations(){return finishers.map(f=>[f.config.useNativeDriver,f.config.duration])},
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
 assert.equal(runtime.starts,2);assert.equal(runtime.stops,0);
 runtime.finish();runtime.finish();assert.equal(old,0);assert.equal(current,1);
 runtime.unmount();assert.equal(runtime.stops,2);
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
 let written=0;const wrote=()=>written++;
 animated.render(done,wrote).onLoadEnd();animated.render(done,wrote);await flushSplash();animated.unmount();animated.write();animated.finish();
 assert.equal(animated.stops,2);assert.equal(completed,0);assert.equal(written,0);
});

test('화면을 누르면 인트로를 멈추고 앱으로 넘어간다(한 번만)',async()=>{
 const runtime=splashRuntime(async()=>false);let completed=0;
 const done=()=>completed++;
 runtime.render(done).onLoadEnd();const tree=runtime.render(done);await flushSplash();
 runtime.tree.props.onResponderRelease();
 assert.equal(completed,1);assert.equal(runtime.stops,2,'모아 · 손글씨 애니메이션을 모두 멈춘다');
 runtime.tree.props.onResponderRelease();runtime.finish();assert.equal(completed,1);
 runtime.unmount();
});

test('이미지가 준비되기 전에 눌러도 바로 넘어간다',()=>{
 const runtime=splashRuntime(async()=>false);let completed=0;
 runtime.render(()=>completed++);
 runtime.tree.props.onResponderRelease();
 assert.equal(completed,1);assert.equal(runtime.starts,0);runtime.unmount();
});

test('손글씨가 끝나면 시작 화면이 닫히기 전에 한 번 알린다(뒤 작업을 손글씨 뒤로 미루는 신호)',async()=>{
 const runtime=splashRuntime(async()=>false);let completed=0,written=0;
 const done=()=>completed++,wrote=()=>written++;
 runtime.render(done,wrote).onLoadEnd();runtime.render(done,wrote);await flushSplash();
 const [pen,intro]=runtime.durations;
 assert.equal(pen[0],false);assert.equal(intro[0],true);assert.ok(pen[1]<intro[1],'손글씨는 인트로보다 먼저 끝난다');
 runtime.write();assert.equal(written,1);assert.equal(completed,0);
 runtime.finish();assert.equal(completed,1);runtime.unmount();
});

test('뒤 작업 문은 시간 · 손글씨 끝 둘 다 와야 한 번만 연다',()=>{
 const {createAfterIntroGate}=load('../src/shared/bootIntro.js',{});
 for(const order of [['due','introDone'],['introDone','due']]){
  let started=0;const gate=createAfterIntroGate(()=>started++);
  gate[order[0]]();assert.equal(started,0);
  gate[order[1]]();assert.equal(started,1);
  gate.due();gate.introDone();assert.equal(started,1);
 }
});

test('인트로 순서: 빼꼼 예고 → 뾱 선 → 올라옴 → 갸우뚱 → DIO 글자 하나씩',()=>{
 const {BOOT_INTRO_TOTAL,moaAt,popLineAt,letterAt,LETTER_SLOTS,sample}=load('../src/shared/bootIntro.js',{});
 // 처음엔 모아가 화면 밖(왼쪽 아래)에 있고 끝에는 지금 자리에서 8° 기운다
 const first=moaAt(0),last=moaAt(BOOT_INTRO_TOTAL);
 assert.ok(first.x<=-0.86&&first.y>=0.65);
 assert.deepEqual([last.x,last.y,last.k],[0,0,1]);assert.equal(Math.round(last.r),8);
 // 빼꼼은 화면 안 모서리에 멈춰 있다(예고), 뾱 선은 빼꼼 뒤 한 번만 보인다
 const peek=moaAt(610);assert.ok(Math.abs(peek.x+0.30)<1e-9&&Math.abs(peek.y-0.18)<1e-9);
 const visible=[];for(let t=0;t<=BOOT_INTRO_TOTAL;t+=10)if(popLineAt(t).visible)visible.push(t);
 assert.ok(visible[0]>=360&&visible.at(-1)<=620);
 assert.ok(visible.every((t,i)=>i===0||t-visible[i-1]===10),'선은 한 번만 튄다');
 // 글자는 D → I → O 순서로, 칸이 겹치지 않고 갸우뚱이 끝난 뒤 시작한다
 assert.ok(LETTER_SLOTS[0][0]>=2130);
 for(let i=1;i<3;i++)assert.ok(LETTER_SLOTS[i][0]>LETTER_SLOTS[i-1][1]);
 assert.deepEqual([0,1,2].map(i=>letterAt(LETTER_SLOTS[i][0],i)+0),[0,0,0]);
 assert.deepEqual([0,1,2].map(i=>letterAt(BOOT_INTRO_TOTAL,i)),[1,1,1]);
 assert.ok(BOOT_INTRO_TOTAL-LETTER_SLOTS[2][1]>=400,'다 쓴 뒤 잠깐 멈춘다');
 // 표본은 처음 · 끝을 포함하고 입력이 늘어난다(Animated.interpolate 조건)
 const {inputRange,outputRange}=sample(t=>t,0,95,20);
 assert.deepEqual(inputRange,[0,20,40,60,80,95]);assert.equal(outputRange.at(-1),95);
});

test('DIO 손글씨 데이터는 Pretendard ExtraBold 세 글자와 획별 펜 선을 갖는다',()=>{
 const {BOOT_LOGO_LETTERS,BOOT_LOGO_ADVANCE}=load('../src/shared/bootLogoPaths.js',{});
 assert.deepEqual(BOOT_LOGO_LETTERS.map(l=>l.letter),['D','I','O']);
 assert.equal(BOOT_LOGO_ADVANCE,3566);
 // D 는 세로획 · 둥근 배 두 획, I · O 는 한 획
 assert.deepEqual(BOOT_LOGO_LETTERS.map(l=>l.strokes.length),[2,1,1]);
 for(const l of BOOT_LOGO_LETTERS){assert.match(l.glyph,/^M[\d.-]/);
  // 한 획 = 경로 조각 하나(M 하나). 점선은 조각마다 다시 시작해 두 획이 동시에 그려지기 때문
  for(const stroke of l.strokes){assert.ok(stroke.length>1000);assert.equal(stroke.pen.match(/M/g).length,1);}}
});

test('D 는 세로획을 다 쓴 뒤 둥근 배를 쓴다',()=>{
 const {strokeSpans,strokeAt}=load('../src/shared/bootIntro.js',{});
 const spans=strokeSpans([{length:1448},{length:2507.9}]);
 assert.equal(spans[0][0],0);assert.equal(spans[1][1],1);assert.equal(spans[0][1],spans[1][0]);
 const mid=spans[0][1]/2;
 assert.ok(strokeAt(mid,spans[0])>0&&strokeAt(mid,spans[1])===0,'세로획 쓰는 중엔 배가 안 나온다');
 assert.equal(strokeAt(spans[0][1],spans[0]),1);
 assert.ok(strokeAt((spans[1][0]+1)/2,spans[1])>0);
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
