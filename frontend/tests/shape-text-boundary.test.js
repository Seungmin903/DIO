import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { shapeTextBox } from '../src/editor/utils/editorShapes.js'
import * as textRanges from '../src/editor/utils/textRanges.js'
import * as textFormats from '../src/editor/utils/textFormats.js'
import { shapeInputHeight, shapeRevealDelta } from '../src/editor/utils/shapeTextViewport.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/ShapeTextEditor.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]})

function fixture() {
  const refs=[], effects=[], layouts=[], frames=new Map(), saves=[]
  let cursor=0, effectCursor=0, nextFrame=0, keyboard={}, removed=0, dismissed=0
  let position={x:40,y:600,width:200,height:120}, defer=false
  const pending=[]
  const selections=[]
  const input={measureInWindow:fn=>{const p={...position}; const call=()=>fn(p.x,p.y,p.width,p.height); if(defer)pending.push(call);else call()},setSelection:(start,end)=>selections.push({start,end})}
  const react={
    useRef:initial=>{const i=cursor++;return refs[i]??={current:initial}},
    useState:initial=>{const i=cursor++;refs[i]??={value:typeof initial==='function'?initial():initial};return [refs[i].value,value=>{refs[i].value=typeof value==='function'?value(refs[i].value):value}]},
    useLayoutEffect:fn=>layouts.push(fn),
    useEffect:(fn,deps)=>{const i=effectCursor++;if(!effects[i]||deps.some((d,j)=>d!==effects[i].deps[j])){effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}}},
  }
  const mocks={react,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':{View:'view',TextInput:'input',Text:'text',Platform:{OS:'android'},Keyboard:{addListener:(name,fn)=>{keyboard[name]=fn;return {remove:()=>removed++}},dismiss:()=>dismissed++}},'../../shared/theme':{colors:{}},'../hooks/useTextFont':{useTextFont(){}},'../utils/editorShapes':{shapeTextStyle:()=>({}),shapeTextBox},'../utils/text':{textPatch:()=>({h:60}),textSettings:()=>({lineSpacing:1.4})},'../utils/textRanges':textRanges,'../utils/textFormats':textFormats,'../services/textClipboard':{useTextClipboardAvailable:()=>false,copyText:async()=>{},readText:async()=>''},'./TextActionBar':{__esModule:true,default:'actions',TextRangePanel:'rangePanel'},'../utils/shapeTextViewport':{shapeInputHeight,shapeRevealDelta},'./canvas/ShapeContent':{__esModule:true,default:'shape'}}
  const module={exports:{}}
  new Function('require','module','exports','requestAnimationFrame','cancelAnimationFrame',code)(id=>mocks[id],module,module.exports,fn=>{frames.set(++nextFrame,fn);return nextFrame},id=>frames.delete(id))
  const boundary={current:null}, props={object:{id:'s',x:40,y:600,w:200,h:120,text:'내용'},zoom:1,boundary,onSave:text=>saves.push(text),onReveal:dy=>{position={...position,y:position.y-dy};render()}}
  function render(){cursor=0;effectCursor=0;const tree=module.exports.default(props);tree.props.children[1].props.ref.current=input;layouts.splice(0).forEach(fn=>fn());return tree}
  const tick=()=>{for(let i=0;i<10&&frames.size;i++){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn())}}
  render();tick()
  return {props,render,tick,saves,boundary,selections,showKeyboard:()=>{keyboard.keyboardDidShow({endCoordinates:{screenY:500}});render()},touch:(x,y)=>boundary.current({nativeEvent:{pageX:x,pageY:y}}),move:p=>{position=p},defer:value=>{defer=value},flush:()=>pending.splice(0).forEach(fn=>fn()),unmount:()=>effects.forEach(e=>e.cleanup?.()),removed:()=>removed,dismissed:()=>dismissed,frames}
}

test('키보드 회피 후 이동한 입력창 내부 터치는 유지하고 바깥 터치만 저장한다',()=>{
  const f=fixture()
  assert.equal(f.touch(80,640),false)
  f.showKeyboard()
  // 새 좌표를 측정하기 전에는 이전 좌표로 편집을 종료하지 않는다.
  assert.equal(f.touch(80,400),false)
  f.tick()
  assert.equal(f.touch(80,400),false)
  assert.equal(f.saves.length,0)
  assert.equal(f.touch(300,400),true)
  assert.deepEqual(f.saves,['내용'])
  assert.equal(f.dismissed(),1)
  f.unmount()
})

test('부모 이동·확대 후 다시 측정하고 오래된 비동기 측정 결과를 무시한다',()=>{
  const f=fixture()
  f.defer(true);f.render();f.tick()
  f.move({x:100,y:120,width:300,height:180});f.props.zoom=1.5;f.render()
  f.flush()
  assert.equal(f.touch(150,150),false)
  f.defer(false);f.tick()
  assert.equal(f.touch(150,150),false)
  assert.equal(f.saves.length,0)
  assert.equal(f.touch(50,650),true)
  f.unmount()
})

