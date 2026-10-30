import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createHttpTransport} from '../src/diary/services/diaryApi.js'
import {createTextPageSync,createTextPageSession} from '../src/diary/services/textPageSync.js'
import {createInitialState,editorReducer} from '../src/editor/state/editorReducer.js'
const base=process.env.DIO_TEXT_SYNC_BASE
const login=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.DIO_TEXT_SYNC_EMAIL,password:'DioMember123!'})})
assert.equal(login.status,200);const token=(await login.json()).accessToken;assert.ok(token)
const transport=createHttpTransport({baseUrl:base,getAccessToken:async()=>token})
const diary=await transport({method:'POST',path:'/diaries',body:{diaryTitle:'텍스트 HTTP 검증'}}),diaryId=diary.diary.diaryId
const page=await transport({method:'POST',path:`/diaries/${diaryId}/pages`,body:{canvasWidth:1024,canvasHeight:768}}),pageId=page.page.pageId
const api=createTextPageSync(transport),memory=new Map(),storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v)}
let state=createInitialState({id:diaryId,pages:[{id:pageId,objects:[]}]})
const id=randomUUID(),text={id,type:'text',x:12.34,y:30,w:240,h:48,text:'실제 편집 텍스트',fontSize:24,runs:[{text:'실제 편집 텍스트',color:'#123456'}]}
state=editorReducer(state,{type:'addObjects',objects:[text]})
const session=()=>createTextPageSession({api,storage,key:'qa:member:page',pageId,diaryId})
let s=session();await s.restore();await s.record(state.doc.pages[0].objects);await s.synchronize()
let remote=await api.load(pageId,diaryId);assert.equal(remote[0].propertiesJson.text,text.text)
s=session();assert.equal((await s.restore())[0].text,text.text);await s.synchronize()
state=editorReducer(state,{type:'updateObject',id,patch:{text:'충돌 후 보존할 기기 내용'},record:true});await s.record(state.doc.pages[0].objects)
let raced=false;const racingApi=createTextPageSync(async request=>{if(request.method==='POST'&&!raced){raced=true;await transport({method:'PATCH',path:`/pages/${pageId}/elements/${id}`,body:{version:remote[0].version,x:99}})}return transport(request)})
const racing=createTextPageSession({api:racingApi,storage,key:'qa:member:page',pageId,diaryId});await racing.restore();await assert.rejects(racing.synchronize(),{status:409})
s=session();assert.equal((await s.restore())[0].text,'충돌 후 보존할 기기 내용');await assert.rejects(s.synchronize(),{status:409});remote=await api.load(pageId,diaryId);assert.equal(remote[0].x,99);assert.equal(remote[0].propertiesJson.text,text.text)
const initial=createTextPageSession({api,storage,key:'qa:initial',pageId,diaryId});await initial.restore();await initial.record([text]);await assert.rejects(initial.synchronize(),{status:409})
console.log('TEXT_PAGE_SPRING_HTTP_PASS')
