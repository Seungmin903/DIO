import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { EDITOR_SHAPES, SHAPE_CATEGORIES, createShape, shapeTextStyle, shapeBorderDash, SHAPE_BORDER_STYLES, shapeTextFormatPatch, shapeTextBox } from '../src/editor/utils/editorShapes.js'
import * as textFormats from '../src/editor/utils/textFormats.js'
import * as text from '../src/editor/utils/text.js'
import * as effects from '../src/editor/utils/effects.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'

test('70종 이상 고유 도형을 실제 경로와 6개 분류로 제공한다', () => {
  assert.ok(EDITOR_SHAPES.length >= 70)
  assert.equal(new Set(EDITOR_SHAPES.map(s=>s.id)).size, EDITOR_SHAPES.length)
  assert.equal(new Set(EDITOR_SHAPES.map(s=>s.label)).size, EDITOR_SHAPES.length)
  for (const item of EDITOR_SHAPES) {
    assert.ok(SHAPE_CATEGORIES.some(c=>c.id===item.category))
    assert.match(item.path,/^M/)
    assert.ok(!/NaN|undefined|Infinity/.test(item.path))
    const object=createShape({shape:item.id},{x:500,y:300})
    assert.equal(object.type,'shape')
    assert.equal(object.x+object.w/2,500)
    assert.equal(object.y+object.h/2,300)
  }
})

test('도형 스타일·글·변형·복제·저장 복원과 Undo/Redo를 보존한다', () => {
  const object=createShape({shape:'speech',fill:'none',borderWidth:4,borderStyle:'dotted'},{x:300,y:200})
  let state=createInitialState({pages:[{id:'p',objects:[]}]})
  const run=action=>{state=editorReducer(state,action)}
  run({type:'addObjects',objects:[object]})
  run({type:'updateObject',id:object.id,record:true,patch:{text:'오늘의 기록\n안녕하세요',font:'nanum-gothic',bold:true,fontSize:28,align:'center',rotation:40,w:400,h:120,x:90,y:60}})
  const edited=state.doc.pages[0].objects[0]
  run({type:'undo'})
  assert.equal(state.doc.pages[0].objects[0].text,'')
  run({type:'redo'})
  assert.deepEqual(state.doc.pages[0].objects[0],edited)
  run({type:'duplicateObjects',ids:[object.id]})
  assert.equal(state.doc.pages[0].objects.length,2)
  assert.equal(state.doc.pages[0].objects[1].text,edited.text)
  const restored=createInitialState(JSON.parse(JSON.stringify(state.doc)))
  assert.deepEqual(restored.doc,JSON.parse(JSON.stringify(state.doc)))
  run({type:'updateObject',id:object.id,record:true,patch:{text:''}})
  assert.equal(state.doc.pages[0].objects.length,2)
  assert.equal(state.doc.pages[0].objects[0].text,'')
  assert.equal(state.doc.pages[0].objects[0].fill,'none')
})

test('모든 도형과 빈 글·투명 채우기를 출력 스냅샷에 보존하고 손상 서식은 거부한다',async()=>{
  const objects=EDITOR_SHAPES.map(item=>createShape({shape:item.id,fill:'none',borderWidth:2,borderStyle:'dashed'},{x:300,y:200}))
  const snapshot=createExportSnapshot({objects})
  const prepared=await prepareExportSnapshot(snapshot,{})
  assert.deepEqual(prepared.objects,objects)
  objects[0].text='원본 변경'
  assert.equal(snapshot.objects[0].text,'')
  assert.throws(()=>createExportSnapshot({objects:[{...objects[0],borderWidth:-1}]}),/도형/)
  prepared.dispose()
})

