import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pageSize } from '../src/editor/utils/pageGeometry.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
function load(file,mocks){
 const code=babel.transformSync(readFileSync(new URL(file,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
 const module={exports:{}}
 new Function('require','module','exports',code)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),module,module.exports)
 return module.exports
}
function fixture({readOnly=false,canDrag=true}={}){
 const selected=[],moved=[],cleanups=[],stateUpdates=[]
 let mountingRow=false
 const frames=new Map()
 let frame={slots:[],cursor:0}
 function renderFrame(key,render){const previous=frame;frame=frames.get(key)??{slots:[],cursor:0};frames.set(key,frame);frame.cursor=0;try{return render()}finally{frame=previous}}
 const react={memo:fn=>fn,useRef:current=>{const slot=frame.cursor++;return frame.slots[slot]??=( {current} )},useState:value=>{
  const owner=frame,slot=owner.cursor++
  if(!(slot in owner.slots))owner.slots[slot]=typeof value==='function'?value():value
  return [owner.slots[slot],value=>{stateUpdates.push(value);owner.slots[slot]=typeof value==='function'?value(owner.slots[slot]):value}]
 },useMemo:fn=>fn(),useEffect:fn=>{if(mountingRow){const cleanup=fn?.();if(cleanup)cleanups.push(cleanup)}},useLayoutEffect:()=>{},useContext:()=>null}
 // PageList effects require real layout; keep them dormant in this native responder contract test.
 const native={Platform:{OS:'android'},PanResponder:{create:panHandlers=>({panHandlers})},AppState:null,FlatList:'list',View:'view',Text:'text',Pressable:'press',StyleSheet:{create:value=>value},useWindowDimensions:()=>({width:800,height:600})}
 const pan=load('../src/editor/hooks/usePan.js',{react:{...react,useEffect:()=>{}},'react-native':native,'./usePalmRejection':{PalmRejectionContext:{},usePalmRejectingPan:()=>({})},'../utils/penPointerInput.js':{createPenPointerInput:()=>({active:false,cancel(){}})},'../utils/stylus':{setPenPointerActive(){}}})
 const list=load('../src/editor/components/panels/PageList.js',{'react':react,'react-native':native,'../../../shared/theme':{bubble:{},colors:{},radius:{}},'../../utils/pageGeometry.js':{pageSize},'../../utils/common':{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))},'../../hooks/usePan':pan}).default
 const pages=Array.from({length:5},(_,i)=>({id:`p${i}`,canvasWidth:768,canvasHeight:1024,objects:[]}))
 const props={pages,currentId:'p0',readOnly,onSelect:id=>selected.push(id),onMove:(id,to)=>moved.push([id,to]),onEmptyTap(){}}
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]
 const renderList=()=>nodes(renderFrame('list',()=>list(props))).find(n=>n.type==='list')
 const flat=renderList()
 const rows=pages.map((item,index)=>{const element=flat.props.renderItem({item,index});mountingRow=true;const row=renderFrame(item.id,()=>element.type({...element.props,canDrag}));mountingRow=false;row.props.onLayout({nativeEvent:{layout:{height:180,y:0}}});return row})
 const thumb=nodes(rows[1]).find(n=>n.props?.accessibilityLabel==='2페이지')
 return {handlers:thumb.props,selected,moved,pan,stateUpdates,listProps:()=>renderList().props,cleanup:()=>cleanups.forEach(fn=>fn())}
}
const touch=count=>({nativeEvent:{touches:Array.from({length:count},()=>({}))}})

test('썸네일에서 바로 밀면 스크롤에 양보하고 선택·순서 변경·뒤늦은 길게 누르기가 없다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 const f=fixture(),h=f.handlers
 h.onPanResponderGrant(touch(1))
 assert.equal(h.onShouldBlockNativeResponder(),false)
 assert.equal(h.onPanResponderTerminationRequest(touch(1)),true)
 h.onPanResponderMove(touch(1),{dx:0,dy:40})
 h.onPanResponderTerminate()
 t.mock.timers.tick(500)
 assert.equal(h.onShouldBlockNativeResponder(),false)
 assert.deepEqual(f.selected,[]);assert.deepEqual(f.moved,[])
})

