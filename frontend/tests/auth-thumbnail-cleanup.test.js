import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import {createAuthApi} from '../src/auth/authApi.js'
import {createMediaThumbnailFiles,clearMediaThumbnailFiles} from '../src/diary/services/mediaThumbnailFiles.web.js'
const user={userId:'7',email:'member@example.com',nickname:'회원'}
const tokens={user,accessToken:'access',refreshToken:'refresh',expiresIn:900}
const response=(data,status=200)=>({status,ok:status<400,json:async()=>data})
const png=new Uint8Array([137,80,78,71,13,10,26,10])
const login=api=>api.login({email:user.email,password:'Password123!'})
test('로그아웃·명시적 세션 만료·계정 삭제는 실제 IndexedDB 썸네일을 삭제한다',async()=>{
 for(const action of ['logout','expire','withdraw']){
  let clearCalls=0
  const api=createAuthApi({baseUrl:'https://api.test/api/v1',clearSessionData:()=>{clearCalls++;assert.equal(api.getCurrentUserId(),null);return clearMediaThumbnailFiles()},fetchImpl:async url=>{
   if(url.endsWith('/login'))return response(tokens)
   if(url.endsWith('/refresh'))return response({code:'INVALID_TOKEN'},401)
   return response(null,204)
  }})
  await login(api)
  const files=createMediaThumbnailFiles('account-7'),uri=await files.write('photo',png)
  if(action==='expire')await assert.rejects(api.refresh(),{code:'INVALID_TOKEN'})
  else if(action==='withdraw')await api.withdraw(user)
  else await api.logout()
  assert.equal(clearCalls,1);assert.equal(api.getCurrentUserId(),null)
  assert.equal(await createMediaThumbnailFiles('account-7').read('photo'),null)
  await assert.rejects(fetch(uri))
 }
})
test('복원 토큰 만료는 캐시를 지우고 일시적 서버 장애는 캐시와 세션을 유지한다',async()=>{
 let cleaned=0
 const expired=createAuthApi({baseUrl:'https://api.test/api/v1',sessionStore:{load:async()=>({userId:'7',refreshToken:'saved'}),clear:async()=>{}},clearSessionData:async()=>cleaned++,fetchImpl:async()=>response({code:'INVALID_TOKEN'},401)})
 await assert.rejects(expired.restoreSession(),{code:'INVALID_TOKEN'});assert.equal(cleaned,1)
 const temporary=createAuthApi({baseUrl:'https://api.test/api/v1',clearSessionData:async()=>cleaned++,fetchImpl:async url=>url.endsWith('/login')?response(tokens):response({},503)})
 await login(temporary);await assert.rejects(temporary.refresh(),{status:503})
 assert.equal(cleaned,1);assert.equal(temporary.getCurrentUserId(),'7')
})
test('로그아웃은 캐시 삭제 완료를 기다리며 늦은 만료 응답이 새 로그인 캐시를 지우지 않는다',async()=>{
 let complete,finishRefresh,clears=0
 const api=createAuthApi({baseUrl:'https://api.test/api/v1',clearSessionData:()=>{clears++;return new Promise(resolve=>{complete=resolve})},fetchImpl:async url=>url.endsWith('/login')?response(tokens):url.endsWith('/refresh')?new Promise(resolve=>{finishRefresh=resolve}):response(null,204)})
 await login(api);const refresh=api.refresh();await new Promise(resolve=>setImmediate(resolve));await login(api)
 finishRefresh(response({code:'INVALID_TOKEN'},401));await assert.rejects(refresh);assert.equal(clears,0)
 let done=false;const logout=api.logout().then(()=>{done=true})
 await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);assert.equal(clears,1);complete();await logout;assert.equal(done,true)
})