test('공용 도형 렌더러는 채우기·선 스타일·글자와 줌을 반영한다',()=>{
  const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
  const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/ShapeContent.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]})
  const module={exports:{}}, mocks={
    'react/jsx-runtime':require('react/jsx-runtime'),
    'react-native':{View:'view',Text:'text',Platform:{OS:'web'}},
    'react-native-svg':{__esModule:true,default:'svg',Path:'path',Defs:'defs',Filter:'filter',FeGaussianBlur:'blur',G:'group'},
    '../../hooks/useTextFont':{useTextFont(){}},
    '../../utils/textFormats':textFormats,
    '../../utils/text':text,
    '../../utils/effects':effects,
    '../../utils/svgId':{useSvgId:()=> 'shadow-test'},
    '../../utils/editorShapes':{shapeDefinition:id=>EDITOR_SHAPES.find(s=>s.id===id),shapeTextStyle,shapeBorderDash,shapeTextBox},
  }
  new Function('require','module','exports',code)(id=>mocks[id],module,module.exports)
  const object={...createShape({fill:'none',borderWidth:3,borderStyle:'dotted',bold:true},{x:100,y:100}),text:'도형'}
  const node=module.exports.default({object,zoom:2}),children=node.props.children
  const graphic=children[0],mainSvg=graphic.props.children[1]
  const path=mainSvg.props.children
  assert.equal(path.props.fill,'none')
  assert.equal(path.props.strokeWidth,6)
  assert.deepEqual(path.props.strokeDasharray,[6,12])
  assert.equal(children[1].props.children.props.children.map(segment=>segment.props.children).join(''),'도형')
  const withShadow=module.exports.default({object:{...object,fill:'#FFFFFF',shadow:true,shadowBlur:10,shadowSpread:4,shadowDistance:6,shadowDirection:'r'},zoom:2})
  const shadowGraphic=withShadow.props.children[0]
  const shadowWrap=shadowGraphic.props.children[0],shadowSvg=shadowWrap.props.children
  assert.equal(shadowGraphic.props.style.width,object.w*2)
  assert.equal(shadowGraphic.props.style.height,object.h*2)
  assert.equal(shadowGraphic.props.children[1].props.width,mainSvg.props.width)
  assert.equal(shadowGraphic.props.children[1].props.height,mainSvg.props.height)
  assert.equal(shadowGraphic.props.children[1].props.children.props.transform,path.props.transform)
  assert.equal(shadowGraphic.props.children[1].props.viewBox,undefined)
  assert.ok(shadowSvg.props.width>object.w*2)
  assert.ok(shadowSvg.props.viewBox.startsWith('0 0 '))
  const bleed=-shadowWrap.props.style.left
  const shadowElements=shadowSvg.props.children
  assert.equal(shadowElements[0].props.children.props.children.props.stdDeviation,10)
  assert.ok(shadowElements[1].props.children.props.transform.startsWith(`translate(${bleed+12} ${bleed})`))
  assert.equal(shadowElements[1].props.children.props.strokeWidth,22)
  assert.equal(withShadow.props.children[1].props.style.filter,undefined)
  assert.equal(node.props.style.width,object.w*2)
  assert.equal(node.props.style.overflow,'visible')
  assert.equal(children[1].props.style.overflow,'visible')
  assert.equal(children[1].props.children.props.style[1].flexShrink,0)
  for(const [verticalAlign,justify] of [['top','flex-start'],['middle','center'],['bottom','flex-end']]) assert.equal(module.exports.default({object:{...object,verticalAlign}}).props.children[1].props.style.justifyContent,justify)
  for (const flipX of [false,true]) for (const flipY of [false,true]) {
    const flipped=module.exports.default({object:{...object,flipX,flipY,text:'안녕 도형 ABC'},zoom:2})
    assert.equal(flipped.props.style.transform,undefined)
    const [graphic,label]=flipped.props.children
    assert.deepEqual(graphic.props.style.transform,[{scaleX:flipX?-1:1},{scaleY:flipY?-1:1}])
    assert.ok(!label.props.style.transform)
    assert.equal(label.props.children.props.children.map(segment=>segment.props.children).join(''),'안녕 도형 ABC')
  }

})


test('테두리 7종의 선 패턴이 두께에 비례하고 모두 출력에서 허용된다',()=>{
 assert.equal(SHAPE_BORDER_STYLES.length,7)
 for(const item of SHAPE_BORDER_STYLES){
  assert.deepEqual(shapeBorderDash(item.id,3),item.dash?.map(n=>n*3))
  const shape=createShape({borderStyle:item.id,borderWidth:3},{x:200,y:200})
  assert.equal(createExportSnapshot({objects:[shape]}).objects[0].borderStyle,item.id)
 }
})


test('도형 공용 서식은 크기·좌표를 유지하며 정렬·기울임·밑줄·취소선과 범위 서식을 보존한다',()=>{
 const shape={...createShape({}, {x:300,y:200}),text:'일부 글자',colorRanges:[{start:0,end:2,color:'#FF0000'}],styleRanges:[{start:0,end:2,fontSize:40}]}
 const patch=shapeTextFormatPatch(shape,{textAlign:'justify',italic:true,underline:true,strike:true,fontSize:96,letterSpacing:0.1,lineSpacing:1.8})
 const updated={...shape,...patch}
 for(const key of ['x','y','w','h','rotation','shape','fill'])assert.equal(updated[key],shape[key])
 assert.equal(updated.align,'justify')
 const style=shapeTextStyle(updated,1,'android')
 assert.equal(style.textAlign,'justify')
 assert.equal(style.fontStyle,'italic')
 assert.equal(style.textDecorationLine,'underline line-through')
 assert.deepEqual(updated.styleRanges,shape.styleRanges)
 assert.doesNotThrow(()=>createExportSnapshot({objects:[updated]}))
 assert.deepEqual(shapeTextFormatPatch(updated,{color:'#123456'}).colorRanges,[])
})

