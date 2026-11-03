import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const source=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/controls/EyedropperOverlay.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
const nodes=n=>n&&typeof n==='object'?[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]:[]
const tick=()=>new Promise(r=>setImmediate(r))
function fixture(capture){
 const states=[],refs=[],effects=[],events={},picked=[];let si=0,ri=0,mounted=false,cancelled=0
 const module={exports:{}}
 const react={useRef:v=>refs[ri++]??(refs[ri-1]={current:v}),useState:v=>{const i=si++;if(!(i in states))states[i]=v;return [states[i],v=>states[i]=v]},useEffect:fn=>{if(!mounted)effects.push(fn)}}
 const listener=(name,fn)=>{events[name]=fn;return {remove(){delete events[name]}}}
 new Function('require','module','exports','requestAnimationFrame',source)(id=>{
  if(id==='react')return react
  if(id==='react/jsx-runtime')return require(id)
  if(id==='react-native')return {View:'view',Image:'image',Pressable:'button',StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({width:390,height:844}),AppState:{addEventListener:(_e,fn)=>listener('app',fn)},Dimensions:{addEventListener:(_e,fn)=>listener('size',fn)}}
  if(id.endsWith('/theme'))return {colors:{},shadow:{}}
  if(id.endsWith('/eyedropper'))return {captureScreenSampler:capture}
  return {__esModule:true,default:id}
 },module,module.exports,fn=>fn())
 const render=()=>{si=ri=0;return module.exports.default({original:'#123456',onPick:c=>picked.push(c),onCancel:()=>cancelled++})}
 return {render,mount(){const t=render();mounted=true;const clean=effects.map(fn=>fn());return {tree:t,unmount:()=>clean.forEach(fn=>fn?.())}},events,picked,get cancelled(){return cancelled}}
}
test('공용 화면 스포이드는 UI를 숨겨 캡처하고 놓은 지점의 최신 색을 선택한다',async()=>{
 let released=0
 const f=fixture(async()=>({uri:'full-screen.png',colorAt:(x,y)=>x>300&&y<100?'#ABCDEF':'#000000',release:()=>released++}))
 const {tree,unmount}=f.mount()
 assert.equal(nodes(tree).filter(n=>n.props?.accessibilityLabel==='스포이드 취소').length,0,'capture must not include picker chrome')
 await tick()
 const ready=nodes(f.render()).find(n=>n.props?.testID==='screen-eyedropper-ready')
 assert.ok(ready)
 ready.props.onResponderRelease({nativeEvent:{pageX:350,pageY:30}})
 assert.deepEqual(f.picked,['#ABCDEF'],'screen area outside diary canvas is allowed without a prior drag')
 f.events.app('background');assert.equal(f.cancelled,1)
 unmount();assert.equal(released,1);assert.deepEqual(f.events,{})
})
test('준비 중 취소 후 늦게 도착한 전체 화면 캡처는 즉시 해제한다',async()=>{
 let resolve,released=0
 const f=fixture(()=>new Promise(r=>resolve=r)),{unmount}=f.mount()
 await tick();unmount();resolve({uri:'late.png',release:()=>released++});await tick()
 assert.equal(released,1);assert.deepEqual(f.picked,[])
})
