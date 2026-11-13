import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import * as shapes from '../src/editor/utils/editorShapes.js'
import * as effects from '../src/editor/utils/effects.js'
import * as common from '../src/editor/utils/common.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
// 색 창(useColorWindow)은 연 내용만 기록한다
const windows=[]
function fixture(file,props) {
 let cursor=0
 const states=[],events=[]
 const mocks={
  react:{useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return [states[i],v=>states[i]=v]},useRef:v=>({current:v}),useCallback:f=>f,useEffect:()=>{},useContext:()=>()=>{}},
  'react/jsx-runtime':require('react/jsx-runtime'),
  'react-native':{View:'view',Text:'text',Pressable:'button',ScrollView:'scroll',TextInput:'input',Keyboard:{addListener:()=>({remove(){}})},Platform:{select:()=>({})},StyleSheet:{create:s=>s}},
  'react-native-svg':{__esModule:true,default:'svg',Path:'path'},
 }
 const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/'+file,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]})
 const module={exports:{}}
 new Function('require','module','exports',code)(id=>{
  if(mocks[id])return mocks[id]
  if(id.endsWith('/theme'))return {colors:{},shadow:{},radius:{},DISABLED_OPACITY:.4}
  if(id.endsWith('/common'))return common
  if(id.endsWith('/effects'))return effects
  if(id.endsWith('/editorShapes'))return shapes
  if(id.endsWith('/ObjectView'))return {objectOpacity:o=>o.opacity??1,photoSupportsShadow:()=>true}
  if(id.endsWith('/ToolPanel'))return {ToolPanelHeader:'header',toolPanelStyles:{}}
  if(id.endsWith('/ColorPicker'))return {__esModule:true,default:'picker',PaletteInteractionContext:{Provider:'provider'}}
  if(id.endsWith('/PresetColorEditor'))return {useColorWindow:()=>({open:(ref,options)=>windows.push(options),element:null,isOpen:false})}
  // 여행 노선 지점(스티커 하위 종류) 판별은 실제 함수가 필요하다(옵션 패널이 윤곽선 · 그림자 대상에서 지점을 뺀다)
  if(id.endsWith('/routeNode'))return {isRouteNode:o=>o?.type==='sticker'&&o.routeNode!=null&&typeof o.routeNode==='object'}
  return {__esModule:true,default:id.split('/').at(-1)}
 },module,module.exports)
 const render=()=>{cursor=0;return module.exports.default({dispatch:a=>events.push(a),...props})}
 return {render,events}
}
function nodes(value) {
 if(!value||typeof value!=='object')return []
 if(Array.isArray(value))return value.flatMap(nodes)
 if(typeof value.type==='function')return nodes(value.type(value.props))
 return [value,...nodes(value.props?.children)]
}
test('삽입 창에만 모양 목록·추가 버튼이 있고 기존 도형 스타일에는 없다',()=>{
 const settings=shapes.createShape({}, {x:200,y:200})
 const inserted=nodes(fixture('ShapeSettings.js',{settings,onAdd:()=>{}}).render())
 const circle=inserted.find(n=>n.props?.accessibilityLabel==='원').props.children
 const ellipse=inserted.find(n=>n.props?.accessibilityLabel==='타원').props.children
 assert.equal(circle.props.width,circle.props.height)
 assert.ok(ellipse.props.width>ellipse.props.height)
 assert.ok(inserted.some(n=>n.props?.accessibilityLabel==='도형 캔버스에 추가'))
 const editing=nodes(fixture('ShapeSettings.js',{settings,embedded:true,showShapePicker:false,onChange:()=>{}}).render())
 assert.ok(!editing.some(n=>n.props?.accessibilityRole==='tab'||n.props?.accessibilityLabel==='원'||n.props?.accessibilityLabel==='도형 캔버스에 추가'))
 assert.ok(!editing.some(n=>n.props?.accessibilityLabel==='도형 글 입력·수정'))
 assert.ok(editing.some(n=>n.props?.accessibilityLabel==='채우기 없음'))
 assert.ok(editing.some(n=>n.type==='Slider'&&n.props.label==='테두리 두께'))
})
test('도형 하나도 공용 꾸미기·배치에서 불투명도·반전·각도를 변경한다',()=>{
 const object=shapes.createShape({}, {x:200,y:200}),f=fixture('panels/MorePanel.js',{objects:[object]})
 let all=nodes(f.render())
 const embedded=all.find(n=>n.type==='ShapeSettings')
 assert.equal(embedded.props.showShapePicker,false)
 embedded.props.onChange({fill:'#123456'})
 assert.deepEqual(f.events.at(-1).patches[object.id],{fill:'#123456'})
 const opacity=all.find(n=>n.type==='Slider'&&n.props.label==='불투명도')
 opacity.props.onChange(0.4)
 assert.deepEqual(f.events.at(-1).patches[object.id],{opacity:0.4})
 all.find(n=>n.props?.accessibilityRole==='tab'&&n.props.children.props.children==='배치').props.onPress()
 all=nodes(f.render())
 all.find(n=>n.type==='button'&&n.props?.children?.props?.children==='좌우 반전').props.onPress()
 assert.deepEqual(f.events.at(-1).patches[object.id],{flipX:true})
 const angle=all.find(n=>n.type==='Slider'&&n.props.label==='각도')
 angle.props.onStart();angle.props.onChange(90)
 assert.deepEqual(f.events.at(-1).patches[object.id],{rotation:90})
 angle.props.onEnd({cancelled:false});assert.equal(f.events.at(-1).type,'commitCheckpoint')
 embedded.props.onCheckpoint();embedded.props.onCommit();assert.equal(f.events.at(-1).type,'commitCheckpoint')
 const locked=nodes(fixture('panels/MorePanel.js',{objects:[{...object,locked:true}]}).render())
 assert.ok(!locked.some(n=>n.type==='ShapeSettings'||n.type==='Slider'))
})
test('도형 그림자 효과를 변경하고 중복 윤곽선은 제공하지 않는다',()=>{
 const object=shapes.createShape({}, {x:200,y:200}),f=fixture('panels/EffectOptions.js',{objects:[object]})
 const all=nodes(f.render())
 assert.ok(!all.some(n=>n.type==='Slider'&&n.props.label==='윤곽선 두께'))
 all.find(n=>n.type==='Slider'&&n.props.label==='그림자 크기').props.onChange(5)
 assert.deepEqual(f.events.at(-1).patches[object.id],{shadow:true,shadowSpread:5})
})