// 세 곡선 경로는 절대 좌표만 사용한다. 베지어는 제어점의 볼록 껍질 안에 있으므로
// 끝점·제어점이 0~100 안에 있으면 곡선도 표시 영역을 벗어나지 않는다.
test('구름·생각·타원 말풍선의 곡선 제어점과 원형 꼬리는 표시 범위 안에 있다',()=>{
 for(const id of ['cloud','thought','speechOval']) {
  const path=EDITOR_SHAPES.find(shape=>shape.id===id).path
  for(const match of path.matchAll(/([MLC])([^A-Za-z]*)/g)) {
   const coords=match[2].match(/-?\d+(?:\.\d+)?/g).map(Number)
   assert.equal(coords.length%2,0)
   for(const value of coords)assert.ok(value>=0&&value<=100,`${id}: ${value}`)
  }
  // 생각 말풍선 꼬리는 같은 높이의 두 반원으로 원을 만든다.
  for(const match of path.matchAll(/M(\d+) (\d+)A(\d+) (\d+) 0 1 0 (\d+) (\d+)A/g)) {
   const [,x,y,rx,ry,endX]=match.map(Number)
   assert.ok(x>=0&&endX<=100&&y-ry>=0&&y+ry<=100)
   assert.equal(endX-x,2*rx)
  }
 }
})

test('도형 세로 정렬은 저장·출력되며 모양과 무관하게 전체 글 영역을 사용한다',()=>{
 const shape=createShape({shape:'star'},{x:300,y:200})
 const box=shapeTextBox(shape)
 assert.equal(box.left,14)
 assert.equal(box.top,14)
 assert.equal(box.width,shape.w-28)
 assert.equal(box.height,shape.h-28)
 assert.deepEqual(shapeTextBox({...shape,shape:'rect'}),box)
 for(const verticalAlign of ['top','middle','bottom']) {
  const updated={...shape,...shapeTextFormatPatch(shape,{verticalAlign})}
  assert.equal(updated.verticalAlign,verticalAlign)
  assert.equal(createExportSnapshot({objects:[updated]}).objects[0].verticalAlign,verticalAlign)
 }
})

test('세로 정렬 선택은 도형 서식에서만 표시하고 선택 값을 변경한다',()=>{
 const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
 const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/TextSettings.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]})
 const module={exports:{}}
 new Function('require','module','exports',code)(id=>{
  if(id==='react')return {useState:v=>[v,()=>{}],useEffect:()=>{},useSyncExternalStore:(_subscribe,snapshot)=>snapshot()}
  if(id==='react-native')return {Platform:{OS:'android'},View:'view',Text:'text',TextInput:'input',ScrollView:'scroll',Pressable:'button',StyleSheet:{create:v=>v}}
  if(id.endsWith('/useFormFactor'))return {useFormFactor:()=>({isPhone:false})}
  if(id.endsWith('/useTextFont'))return {useTextFont:()=>''}
  if(id.endsWith('/ToolPanel'))return {Segmented:'segment',ToolPanelHeader:'header',toolPanelStyles:{}}
  if(id.endsWith('/theme'))return {colors:{}}
  if(id.endsWith('/text'))return text
  if(id==='react/jsx-runtime')return require(id)
  return {__esModule:true,default:'mock',Path:'path'}
 },module,module.exports)
 const find=value=>{
  if(!value||typeof value!=='object')return []
  if(Array.isArray(value))return value.flatMap(find)
  return [value,...find(value.props?.children)]
 }
 const changes=[],props={settings:{...text.textSettings({}),verticalAlign:'middle'},onChange:v=>changes.push(v)}
 assert.ok(!find(module.exports.default(props)).some(n=>n.type==='segment'&&n.props.items.some(i=>i.id==='top')))
 const segment=find(module.exports.default({...props,verticalAlignment:true})).find(n=>n.type==='segment'&&n.props.items.some(i=>i.id==='top'))
 assert.ok(segment.props.selected('middle'))
 for(const id of ['top','middle','bottom'])segment.props.onPress(id)
 assert.deepEqual(changes,[{verticalAlign:'top'},{verticalAlign:'middle'},{verticalAlign:'bottom'}])
})
