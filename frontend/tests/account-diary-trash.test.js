import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAuthenticatedDiaryApi,toAuthenticatedDiary} from '../src/diary/services/authenticatedDiaryApi.js';
import {createAccountDiaryLifecycle} from '../src/diary/services/accountDiaryLifecycle.js';
const id='00000000-0000-0000-0000-000000000001';
const row={version:'3',diaryId:id,diaryTitle:'Diary',coverColor:'#CED9EE',coverStyle:'PLAIN',visibility:'MEMBERS',myRole:'OWNER',myMembership:{isFavorite:false},permissions:{canEditMetadata:true,canEditCanvas:true,canTrash:true,canRestore:false,canPermanentlyDelete:false},pageCount:1,firstPageId:id,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-02T00:00:00Z',deletedAt:null,expiresAt:null};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>{if(status===204)throw Error('empty');return body;}});
function fixture(fetchImpl){let session='1:1';const auth={getSessionKey:()=>session,getConnectionOptions:()=>({baseUrl:'https://api.example/api/v1'}),getAccessToken:async()=> 'jwt'};return {api:createAuthenticatedDiaryApi({auth,userId:'1',fetchImpl}),logout:()=>{session=null;}};}
test('trash consumes 204 without JSON and restore is a bodyless POST',async()=>{
 const calls=[];const {api}=fixture(async(url,options)=>{calls.push({url,...options});return options.method==='DELETE'?response(null,204):response({diary:row});});
 assert.equal(await api.trash(id),null);assert.equal((await api.restore(id)).version,'3');
 assert.equal(calls[0].method,'DELETE');assert.equal(calls[1].url,`https://api.example/api/v1/diaries/${id}/restore`);
 for(const call of calls){assert.equal(call.body,undefined);assert.equal(call.headers['Idempotency-Key'],undefined);assert.equal(call.headers.Authorization,'Bearer jwt');assert.equal(call.url.includes('permanent'),false);}
 assert.equal(typeof api.permanentlyDelete,'function');
});
test('invalid status and mismatched or trashed restore responses are rejected',async()=>{
 await assert.rejects(fixture(async()=>response({},200)).api.trash(id),{code:'INVALID_RESPONSE'});
 for(const bad of [{...row,diaryId:id.replace(/1$/,'2')},{...row,myRole:'EDITOR'},{...row,deletedAt:row.updatedAt}])await assert.rejects(fixture(async()=>response({diary:bad})).api.restore(id),{code:'INVALID_RESPONSE'});
 await assert.rejects(fixture(async()=>response(null,204)).api.restore('bad'),{status:400});
});
test('server permissions decide restore and expiry independently of the device clock',()=>{
 const trashed={...row,deletedAt:'2000-01-01T00:00:00Z',expiresAt:'2000-01-31T00:00:00Z',permissions:{...row.permissions,canTrash:false,canEditMetadata:false,canRestore:true}};
 assert.equal(toAuthenticatedDiary(trashed).canRestore,true);assert.equal(toAuthenticatedDiary(trashed).canTrash,false);
 assert.equal(toAuthenticatedDiary({...trashed,permissions:{...trashed.permissions,canRestore:false}}).retentionStatus,'EXPIRED');
 assert.equal(toAuthenticatedDiary({...row,myRole:'EDITOR'}).canTrash,false);
});
test('expiry and permission errors block retries while network failures keep the same target',async()=>{
 for(const status of [401,403,404,410]){
  let calls=0;const model=createAccountDiaryLifecycle(fixture(async()=>{calls++;return response({code:status===410?'DIARY_RESTORE_EXPIRED':'DENIED'},status);}).api);
  await model.run({kind:'restore',id});await model.retry();assert.equal(calls,1);assert.equal(model.getSnapshot().canRetry,false);assert.equal(model.getSnapshot().error.status,status);model.reset();
 }
 let calls=[],lose=true;const model=createAccountDiaryLifecycle({trash:async(target)=>{calls.push(target);if(lose){lose=false;throw Error('lost');}return null;}});
 await model.run({kind:'trash',id});await model.run({kind:'trash',id:'different'});assert.deepEqual(calls,[id]);await model.retry();assert.deepEqual(calls,[id,id]);assert.equal(model.getSnapshot().status,'success');
});
test('double tap shares one request and logout discards a late successful response',async()=>{
 let finish,calls=0;const f=fixture(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});const model=createAccountDiaryLifecycle(f.api);
 const a=model.run({kind:'trash',id}),b=model.run({kind:'trash',id});assert.equal(a,b);await new Promise(resolve=>setTimeout(resolve,0));
 f.logout();model.reset();finish(response(null,204));await a;assert.equal(calls,1);assert.equal(model.getSnapshot().status,'idle');
});
test('actual Spring trash list and restored DTO satisfy FE contract',{skip:!process.env.DIO_DIARY_TRASH_CONTRACT_OUTPUT||!process.env.DIO_DIARY_RESTORE_CONTRACT_OUTPUT},async()=>{
 const page=JSON.parse(readFileSync(process.env.DIO_DIARY_TRASH_CONTRACT_OUTPUT,'utf8')),restored=JSON.parse(readFileSync(process.env.DIO_DIARY_RESTORE_CONTRACT_OUTPUT,'utf8'));
 const f=fixture(async url=>response(url.endsWith('/restore')?restored:page));assert.equal((await f.api.list({query:{status:'trashed'}})).items[0].canRestore,true);
 const result=await f.api.restore(restored.diary.diaryId);assert.equal(result.trashedAt,null);assert.equal(result.canTrash,true);assert.equal(result.version,'3');
});