test('도형 테두리 슬라이더와 색상 입력(색 창)은 편집 시작 · 완료 콜백을 전달한다',()=>{
 let starts=0,ends=0
 const f=fixture('ShapeSettings.js',{settings:shapes.createShape({}, {x:200,y:200}),onChange:()=>{},onCheckpoint:()=>starts++,onCommit:()=>ends++})
 const slider=nodes(f.render()).find(n=>n.type==='Slider'&&n.props.label==='테두리 두께')
 slider.props.onStart();slider.props.onChange(5);slider.props.onEnd();assert.equal(starts,1);assert.equal(ends,1)
 const end=()=>ends++,field=fixture('controls/ColorField.js',{value:'#FFFFFF',onStart:()=>starts++,onEnd:end,onChange:()=>{},label:'테두리'})
 nodes(field.render()).find(n=>n.type==='button').props.onPress()
 assert.equal(starts,2)
 windows.at(-1).onClose();assert.equal(ends,2)
 windows.at(-1).onDone('#123456');assert.equal(ends,3)
})

test('서버 페이지 삭제 안내는 기기 되돌리기로 복구할 수 있다고 약속하지 않는다',()=>{
 const all=nodes(fixture('controls/PageBulkDelete.js',{pages:[{id:'a'},{id:'b'}],ids:['a'],canUndoDelete:false,onDone:()=>{}}).render())
 assert.match(all.find(n=>n.type==='ConfirmDialog').props.message,/여기서 되돌릴 수 없어요/)
 assert.equal(all.some(n=>n.props?.accessibilityLabel==='다이어리 초기화'),false)
})
