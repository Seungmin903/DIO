import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { groupResizeBounds, groupResizeStart, groupResizePatches } from '../src/editor/utils/groupResize.js'
import { unionBounds } from '../src/editor/utils/common.js'
import * as common from '../src/editor/utils/common.js'
import { createLassoOutline, resolveLassoOutline } from '../src/editor/utils/lassoOutline.js'
import { editorReducer, createInitialState } from '../src/editor/state/editorReducer.js'
import { collaborationReducer } from '../src/collaboration/collaborationReducer.js'
import { encodeElement, decodeElement } from '../src/collaboration/canvasElements.js'

const objects = [
  { id:'10000000-0000-4000-8000-000000000001', type:'sticker', x:10, y:20, w:60, h:40, rotation:30, groupId:'a' },
  { id:'10000000-0000-4000-8000-000000000002', type:'shape', art:'memo', x:100, y:80, w:80, h:60, rotation:0, groupId:'a' },
]
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`)

test('회전된 요소를 포함해 반대 모서리를 고정하며 크기와 간격을 같은 배율로 조절한다', () => {
  for (const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const start=groupResizeStart(objects,sx,sy)
    const patches=groupResizePatches(start,sx*start.width,sy*start.height)
    const scaled=objects.map(o=>({...o,...patches[o.id]}))
    for (let i=0;i<objects.length;i++) {
      near(scaled[i].w,objects[i].w*2); near(scaled[i].h,objects[i].h*2)
      assert.equal(scaled[i].rotation,objects[i].rotation)
      near(scaled[i].x+scaled[i].w/2,start.anchor.x+(objects[i].x+objects[i].w/2-start.anchor.x)*2)
      near(scaled[i].y+scaled[i].h/2,start.anchor.y+(objects[i].y+objects[i].h/2-start.anchor.y)*2)
    }
    const box=unionBounds(scaled)
    near(sx>0?box.left:box.right,start.anchor.x); near(sy>0?box.top:box.bottom,start.anchor.y)
  }
})

test('잠긴 요소 또는 유효하지 않은 크기가 포함되면 조절하지 않는다', () => {
  assert.equal(groupResizeStart([objects[0],{...objects[1],locked:true}],1,1),null)
  assert.equal(groupResizeStart([objects[0],{...objects[1],w:0}],1,1),null)
  assert.equal(groupResizeStart([objects[0]],1,1),null)
})

test('회전 값이 없는 기존 요소는 0도로 해석해 정상 확대한다', () => {
  const legacy={...objects[0]}; delete legacy.rotation
  const pair=[legacy,objects[1]], start=groupResizeStart(pair,1,1)
  assert.ok(start); const patch=groupResizePatches(start,30,30)[legacy.id]
  assert.equal(patch.rotation,0); assert.ok(patch.w>legacy.w)
  assert.ok(Object.values(groupResizeBounds(pair)).every(Number.isFinite))
})

test('축소 한계, 텍스트 기준 너비, 테이프 조각 및 필기 원본 좌표를 보존한다', () => {
  const extra=[...objects,{id:'text',type:'text',x:5,y:8,w:100,h:40,rotation:0},
    {id:'tape',type:'tape',x:5,y:8,w:100,h:10,rotation:0,segmentW:20,unitH:10},
    {id:'stroke',type:'stroke',x:5,y:8,w:30,h:40,rotation:0,baseWidth:30,baseHeight:40,points:[{x:2,y:3}]}]
  const start=groupResizeStart(extra,1,1)
  const grow=groupResizePatches(start,start.width,start.height)
  assert.equal(grow.text.baseWidth,100); assert.equal(grow.tape.segmentW,40); assert.equal(grow.tape.unitH,20)
  assert.equal(grow.stroke.points,undefined); assert.equal(grow.stroke.baseWidth,undefined)
  const shrink=groupResizePatches(start,-start.width*4,-start.height*4)
  assert.ok(Object.values(shrink).every(p=>p.w>0 && p.h>0))
  assert.equal(groupResizePatches(start,0,0),null)
})

test('극단적인 확대와 반복 축소에서도 서버의 좌표·크기 범위를 지킨다', () => {
  let current=objects
  const start=groupResizeStart(current,1,1), huge=groupResizePatches(start,1e15,1e15)
  for (const patch of Object.values(huge)) for (const key of ['x','y','w','h']) assert.ok(Math.abs(patch[key])<=999999999.001)
  for(let i=0;i<60;i++) {
    const next=groupResizeStart(current,1,1), patches=groupResizePatches(next,-next.width*5,-next.height*5)
    if (!patches) break
    current=current.map(o=>({...o,...patches[o.id]}))
  }
  assert.ok(current.every(o=>o.w>=0.001-1e-10&&o.h>=0.001-1e-10))
})

test('올가미로 선택한 요소를 크기 조절하면 이전 선택 윤곽은 사라진다', () => {
  const ids=objects.map(o=>o.id), polygon=[{x:-100,y:-100},{x:300,y:-100},{x:300,y:300},{x:-100,y:300}]
  const outline=createLassoOutline(null,'page',[],ids,objects,polygon,'replace')
  assert.ok(outline); assert.ok(resolveLassoOutline(outline,'page',ids,objects))
  const start=groupResizeStart(objects,1,1), patches=groupResizePatches(start,30,30)
  assert.equal(resolveLassoOutline(outline,'page',ids,objects.map(o=>({...o,...patches[o.id]}))),null)
})

test('이전 손잡이의 취소가 새 제스처의 체크포인트를 건드리지 않는다', () => {
  for (const shared of [false,true]) {
    let s=createInitialState({pages:[{id:'page',objects}]})
    const reduce=(state,action)=>shared?collaborationReducer(editorReducer,state,{collaborationId:action.checkpointOwner??'other',...action}):editorReducer(state,action)
    s=reduce(s,{type:'checkpoint',checkpointOwner:'old'})
    s=reduce(s,{type:'updateMany',patches:groupResizePatches(groupResizeStart(objects,1,1),10,10)})
    s=reduce(s,{type:'checkpoint',checkpointOwner:'new'})
    const before=s
    s=reduce(s,{type:'revertToCheckpoint',checkpointOwner:'old'})
    assert.equal(s,before)
  }
})

test('다중 크기 변경은 한 번에 되돌리고 공유 편집 큐에 하나의 작업으로 기록한다', () => {
  let s=createInitialState({pages:[{id:'page',objects}]})
  const apply = action => { s=collaborationReducer(editorReducer,s,{collaborationId:'30000000-0000-4000-8000-000000000001',...action}) }
  const start=groupResizeStart(objects,1,1)
  apply({type:'checkpoint'}); apply({type:'updateMany',patches:groupResizePatches(start,30,30)}); apply({type:'commitCheckpoint'})
  assert.equal(s.collaborationEdits.length,1)
  let local=createInitialState({pages:[{id:'page',objects}]})
  for (const action of [{type:'checkpoint'},{type:'updateMany',patches:groupResizePatches(start,30,30)},{type:'commitCheckpoint'},{type:'undo'}]) local=editorReducer(local,action)
  assert.deepEqual(local.doc.pages[0].objects,objects)
  local=editorReducer(local,{type:'redo'})
  assert.deepEqual(local.doc.pages[0].objects,s.doc.pages[0].objects)
})

test('크기를 바꾼 그룹 요소가 공유 캔버스 직렬화와 재조회에서 크기와 그룹을 유지한다', () => {
  const start=groupResizeStart(objects,1,1), patches=groupResizePatches(start,25,35)
  for (const object of objects) {
    const expected={...object,...patches[object.id]}
    const restored=decodeElement({...encodeElement(expected),version:1})
    for (const key of ['x','y','w','h']) assert.ok(Math.abs(restored[key]-expected[key])<0.001)
    assert.equal(restored.rotation,expected.rotation)
    assert.equal(restored.groupId,expected.groupId)
  }
})

test('실제 손잡이 이벤트는 배율을 반영하고 취소하면 원상복구한다', () => {
  const require=createRequire(import.meta.url), expo=createRequire(require.resolve('expo/package.json'))
  const source=readFileSync(new URL('../src/editor/components/canvas/Canvas.js',import.meta.url),'utf8')
  const {code}=expo('@babel/core').transformSync(source+'\nexport { GroupFrame, GroupResizeHandle }',{
    configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  let handlers, cleanup, s=createInitialState({pages:[{id:'page',objects}]})
  const actions=[], dispatch=action=>{actions.push(action.type);s=editorReducer(s,action)}
  const mod={exports:{}}
  const load=id=>{
    if(id==='react')return {forwardRef:f=>f,memo:f=>f,useRef:v=>({current:v}),useState:v=>[v,()=>{}],useEffect:(f,deps)=>{assert.deepEqual(deps,[]);cleanup=f()},useLayoutEffect(){},useMemo:f=>f(),useImperativeHandle(){}}
    if(id==='react-native')return {View:'view',Text:'text',Platform:{OS:'ios',select:options=>options.ios??options.default},StyleSheet:{create:v=>v}}
    if(id.endsWith('/usePan'))return {usePan:h=>{handlers=h;return {}}}
    if(id.endsWith('/groupResize.js'))return {groupResizeBounds,groupResizeStart,groupResizePatches}
    if(id.endsWith('/common'))return common
    if(id.endsWith('/theme'))return {colors:{},radius:{},DISABLED_OPACITY:0.5}
    if(id.startsWith('.'))return {__esModule:true,default:()=>null}
    return require(id)
  }
  new Function('require','module','exports',code)(load,mod,mod.exports)
  const frame=mod.exports.GroupFrame({objects,zoom:2,enabled:true,dispatch,onInteracting(){}})
  assert.equal(frame.props.pointerEvents,'box-none')
  assert.equal(frame.props.children[1].length,4)
  const small=mod.exports.GroupFrame({objects,zoom:0.1,enabled:true,pageWidth:200,pageHeight:200,dispatch,onInteracting(){}})
  assert.equal(small.props.children[1].length,1)
  const target=small.props.children[1][0].props
  assert.equal(target.sx,-1); assert.equal(target.sy,-1)
  assert.ok(target.targetPosition.left>=0 && target.targetPosition.top>=0)
  assert.equal(mod.exports.GroupFrame({objects:[objects[0],{...objects[1],locked:true}],zoom:2,enabled:true}).props.pointerEvents,'none')
  const handle=mod.exports.GroupResizeHandle({objects,zoom:2,sx:1,sy:1,dispatch,onInteracting(){}})
  assert.equal(handle.props.style[0].width,44); assert.equal(handle.props.style[0].height,44)
  handlers.onStart(); handlers.onMove(60,60); handlers.onEnd({cancelled:true})
  assert.deepEqual(actions,['checkpoint','updateMany','revertToCheckpoint'])
  assert.deepEqual(s.doc.pages[0].objects,objects)
  actions.length=0
  handlers.onStart(); handlers.onMove(60,60); cleanup()
  assert.deepEqual(actions,['checkpoint','updateMany','revertToCheckpoint'])
  assert.deepEqual(s.doc.pages[0].objects,objects)
})
