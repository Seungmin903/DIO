import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import * as shapes from '../src/editor/utils/editorShapes.js'
import * as effects from '../src/editor/utils/effects.js'
import * as common from '../src/editor/utils/common.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
function fixture(file,props) {
 let cursor=0
 const states=[],events=[]
 const mocks={
  react:{useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return [states[i],v=>states[i]=v]},useRef:v=>({current:v}),useCallback:f=>f,useContext:()=>()=>{}},
  'react/jsx-runtime':require('react/jsx-runtime'),
  'react-native':{View:'view',Text:'text',Pressable:'button',ScrollView:'scroll',Platform:{select:()=>({})},StyleSheet:{create:s=>s}},
  'react-native-svg':{__esModule:true,default:'svg',Path:'path'},
 }
 const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/'+file,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]})
 const module={exports:{}}
 new Function('require','module','exports',code)(id=>{
  if(mocks[id])return mocks[id]
  if(id.endsWith('/theme'))return {colors:{},shadow:{}}
  if(id.endsWith('/common'))return common
  if(id.endsWith('/effects'))return effects
  if(id.endsWith('/editorShapes'))return shapes
  if(id.endsWith('/ObjectView'))return {objectOpacity:o=>o.opacity??1,photoSupportsShadow:()=>true}
  if(id.endsWith('/ToolPanel'))return {ToolPanelHeader:'header',toolPanelStyles:{}}
  if(id.endsWith('/ColorPicker'))return {__esModule:true,default:'picker',PaletteInteractionContext:{Provider:'provider'}}
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
 all.find(n=>n.type==='Slider'&&n.props.label==='각도').props.onChange(90)
 assert.deepEqual(f.events.at(-1).patches[object.id],{rotation:90})
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
