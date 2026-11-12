import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {clamp,rotateVector,normalizeAngle} from '../src/editor/utils/common.js'
import {STICKER_SIZE} from '../src/diary/utils/coverDesign.js'
import {colors} from '../src/shared/theme.js'
import * as controlMetrics from '../src/diary/utils/coverStickerControls.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
const source=readFileSync(new URL('../src/diary/components/CoverArt.js',import.meta.url),'utf8')
const ast=babel.parseSync(source,{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}})
const declaration=ast.program.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='StickerControl')
assert.ok(declaration,'StickerControl component must exist')
const{code}=babel.transformFromAstSync({...ast,program:{...ast.program,body:[declaration]}},source,{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'classic'}]]})
const references=new Set()
babel.traverse(babel.parseSync(code,{configFile:false,babelrc:false}),{ReferencedIdentifier(path){if(!path.scope.hasBinding(path.node.name))references.add(path.node.name)}})
function fixture({selected=true,rotation=0}={}){
 const slots=[],drafts=new Map(),commits=[],selections=[],removals=[],copies=[];let cursor=0
 const item={id:'a',name:'원본',x:50,y:40,size:18,rotation}
 const store={get:id=>drafts.get(id),set:(id,value)=>{if(value)drafts.set(id,value);else drafts.delete(id)}}
 const scope={React:{createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'Fragment'},
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},
 useRef(initial){const i=cursor++;return slots[i]??={current:initial}},useDraft:(_store,item)=>({...item,...store.get(item.id)}),usePan:handlers=>({qaMove:handlers}),
 clamp,rotateVector,normalizeAngle,STICKER_SIZE,...controlMetrics,
 StyleSheet:{absoluteFill:{position:'absolute',top:0,right:0,bottom:0,left:0}},Platform:{OS:'android'},View:'View',Pressable:'Pressable',Icon:'Icon',StickerHandle:'StickerHandle',colors,styles:{},}
 for(const name of references)assert.ok(name in scope||name in globalThis,`StickerControl 테스트 scope에 실제 참조 ${name}이 없습니다.`)
 const Component=new Function(...Object.keys(scope),code+'\nreturn StickerControl;')(...Object.values(scope))
 const render=()=>{cursor=0;return Component({item,scale:1.5,width:300,height:400,selected,store,onSelect:id=>selections.push(id),onCommit:value=>commits.push(value),onRemove:id=>removals.push(id),onDuplicate:value=>copies.push(value)})}
 function findAll(node,predicate){if(!node||typeof node!=='object')return[];return[...(predicate(node)?[node]:[]),...(node.props?.children??[]).flat(Infinity).flatMap(child=>findAll(child,predicate))]}
 return{item,store,commits,selections,removals,copies,render,findAll:predicate=>findAll(render(),predicate)}
}

test('선택된 조작 영역만 더 높은 터치 우선순위를 가지며 빈 영역은 아래로 통과시킨다',()=>{
 for(const rotation of [0,45,90]){
  const selected=fixture({rotation}).render(),other=fixture({selected:false,rotation}).render()
  assert.equal(selected.props.pointerEvents,'box-none');assert.equal(selected.props.collapsable,false)
  assert.equal(selected.props.style[1].zIndex,1);assert.equal(other.props.style[1].zIndex,0)
 }
})
test('복제·삭제는 선택된 스티커를 전달하고 이동·선택 콜백은 호출하지 않는다',()=>{
 const f=fixture()
 f.findAll(n=>n.props?.accessibilityLabel==='표지 스티커 복제')[0].props.onPress()
 f.findAll(n=>n.props?.accessibilityLabel==='표지 스티커 삭제')[0].props.onPress()
 assert.deepEqual(f.copies,[f.item]);assert.deepEqual(f.removals,['a']);assert.deepEqual(f.selections,[]);assert.deepEqual(f.commits,[])
})
test('이동 중에는 바를 숨기고 끝나면 한 번 반영하며 취소 시 초안을 버린다',()=>{
 for(const cancelled of [false,true]){
  const f=fixture(),move=f.findAll(n=>n.props?.qaMove)[0].props.qaMove
  move.onStart();move.onMove(30,40)
  assert.deepEqual(f.selections,['a']);assert.equal(f.findAll(n=>n.props?.accessibilityLabel==='표지 스티커 복제').length,0)
  assert.deepEqual(f.store.get('a'),{x:60,y:50})
  move.onEnd({cancelled})
  assert.equal(f.commits.length,cancelled?0:1);assert.equal(f.store.get('a'),undefined)
  assert.equal(f.findAll(n=>n.props?.accessibilityLabel==='표지 스티커 복제').length,1)
 }
})
test('크기 조절은 회전된 스티커에서도 맞은편 모서리를 고정한다',()=>{
 for(const rotation of [0,45]){
  const f=fixture({rotation}),handle=f.findAll(n=>n.props?.label==='표지 스티커 크기 조절')[3]
  const initialOffset=rotateVector(f.item.size*1.5,f.item.size*1.5,rotation)
  const anchor={x:f.item.x/100*300-initialOffset.x,y:f.item.y/100*400-initialOffset.y}
  handle.props.onStart();handle.props.onMove(30,30);handle.props.onEnd(false)
  assert.equal(f.commits.length,1);const value=f.commits[0],offset=rotateVector(value.size*1.5,value.size*1.5,rotation)
  assert.ok(value.size>f.item.size);assert.ok(value.size<=STICKER_SIZE.max)
  assert.ok(Math.abs(value.x/100*300-offset.x-anchor.x)<1e-6)
  assert.ok(Math.abs(value.y/100*400-offset.y-anchor.y)<1e-6)
 }
})
test('회전 손잡이는 회전을 반영하고 취소하면 변경하지 않는다',()=>{
 for(const cancelled of [false,true]){
  const f=fixture(),handle=f.findAll(n=>n.props?.label==='표지 스티커 회전 손잡이')[0]
  handle.props.onStart();handle.props.onMove(40,20);handle.props.onEnd(cancelled)
  assert.equal(f.commits.length,cancelled?0:1)
  if(!cancelled)assert.notEqual(f.commits[0].rotation,0)
  assert.equal(f.store.get('a'),undefined)
 }
})
