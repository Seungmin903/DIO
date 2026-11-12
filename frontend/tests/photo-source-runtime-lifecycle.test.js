import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createMediaThumbnailPreview} from '../src/diary/services/mediaThumbnailPreview.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/PhotoSourcePicker.js',import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function mount({runtime,created}){
 const state=[],refs=[],effects=[];let si=0,ri=0,ei=0,scheduled=[]
 const hooks={
  useState:initial=>{const i=si++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},
  useRef:value=>{const i=ri++;return refs[i]??(refs[i]={current:value})},
  useEffect:(fn,deps)=>{const i=ei++,old=effects[i];if(!old||deps.some((value,j)=>value!==old.deps[j]))scheduled.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})},
 }
 const noop=()=>null,theme=new Proxy({},{get:()=>({})})
 const mocks={
  react:hooks,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  'react-native':{StyleSheet:{create:value=>value}},'../ToolPanel':{ToolPanelHeader:noop,toolPanelStyles:{}},
  '../../utils/gridRows.js':{padRows:value=>value},'../controls/Icon':noop,'../canvas/MediaImage':noop,
  '../../hooks/useMediaUri':{},'../../hooks/useCustomDecor':{useCustomDecor:()=>({items:{}})},
  '../../../diary/services/mediaLibraryRuntime':{createMediaLibraryRuntime:()=>created},
  '../../../diary/services/mediaThumbnailPreview.js':{createMediaThumbnailPreview},
  '../../../diary/services/mediaLibraryApi.js':{mediaLibraryError:()=> 'error',canSelectMediaPhoto:()=>true},
  '../../../shared/AppIcon':noop,'../../../shared/mediaLimits.js':{},'../../../shared/theme':{colors:theme,radius:theme},
 }
 const module={exports:{}};new Function('require','module','exports',code)(name=>{assert.ok(name in mocks,name);return mocks[name]},module,module.exports)
 const render=()=>{si=ri=ei=0;scheduled=[];module.exports.default({diary:{source:'member-api'},runtime});const pending=scheduled;scheduled=[];pending.forEach(fn=>fn())}
 render()
 return {render,unmount:()=>effects.forEach(effect=>effect.cleanup?.())}
}
test('부모 소유 런타임은 패널을 닫고 다시 열어도 종료하지 않는다',async()=>{
 let disposed=0
 const runtime={list:async()=>({items:[],nextCursor:null}),dispose:()=>disposed++}
 for(let i=0;i<2;i++){const panel=mount({runtime});await tick();panel.render();panel.unmount()}
 assert.equal(disposed,0)
})
test('직접 만든 런타임만 목록 완료 전후의 패널 종료에서 정리한다',async()=>{
 for(const delayed of [false,true]){
  let disposed=0,finish
  const created={list:()=>delayed?new Promise(resolve=>{finish=resolve}):Promise.resolve({items:[],nextCursor:null}),dispose:()=>disposed++}
  const panel=mount({created})
  if(!delayed){await tick();panel.render()}
  panel.unmount();finish?.({items:[],nextCursor:null});await tick();assert.equal(disposed,1)
 }
})
test('부모 런타임의 목록이 패널 종료 뒤 도착해도 부모 런타임을 정리하지 않는다',async()=>{
 let disposed=0,finish
 const runtime={list:()=>new Promise(resolve=>{finish=resolve}),dispose:()=>disposed++}
 const panel=mount({runtime});panel.unmount();finish({items:[],nextCursor:null});await tick();assert.equal(disposed,0)
})