test('종료 시 예약 측정과 키보드 구독을 해제하고 늦은 측정을 무시한다',()=>{
  const f=fixture()
  f.defer(true);f.render();f.tick();f.render()
  f.unmount();f.flush()
  assert.equal(f.frames.size,0)
  assert.equal(f.boundary.current,null)
  assert.equal(f.removed(),3)
  assert.equal(f.saves.length,0)
})


test('글이 짧은 큰 도형은 빈 공간 때문에 위로 밀지 않고 툴바 뒤 입력창은 아래로 복구한다',()=>{
 assert.equal(shapeInputHeight(600,70,500,150),70)
 assert.equal(shapeRevealDelta({y:240,height:70},500,150),0)
 assert.equal(shapeRevealDelta({y:130,height:70},500,180),-50)
})

test('긴 도형 글은 툴바와 키보드 사이 높이로 제한하며 입력창 안에서 스크롤한다',()=>{
 const height=shapeInputHeight(800,1000,500,180)
 assert.equal(height,296)
 const delta=shapeRevealDelta({y:250,height},500,180)
 assert.equal(delta,58)
 assert.ok(250-delta>=180)
 assert.ok(250-delta+height<=488)
 assert.equal(shapeInputHeight(800,1000,null,180),800)
})


test('앱은 글자를 고르면 선택한 글자 창에서 일부 색·크기를 바꾸고 저장 시 범위를 전달한다',()=>{
 const f=fixture(),palettes=[],saved=[]
 f.props.onPaletteChange=next=>palettes.push(next)
 f.props.paletteBounds={current:null}
 f.props.onSave=(...args)=>saved.push(args)
 let tree=f.render()
 tree.props.children[1].props.onSelectionChange({nativeEvent:{selection:{start:0,end:1}}})
 f.render();f.tick();f.render()
 let bar=palettes.filter(Boolean).at(-1).content.props.children
 // 안드로이드: 복사 · 붙여넣기는 시스템 메뉴, 고른 글자 서식은 도구줄 아래 창
 assert.equal(bar.type,'rangePanel');assert.equal(palettes.filter(Boolean).at(-1).placement,'panel')
 bar.props.onColor('#FF0000');f.render()
 bar=palettes.filter(Boolean).at(-1).content.props.children
 bar.props.onIncrease();tree=f.render()
 tree.props.children[1].props.onEndEditing({nativeEvent:{text:'내용'}})
 assert.equal(saved[0][0],'내용')
 assert.deepEqual(saved[0][1],[{start:0,end:1,color:'#FF0000'}])
 assert.deepEqual(saved[0][2],[{start:0,end:1,fontSize:22}])
 f.unmount()
})

test('긴 도형 글 입력은 도형 높이로 자르지 않고 키보드 가용 높이만 제한한다',()=>{
 assert.equal(shapeInputHeight(Infinity,600,null,0),600)
 assert.equal(shapeInputHeight(Infinity,600,500,100),376)
})

test('도형 글 입력 종료 이벤트의 최종 조합 문자열을 저장한다',()=>{
 const f=fixture(),saved=[]
 f.props.onSave=value=>saved.push(value)
 const tree=f.render()
 tree.props.children[1].props.onEndEditing({nativeEvent:{text:'최종 한글'}})
 assert.deepEqual(saved,['최종 한글'])
 f.unmount()
})

test('applyInputSelection은 setSelection을 먼저 쓰고 없을 때만 setNativeProps로 바꾼다',()=>{
 const calls=[]
 textFormats.applyInputSelection({setSelection:(start,end)=>calls.push(['setSelection',start,end]),setNativeProps:props=>calls.push(['native',props])},{start:1,end:3})
 textFormats.applyInputSelection({setNativeProps:props=>calls.push(['native',props])},{start:2,end:2})
 textFormats.applyInputSelection(null,{start:0,end:0})
 assert.deepEqual(calls,[['setSelection',1,3],['native',{selection:{start:2,end:2}}]])
})

test('앱: 서식 직후 선택이 풀리면 서식 전 범위로 되돌리고, 닫기는 setSelection으로 커서만 남긴다',()=>{
 const f=fixture(),palettes=[]
 f.props.onPaletteChange=next=>palettes.push(next)
 f.props.paletteBounds={current:null}
 let tree=f.render()
 tree.props.children[1].props.onSelectionChange({nativeEvent:{selection:{start:0,end:2}}})
 f.render();f.tick();f.render()
 let panel=palettes.filter(Boolean).at(-1).content.props.children
 panel.props.onColor('#FF0000')
 tree=f.render()
 // 안드로이드가 다시 그리며 선택을 푼 알림 → 서식 전 범위로 되돌린다
 tree.props.children[1].props.onSelectionChange({nativeEvent:{selection:{start:2,end:2}}})
 assert.deepEqual(f.selections.at(-1),{start:0,end:2})
 f.render()
 panel=palettes.filter(Boolean).at(-1).content.props.children
 panel.props.onClose()
 assert.deepEqual(f.selections.at(-1),{start:2,end:2})
 f.render()
 // 고른 글자가 없으면 창을 내린다
 assert.equal(palettes.at(-1),null)
 f.unmount()
})