test('짧은 탭은 페이지를 한 번 선택한다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 const f=fixture();f.handlers.onPanResponderGrant(touch(1));t.mock.timers.tick(100);f.handlers.onPanResponderRelease()
 t.mock.timers.tick(500)
 assert.deepEqual(f.selected,['p1']);assert.deepEqual(f.moved,[])
})

test('초기 스와이프 뒤 손을 멈춰도 길게 누른 순서 변경으로 바뀌지 않는다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 const f=fixture(),h=f.handlers
 h.onPanResponderGrant(touch(1));h.onPanResponderMove(touch(1),{dx:0,dy:40});t.mock.timers.tick(500)
 assert.equal(h.onShouldBlockNativeResponder(),false)
 h.onPanResponderRelease();assert.deepEqual(f.selected,[]);assert.deepEqual(f.moved,[]);assert.deepEqual(f.stateUpdates,[])
})

test('썸네일이 사라지면 대기 중인 길게 누르기를 정리한다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 const f=fixture();f.handlers.onPanResponderGrant(touch(1));f.cleanup();t.mock.timers.tick(500)
 assert.deepEqual(f.stateUpdates,[]);assert.deepEqual(f.selected,[]);assert.deepEqual(f.moved,[])
})

test('길게 누른 뒤 드래그하면 한 손가락 스크롤로 넘어가지 않고 순서를 바꾼다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 const f=fixture(),h=f.handlers
 h.onPanResponderGrant(touch(1));t.mock.timers.tick(281)
 assert.equal(h.onShouldBlockNativeResponder(),true)
 assert.equal(h.onPanResponderTerminationRequest(touch(1)),false)
 assert.equal(h.onPanResponderTerminationRequest(touch(2)),true)
 h.onPanResponderMove(touch(1),{dx:0,dy:200});h.onPanResponderRelease()
 assert.deepEqual(f.selected,[]);assert.deepEqual(f.moved,[['p1',2]])
})

test('길게 누른 뒤 시스템이 취소하면 순서를 바꾸지 않는다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 const f=fixture(),h=f.handlers
 h.onPanResponderGrant(touch(1));t.mock.timers.tick(281);h.onPanResponderMove(touch(1),{dx:0,dy:200});h.onPanResponderTerminate()
 assert.deepEqual(f.selected,[]);assert.deepEqual(f.moved,[])
})

test('grant 값이 false로 고정돼도 PageList가 scrollEnabled로 잠그고 종료·취소 시 해제한다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 for(const cancelled of [false,true]){
  const f=fixture(),h=f.handlers
  assert.equal(f.listProps().scrollEnabled,true)
  h.onPanResponderGrant(touch(1))
  const nativeBlockAtGrant=h.onShouldBlockNativeResponder()
  assert.equal(nativeBlockAtGrant,false)
  assert.equal(f.listProps().scrollEnabled,true)
  t.mock.timers.tick(281)
  // grant 뒤 차단 콜백을 다시 부르지 않는다. 실제 PageList의 상태 변경과 렌더된 prop을 검사한다.
  assert.equal(nativeBlockAtGrant,false)
  assert.equal(f.listProps().scrollEnabled,false)
  h.onPanResponderMove(touch(1),{dx:0,dy:200})
  if(cancelled)h.onPanResponderTerminate();else h.onPanResponderRelease()
  assert.equal(f.listProps().scrollEnabled,true)
  assert.deepEqual(f.moved,cancelled?[]:[['p1',2]])
 }
})

test('읽기 전용·순서 변경 불가 목록은 길게 눌러도 스크롤을 막지 않는다',t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']})
 for(const options of [{readOnly:true},{canDrag:false}]){
  const f=fixture(options),h=f.handlers
  h.onPanResponderGrant(touch(1));t.mock.timers.tick(500)
  assert.equal(h.onShouldBlockNativeResponder(),false);assert.equal(h.onPanResponderTerminationRequest(touch(1)),true)
  h.onPanResponderTerminate();assert.deepEqual(f.moved,[])
 }
})

test('기존 캔버스 usePan은 네이티브 스크롤 차단 정책을 유지한다',()=>{
 const f=fixture(),h=f.pan.usePan({onStart(){},onEnd(){}})
 assert.equal(h.onShouldBlockNativeResponder(),true)
 assert.equal(h.onPanResponderTerminationRequest(touch(1)),false)
 assert.equal(h.onPanResponderTerminationRequest(touch(2)),true)
})
