import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createInitialState,editorReducer} from '../src/editor/state/editorReducer.js'
import {collaborationReducer} from '../src/collaboration/collaborationReducer.js'
import {clamp} from '../src/editor/utils/common.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/controls/ColorPicker.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]})
const id='10000000-0000-4000-8000-000000000001',pageId='20000000-0000-4000-8000-000000000001'
function fixture(){
 let cursor=0,sequence=0,state=createInitialState({pages:[{id:pageId,objects:[{id,type:'shape',x:1,y:2,w:40,h:20,fill:'#FFFFFF'}]}]})
 const slots=[],handlers=[],cleanup=[],ends=[]
 const dispatch=action=>{state=collaborationReducer(editorReducer,state,{collaborationId:`30000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,...action})}
 const module={exports:{}}
 const load=name=>{
  if(name==='react')return {createContext:()=>({}),useContext:()=>null,useRef:v=>{const i=cursor++;return slots[i]??=({current:v})},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=typeof v==='function'?v():v;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next}]},useEffect:fn=>{const i=cursor++;if(!(i in slots)){slots[i]=true;cleanup.push(fn())}}}
  if(name==='react/jsx-runtime')return require(name)
  if(name==='react-native')return {View:'view',Text:'text',StyleSheet:{create:s=>s,absoluteFill:{}},PanResponder:{create:h=>{handlers.push(h);return {panHandlers:h}}}}
  if(name==='react-native-svg')return {__esModule:true,default:'svg',Defs:'defs',LinearGradient:'gradient',Rect:'rect',Stop:'stop'}
  if(name.endsWith('/PenSafeTextInput'))return {__esModule:true,default:'input'}
  if(name.endsWith('/theme'))return {colors:{}}
  if(name.endsWith('/common'))return {clamp}
  if(name.endsWith('/svgId'))return {useSvgId:()=> 'picker-test'}
  throw Error(name)
 }
 new Function('require','module','exports',code)(load,module,module.exports)
 const render=()=>{cursor=0;return module.exports.default({value:state.doc.pages[0].objects[0].fill,onStart:()=>dispatch({type:'checkpoint'}),onChange:fill=>dispatch({type:'updateObject',id,patch:{fill},record:false}),onEnd:event=>{ends.push(event);dispatch({type:'commitCheckpoint'})}})}
 return {render,handlers,state:()=>state,ends,close:()=>cleanup.forEach(fn=>fn?.())}
}
function nodes(value){if(!value||typeof value!=='object')return [];if(Array.isArray(value))return value.flatMap(nodes);return [value,...nodes(value.props?.children)]}
const point={nativeEvent:{pageX:.5,pageY:40,locationX:.5,locationY:40}}
for(const mode of ['release','cancel','unmount'])test(`색상 ${mode} 후 다른 조작 없이 편집 작업을 전송 대기열에 넣는다`,()=>{
 const f=fixture();f.render();const input=f.handlers[0]
 input.onPanResponderGrant(point)
 assert.equal(f.state().collaborationEdits.length,0)
 if(mode==='release')input.onPanResponderRelease(point)
 else if(mode==='cancel')input.onPanResponderTerminate()
 else f.close()
 assert.equal(f.ends.length,1);assert.equal(f.state().collaborationEdits.length,1);assert.equal(f.state().collaborationGesture,null)
 input.onPanResponderTerminate();assert.equal(f.ends.length,1)
})
test('HEX 입력 완료도 편집 종료를 전달한다',()=>{
 const f=fixture();let input=nodes(f.render()).find(n=>n.type==='input')
 input.props.onChangeText('#123456');input=nodes(f.render()).find(n=>n.type==='input');input.props.onSubmitEditing()
 assert.equal(f.state().doc.pages[0].objects[0].fill,'#123456');assert.equal(f.state().collaborationEdits.length,1);assert.equal(f.ends.length,1)
})
