import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as sync from '../src/diary/services/textPageSync.js'
import * as memberStorage from '../src/diary/services/memberStorage.js'
import {createInitialState,editorReducer} from '../src/editor/state/editorReducer.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/useMemberTextPageSync.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]})
const pageId='10000000-0000-4000-8000-000000000001',diaryId='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001'
function fixture(storage,transport){
 let cursor=0,dirty=true,output,stopped=false,sessionKey='session-1',state=createInitialState({id:diaryId,pages:[{id:pageId,objects:[]} ]})
 const slots=[],effects=[],cleanups=[]
 const load=name=>{
  if(name==='react')return {useRef:v=>{const i=cursor++;return slots[i]??=( {current:v})},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;dirty=true}]},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,n)=>!Object.is(v,slots[i][n]))){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
  if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage}
  if(name==='expo/fetch')return {fetch}
  if(name.endsWith('/authService'))return {authService:{getSessionKey:()=>sessionKey},apiBaseUrl:'http://qa/api/v1',accessTokenHeader:'Authorization'}
  if(name.endsWith('/memberTransport.js'))return {createAuthenticatedMemberTransport:()=>transport}
  if(name.endsWith('/memberStorage.js'))return memberStorage
  if(name.endsWith('/textPageSync.js'))return sync
  return require(name)
 }
 const module={exports:{}};new Function('require','module','exports',code)(load,module,module.exports)
 const dispatch=action=>{state=editorReducer(state,action);dirty=true}
 const render=()=>{cursor=0;dirty=false;output=module.exports.useMemberTextPageSync({diary:{id:diaryId,source:'member-api',memberAccountId:'1'},page:state.doc.pages[0],loaded:true,readOnly:false,dispatch});effects.splice(0).forEach(f=>f())}
 return {state:()=>state,edit:dispatch,status:()=>output.status,async settle(){for(let i=0;i<15;i++){if(dirty&&!stopped)render();await new Promise(r=>setTimeout(r,60))}},close(){stopped=true;cleanups.forEach(fn=>fn?.())},expire(){sessionKey='other';dirty=true}}
}
test('실제 편집기 동기화 hook이 자동 전송하고 네트워크 실패 후 새 앱에서 로컬을 복구한다',async()=>{
 const disk=new Map(),storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v)}
 let rows=[],offline=false,writes=0
 const transport=async r=>{if(offline)throw Error('network');if(!r.method)return {page:{pageId,diaryId},elements:rows};writes++;rows=[...r.body.creates.map(e=>({...e,pageId,version:0})),...rows];return {items:rows}}
 let app=fixture(storage,transport);await app.settle();assert.equal(app.status(),'saved')
 app.edit({type:'addObjects',objects:[{id,type:'text',text:'입력 후 자동 저장',x:1,y:2,w:100,h:30}]});await app.settle();assert.equal(writes,1);assert.equal(rows[0].propertiesJson.text,'입력 후 자동 저장')
 offline=true;app.edit({type:'updateObject',id,patch:{text:'오프라인 최신'},record:true});await app.settle();assert.equal(app.status(),'error');app.close()
 app=fixture(storage,transport);await app.settle();assert.equal(app.state().doc.pages[0].objects[0].text,'오프라인 최신');assert.equal(app.status(),'error');app.close()
})
