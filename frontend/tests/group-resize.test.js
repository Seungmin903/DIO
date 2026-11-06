import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { groupResizeStart, groupResizePatches } from '../src/editor/utils/groupResize.js'
import { unionBounds } from '../src/editor/utils/common.js'
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
  const {code}=expo('@babel/core').transformSync(source+'\nexport { GroupResizeHandle }',{
    configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  let handlers, s=createInitialState({pages:[{id:'page',objects}]})
  const actions=[], dispatch=action=>{actions.push(action.type);s=editorReducer(s,action)}
  const mod={exports:{}}
  const load=id=>{
    if(id==='react')return {forwardRef:f=>f,memo:f=>f,useRef:v=>({current:v}),useState:v=>[v,()=>{}],useEffect(){},useLayoutEffect(){},useMemo:f=>f(),useImperativeHandle(){}}
    if(id==='react-native')return {View:'view',Text:'text',Platform:{OS:'ios',select:options=>options.ios??options.default},StyleSheet:{create:v=>v}}
    if(id.endsWith('/usePan'))return {usePan:h=>{handlers=h;return {}}}
    if(id.endsWith('/groupResize.js'))return {groupResizeStart,groupResizePatches}
    if(id.endsWith('/theme'))return {colors:{},radius:{},DISABLED_OPACITY:0.5}
    if(id.startsWith('.'))return {__esModule:true,default:()=>null}
    return require(id)
  }
  new Function('require','module','exports',code)(load,mod,mod.exports)
  mod.exports.GroupResizeHandle({objects,zoom:2,sx:1,sy:1,dispatch,onInteracting(){}})
  handlers.onStart(); handlers.onMove(60,60); handlers.onEnd({cancelled:true})
  assert.deepEqual(actions,['checkpoint','updateMany','revertToCheckpoint'])
  assert.deepEqual(s.doc.pages[0].objects,objects)
})
