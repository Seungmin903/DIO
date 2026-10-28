import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAuthenticatedDiaryApi, diaryReadRequest, toAuthenticatedDiary } from '../src/diary/services/authenticatedDiaryApi.js';
import { createLibraryReader } from '../src/diary/services/libraryReader.js';
const id='00000000-0000-0000-0000-000000000001';
const row={version:'1',diaryId:id,diaryTitle:'기록',coverColor:'#CED9EE',coverStyle:'PLAIN',visibility:'PRIVATE',myRole:'OWNER',myMembership:{isFavorite:false},
  permissions:{canEditMetadata:true,canEditCanvas:true,canTrash:true,canRestore:false,canPermanentlyDelete:false},pageCount:0,firstPageId:null,
  createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z',deletedAt:null,expiresAt:null};
const page={items:[row],nextCursor:null,hasNext:false};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function fixture(fetchImpl, options={}) {
  let key='1:1', token='access';
  const auth={getSessionKey:()=>key,getConnectionOptions:()=>({baseUrl:'https://api.example/api/v1',...options}),
    getAccessToken:async input=>{assert.equal(input.userId,'1');assert.equal(input.sessionKey,'1:1');return token;}};
  return {auth,api:createAuthenticatedDiaryApi({auth,userId:'1',fetchImpl}),session(value){key=value;},token(value){token=value;}};
}
test('all/shared/favorite UI filters use the server contract',()=>{
  assert.deepEqual(diaryReadRequest(),{status:'active',filter:'all',q:'',sort:'updatedAtDesc'});
  assert.equal(diaryReadRequest({filter:'shared'}).filter,'shared');
  assert.equal(diaryReadRequest({filter:'favorite',sort:'pages'}).favorite,true);
  assert.equal(diaryReadRequest({sort:'pages'}).sort,'pageCountDesc');
});
test('JWT request and strict DTO map without local write capabilities',async()=>{
  const f=fixture(async(url,options)=>{assert.equal(url,'https://api.example/api/v1/diaries?filter=all&q=%25_');
    assert.equal(options.headers.Authorization,'Bearer access');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return response(page);});
  const result=await f.api.list({query:{filter:'all',q:'%_'}});
  assert.equal(result.items[0].canManage,false);assert.equal(result.items[0].canEdit,true);assert.equal(result.items[0].pattern,null);
  assert.equal(typeof f.api.permanentlyDelete,'function');
});
test('alternate token header and token refresh use current access token',async()=>{
  const f=fixture(async(_,options)=>{assert.equal(options.headers['X-DIO-Access-Token'],'refreshed');assert.equal(options.headers.Authorization,undefined);return response({diary:row});},{accessTokenHeader:'X-DIO-Access-Token'});
  f.token('refreshed');assert.equal((await f.api.get(id)).id,id);
});
test('invalid IDs, missing required/null fields and mismatched detail fail closed',async()=>{
  for(const key of Object.keys(row)){const bad={...row};delete bad[key];assert.throws(()=>toAuthenticatedDiary(bad));}
  for(const bad of [{...row,myRole:'VIEWER'},{...row,pageCount:-1},{...row,permissions:{}},{...row,createdAt:'bad'}])assert.throws(()=>toAuthenticatedDiary(bad));
  const f=fixture(async()=>response({diary:{...row,diaryId:id.replace(/1$/,'2')}}));
  await assert.rejects(f.api.get(id),{code:'INVALID_RESPONSE'});await assert.rejects(f.api.get('invalid'),{code:'INVALID_DIARY_ID'});
});
test('invalid pagination and server errors remain distinct from empty results',async()=>{
  for(const body of [{...page,hasNext:true,nextCursor:null},{...page,nextCursor:'unexpected'},{...page,items:null}])
    await assert.rejects(fixture(async()=>response(body)).api.list(),{code:'INVALID_RESPONSE'});
  for(const status of [401,403,404,500])await assert.rejects(fixture(async()=>response({code:'SERVER_CODE'},status)).api.list(),{status,code:'SERVER_CODE'});
  await assert.rejects(fixture(async()=>{throw Error('offline');}).api.list(),{code:'NETWORK_ERROR'});
});
test('old-session responses never enter a new account',async()=>{
  let finish;const f=fixture(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=f.api.list();await Promise.resolve(); f.session('2:2');finish(response(page));
  await assert.rejects(pending,{code:'AUTHENTICATION_REQUIRED'});
});
test('session changes during refresh prevent request dispatch',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return response(page);});
  f.auth.getAccessToken=async()=>{f.session(null);return 'old';};
  await assert.rejects(f.api.list(),{status:401});assert.equal(calls,0);
});
test('cancellation and timeout cannot yield successful late data',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(fixture(async()=>response(page)).api.list({signal:controller.signal}),{name:'AbortError'});
  const f=fixture(async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')))));
  const api=createAuthenticatedDiaryApi({auth:f.auth,userId:'1',timeoutMs:5,fetchImpl:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))))});
  await assert.rejects(api.list(),{code:'NETWORK_ERROR'});
  const late=createAuthenticatedDiaryApi({auth:f.auth,userId:'1',timeoutMs:1,fetchImpl:async()=>{await new Promise(resolve=>setTimeout(resolve,10));return response(page);}});
  await assert.rejects(late.list(),{code:'NETWORK_ERROR'});
});
test('insecure remote URL is rejected before sending credentials',async()=>{
  const f=fixture(async()=>{throw Error('must not call');},{baseUrl:'http://remote.example/api/v1'});
  await assert.rejects(f.api.list(),{code:'API_NOT_CONFIGURED'});
});
test('custom reader request resets cursor and detail when changing shared filter',async()=>{
  const calls=[];const api={list:async options=>{calls.push(options.query);return {items:[{id}],nextCursor:'cursor',hasNext:true};},get:async()=>({id})};
  const reader=createLibraryReader(api,{makeRequest:diaryReadRequest});
  await reader.load({filter:'personal'});await reader.open(id);await reader.load({filter:'shared'});
  assert.equal(calls[1].filter,'shared');assert.equal(calls[1].cursor,undefined);assert.equal(reader.getSnapshot().selectedId,null);reader.dispose();
});
test('real Spring HTTP producer payload is accepted by FE', {skip:!process.env.DIO_DIARY_CONTRACT_OUTPUT},async()=>{
  const contract=JSON.parse(readFileSync(process.env.DIO_DIARY_CONTRACT_OUTPUT,'utf8'));
  const f=fixture(async url=>response(url.includes('?status=trashed')?contract.trash:url.endsWith('/diaries')?contract.list:contract.detail));
  assert.equal((await f.api.list()).items.length,5);
  assert.equal((await f.api.list({query:{status:'trashed'}})).items.length,2);
  const detail=await f.api.get(contract.detail.diary.diaryId);assert.equal(detail.role,'EDITOR');assert.equal(detail.pageCount,2);
});
