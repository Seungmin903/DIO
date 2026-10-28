import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMemberDiaryApi} from '../src/diary/services/memberDiaryApi.js';
import {createMemberAppStore} from '../src/diary/services/memberAppStore.js';
import {memberKeys} from '../src/diary/services/memberStorage.js';
const id='11111111-2222-4333-8444-555555555555';
function fixture(){
 const keys=memberKeys('101'),values=new Map([[keys.doc(id),'existing-local-doc'],['other-session','preserved']]);
 let present=true,calls=0,lost=false,fail=false,error=null,hold=null,permission=true;
 const api={list:async()=>{if(fail)throw Error('refresh failed');return {items:[],hasNext:false,nextCursor:null}},
   trashList:async()=>({items:present?[{id,title:'owned',canRestore:true,canPermanentlyDelete:permission}]:[],hasNext:false,nextCursor:null}),
   purge:async()=>{calls++;if(hold)await hold;if(error)throw error;present=false;if(lost){lost=false;throw Error('lost response')}}};
 const store=createMemberAppStore({accountId:'101',api,storage:{getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)}});
 return {store,values,keys,api,get calls(){return calls},set lost(x){lost=x},set fail(x){fail=x},set error(x){error=x},set hold(x){hold=x},set permission(x){permission=x}};
}
test('실제 Spring의 영구 삭제·완료 재시도 204와 명시적 휴지통 권한을 소비한다',async()=>{
 const source=JSON.parse(await readFile(new URL('../../backend/build/contracts/member-diary-purge-http.json',import.meta.url),'utf8')),calls=[];
 const api=createMemberDiaryApi(async req=>{calls.push(req);return req.method==='DELETE'?null:source.trash});
 const page=await api.trashList();assert.equal(page.items[0].canPermanentlyDelete,true);
 await api.purge(page.items[0].id);await api.purge(page.items[0].id);
 assert.equal(source.purge.status,204);assert.equal(source.purge.body,'');assert.equal(source.retryStatus,204);
 for(const req of calls.slice(1)){assert.equal(req.method,'DELETE');assert.equal(req.path,`/member/diaries/${page.items[0].id}/purge`);assert.equal(req.body,undefined);assert.equal(req.query,undefined);}
 for(const value of [undefined,null,'true',1])await assert.rejects(createMemberDiaryApi(async()=>({...source.trash,items:[{...source.trash.items[0],canPermanentlyDelete:value}]})).trashList(),{code:'INVALID_RESPONSE'});
 await assert.rejects(api.purge('bad-id'),{code:'INVALID_RESPONSE'});
});
test('영구 삭제 응답 유실은 같은 대상 재시도, 중복 탭은 한 요청으로 합친다',async()=>{
 const f=fixture();await f.store.load();await f.store.loadTrash();f.lost=true;
 const a=f.store.lifecycle('purge',id),b=f.store.lifecycle('purge',id);assert.equal(a,b);await assert.rejects(a,/lost/);
 await assert.rejects(f.store.lifecycle('restore',id),{code:'OPERATION_PENDING'});await f.store.retryLifecycle();
 assert.equal(f.calls,2);assert.deepEqual(f.store.getSnapshot().trash,[]);assert.equal(f.values.get('other-session'),'preserved');assert.equal(f.values.get(f.keys.doc(id)),'existing-local-doc');
});
test('삭제 성공 후 목록 실패는 DELETE를 보내지 않고 조회만 재시도한다',async()=>{
 const f=fixture();await f.store.load();await f.store.loadTrash();f.fail=true;
 await assert.rejects(f.store.lifecycle('purge',id),/refresh failed/);assert.equal(f.store.getSnapshot().lifecycle.resultKnown,true);
 f.fail=false;await f.store.retryLifecycle();assert.equal(f.calls,1);assert.deepEqual(f.store.getSnapshot().trash,[]);
});
test('401·403·404·409는 쓰기 재시도를 멈추고 권한 부재는 요청을 차단한다',async()=>{
 for(const status of [401,403,404,409]){const f=fixture();await f.store.load();await f.store.loadTrash();f.error=Object.assign(Error('terminal'),{status});await assert.rejects(f.store.lifecycle('purge',id),{status});assert.equal(f.store.getSnapshot().lifecycle.canRetry,false);assert.equal(f.calls,1);}
 const f=fixture();f.permission=false;await f.store.load();await f.store.loadTrash();await assert.rejects(f.store.lifecycle('purge',id),{code:'FORBIDDEN'});assert.equal(f.calls,0);
});
test('로그아웃 후 영구 삭제 지연 응답은 계정 캐시를 바꾸지 않는다',async()=>{
 const f=fixture();await f.store.load();await f.store.loadTrash();let release;f.hold=new Promise(r=>release=r);const before=f.values.get(f.keys.index),pending=f.store.lifecycle('purge',id);f.store.dispose();release();await assert.rejects(pending,{code:'STALE_ACCOUNT'});assert.equal(f.values.get(f.keys.index),before);
});
test('삭제 전의 지연 휴지통 응답은 삭제 완료 후 항목을 되살리지 않는다',async()=>{
 const f=fixture();await f.store.load();await f.store.loadTrash();const original=f.api.trashList;let release,slow=true;f.api.trashList=async()=>{if(slow){slow=false;await new Promise(r=>release=r);return {items:[{id,canPermanentlyDelete:true}],hasNext:false,nextCursor:null}}return original()};
 const reading=f.store.loadTrash();reading.catch(()=>{});const deleting=f.store.lifecycle('purge',id);await new Promise(r=>setTimeout(r,0));release();await deleting;await assert.rejects(reading,{code:'LIST_CHANGED'});assert.deepEqual(f.store.getSnapshot().trash,[]);
});
