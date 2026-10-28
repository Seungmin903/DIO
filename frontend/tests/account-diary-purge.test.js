import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAuthenticatedDiaryApi,toAuthenticatedDiary} from '../src/diary/services/authenticatedDiaryApi.js';
import {createAccountDiaryLifecycle} from '../src/diary/services/accountDiaryLifecycle.js';
const id='00000000-0000-0000-0000-000000000001';
const row={version:'2',diaryId:id,diaryTitle:'Diary',coverColor:'#CED9EE',coverStyle:'PLAIN',visibility:'MEMBERS',myRole:'OWNER',myMembership:{isFavorite:false},permissions:{canEditMetadata:false,canEditCanvas:false,canTrash:false,canRestore:false,canPermanentlyDelete:true},pageCount:1,firstPageId:id,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z',deletedAt:'2026-01-02T00:00:00Z',expiresAt:'2026-02-01T00:00:00Z'};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>{if(status===204)throw Error('empty');return body;}});
function fixture(fetchImpl){let session='1:1';return {api:createAuthenticatedDiaryApi({auth:{getSessionKey:()=>session,getConnectionOptions:()=>({baseUrl:'https://api.example/api/v1'}),getAccessToken:async()=> 'jwt'},userId:'1',fetchImpl}),logout:()=>{session=null;}};}
test('explicit permanent=true uses authenticated bodyless DELETE and consumes 204',async()=>{
 const calls=[];const f=fixture(async(url,options)=>{calls.push({url,...options});return response(null,204);});assert.equal(await f.api.permanentlyDelete(id),null);
 assert.equal(calls[0].url,`https://api.example/api/v1/diaries/${id}?permanent=true`);assert.equal(calls[0].method,'DELETE');assert.equal(calls[0].body,undefined);assert.equal(calls[0].headers['Idempotency-Key'],undefined);assert.equal(calls[0].headers.Authorization,'Bearer jwt');
 await assert.rejects(f.api.permanentlyDelete('bad'),{status:400});assert.equal(calls.length,1);
});
test('only owner trash and explicit server permission allow permanent-delete UI',()=>{
 assert.equal(toAuthenticatedDiary(row).canPermanentlyDelete,true);
 for(const patch of [{myRole:'EDITOR'},{deletedAt:null,expiresAt:null},{permissions:{...row.permissions,canPermanentlyDelete:false}}])assert.equal(toAuthenticatedDiary({...row,...patch}).canPermanentlyDelete,false);
});
test('cleanup failure and lost response retain one intent and cannot be replaced',async()=>{
 let attempts=0,committed=false;const calls=[];
 const f=fixture(async url=>{calls.push(url);attempts++;if(attempts===1)return response({code:'CLEANUP_ERROR'},500);if(!committed){committed=true;throw Error('response lost');}return response(null,204);});
 const model=createAccountDiaryLifecycle(f.api);await model.run({kind:'permanentlyDelete',id});assert.equal(model.getSnapshot().canRetry,true);
 await model.run({kind:'restore',id:'other'});assert.equal(calls.length,1);await model.retry();assert.equal(model.getSnapshot().canRetry,true);await model.retry();assert.equal(model.getSnapshot().status,'success');assert.equal(calls.length,3);assert.equal(new Set(calls).size,1);
});
test('permission, missing target and active-state conflict block automatic retry',async()=>{
 for(const status of [401,403,404,409]){let calls=0;const model=createAccountDiaryLifecycle(fixture(async()=>{calls++;return response({code:status===409?'DIARY_NOT_TRASHED':'DENIED'},status);}).api);await model.run({kind:'permanentlyDelete',id});await model.retry();assert.equal(calls,1);assert.equal(model.getSnapshot().canRetry,false);}
 await assert.rejects(fixture(async()=>response({},200)).api.permanentlyDelete(id),{code:'INVALID_RESPONSE'});
});
test('double click shares request and late logout result is ignored',async()=>{
 let finish,calls=0;const f=fixture(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});const model=createAccountDiaryLifecycle(f.api);const a=model.run({kind:'permanentlyDelete',id}),b=model.run({kind:'permanentlyDelete',id});assert.equal(a,b);await new Promise(resolve=>setTimeout(resolve,0));f.logout();model.reset();finish(response(null,204));await a;assert.equal(calls,1);assert.equal(model.getSnapshot().status,'idle');
});
test('real Spring post-purge page is empty and accepted by FE',{skip:!process.env.DIO_DIARY_PURGE_CONTRACT_OUTPUT},async()=>{
 const page=JSON.parse(readFileSync(process.env.DIO_DIARY_PURGE_CONTRACT_OUTPUT,'utf8'));assert.equal(page.items.length,0);const f=fixture(async()=>response(page));assert.deepEqual((await f.api.list({query:{status:'trashed'}})).items,[]);
});
