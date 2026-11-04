import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMemberDiaryApi} from '../src/diary/services/memberDiaryApi.js';
import {createMemberAppStore} from '../src/diary/services/memberAppStore.js';
import {memberKeys} from '../src/diary/services/memberStorage.js';
const id='11111111-2222-4333-8444-555555555555';
const row={id,title:'owned',version:'1',canEdit:true,permissions:{canTrash:true},color:'#123456',coverStyle:'PLAIN'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture(){
 const keys=memberKeys('101'),values=new Map([[keys.doc(id),'local-document-kept']]);let trashed=false,version=1,trashCalls=0,restoreCalls=0,lose=false,failList=false,restoreError=null;
 const active=()=>({...row,version:String(version)}),trash=()=>({id,title:'owned',version:String(version),canRestore:!restoreError,trashedAt:'2026-10-01T00:00:00Z',expiresAt:'2026-10-31T00:00:00Z'});
 const api={list:async()=>{if(failList)throw Error('offline');return {items:trashed?[]:[active()],hasNext:false,nextCursor:null}},trashList:async()=>({items:trashed?[trash()]:[],hasNext:false,nextCursor:null}),
  trash:async()=>{trashCalls++;if(!trashed){trashed=true;version++}if(lose){lose=false;throw Error('lost response')}},
  restore:async()=>{restoreCalls++;if(restoreError)throw restoreError;if(trashed){trashed=false;version++}return active()}};
 const storage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)};
 const store=createMemberAppStore({accountId:'101',api,storage,makeRequestId:()=> 'test-key'});
 return {api,store,storage,values,keys,set lose(x){lose=x},set failList(x){failList=x},set restoreError(x){restoreError=x},get trashCalls(){return trashCalls},get restoreCalls(){return restoreCalls},get version(){return version}};
}
test('이동·복원 후 서버 version과 목록을 갱신하고 로컬 문서는 보존한다',async()=>{
 const f=fixture();await f.store.load();await f.store.lifecycle('trash',id);assert.deepEqual(f.store.getSnapshot().diaries,[]);assert.equal(f.store.getSnapshot().trash[0].version,'2');await f.store.lifecycle('restore',id);assert.equal(f.store.getSnapshot().diaries[0].version,'3');assert.deepEqual(f.store.getSnapshot().trash,[]);assert.equal(f.values.get(f.keys.doc(id)),'local-document-kept');
});
test('응답 유실은 동일 대상·동작으로만 재시도하고 중복 탭은 한 요청으로 합친다',async()=>{
 const f=fixture();await f.store.load();f.lose=true;const a=f.store.lifecycle('trash',id),b=f.store.lifecycle('trash',id);assert.equal(a,b);await assert.rejects(a,/lost/);assert.equal(f.store.getSnapshot().lifecycle.canRetry,true);await assert.rejects(f.store.lifecycle('restore',id),{code:'OPERATION_PENDING'});await f.store.retryLifecycle();assert.equal(f.trashCalls,2);assert.equal(f.version,2);
});
test('서버 성공 뒤 목록 실패는 쓰기를 재전송하지 않고 조회만 재시도한다',async()=>{
 const f=fixture();await f.store.load();f.failList=true;await assert.rejects(f.store.lifecycle('trash',id),/offline/);assert.equal(f.store.getSnapshot().lifecycle.resultKnown,true);f.failList=false;await f.store.retryLifecycle();assert.equal(f.trashCalls,1);assert.equal(f.store.getSnapshot().trash.length,1);
});
test('410은 같은 복원 요청을 자동 재시도하지 않고 서버 목록으로 버튼을 갱신한다',async()=>{
 const f=fixture();await f.store.load();await f.store.lifecycle('trash',id);f.restoreError=Object.assign(Error('expired'),{status:410});await assert.rejects(f.store.lifecycle('restore',id),{status:410});assert.equal(f.restoreCalls,1);assert.equal(f.store.getSnapshot().trash[0].canRestore,false);assert.equal(f.store.getSnapshot().lifecycle.canRetry,false);await assert.rejects(f.store.retryLifecycle(),{code:'NO_PENDING_OPERATION'});
});
test('변경 전 시작한 지연 GET은 삭제한 항목을 다시 추가하지 않는다',async()=>{
 const f=fixture();await f.store.load();const old=f.api.list,gate=deferred();let held=true;f.api.list=async()=>{if(held){held=false;await gate.promise;return {items:[row],hasNext:false,nextCursor:null}}return old()};
 const reading=f.store.reload();reading.catch(()=>{});const deleting=f.store.lifecycle('trash',id);await new Promise(r=>setTimeout(r,0));gate.resolve();await deleting;await assert.rejects(reading,{code:'LIST_CHANGED'});assert.deepEqual(f.store.getSnapshot().diaries,[]);
});
test('계정 종료 후 지연 응답은 기존 캐시와 문서를 변경하지 않는다',async()=>{
 const f=fixture();await f.store.load();const before=f.values.get(f.keys.index),gate=deferred();f.api.trash=()=>gate.promise;const pending=f.store.lifecycle('trash',id);f.store.dispose();gate.resolve();await assert.rejects(pending,{code:'STALE_ACCOUNT'});assert.equal(f.values.get(f.keys.index),before);assert.equal(f.values.get(f.keys.doc(id)),'local-document-kept');
});
test('실제 Spring 휴지통·복원 응답의 문자열 version·기한과 본문 없는 쓰기를 소비한다',async()=>{
 const source=JSON.parse(await readFile(new URL('../../backend/build/contracts/member-diary-trash-http.json',import.meta.url),'utf8')),calls=[];const api=createMemberDiaryApi(async req=>{calls.push(req);if(req.method==='DELETE')return null;if(req.method==='POST')return source.restored;return source.trash});
 const listed=await api.trashList();assert.equal(listed.items[0].version,'2');assert.equal(listed.items[0].canPermanentlyDelete,true);const target=listed.items[0].id;await api.trash(target);const restored=await api.restore(target);assert.equal(restored.version,'3');assert.equal(calls[1].body,undefined);assert.equal(calls[2].body,undefined);assert.equal(calls[1].query,undefined);
 for(const bad of [{...source.trash,items:[{...source.trash.items[0],version:2}]},{...source.trash,items:[{...source.trash.items[0],purgeAt:'2026-01-01T00:00:00Z'}]}])await assert.rejects(createMemberDiaryApi(async()=>bad).trashList(),{code:'INVALID_RESPONSE'});
});


test('401·403·404·409는 자동 쓰기 재시도 없이 상태 확인으로 전환한다',async()=>{
 for(const status of [401,403,404,409]){const f=fixture();await f.store.load();let sent=0;f.api.trash=async()=>{sent++;throw Object.assign(Error('terminal'),{status})};await assert.rejects(f.store.lifecycle('trash',id),{status});assert.equal(f.store.getSnapshot().lifecycle.canRetry,false);assert.equal(sent,1);await assert.rejects(f.store.retryLifecycle(),{code:'NO_PENDING_OPERATION'});assert.equal(f.values.get(f.keys.doc(id)),'local-document-kept');}
});
test('명시적 OWNER/복원 권한이 없는 행은 쓰기를 보내지 않는다',async()=>{
 const f=fixture();f.api.list=async()=>({items:[{...row,canEdit:false,permissions:{canTrash:false}}],hasNext:false,nextCursor:null});await f.store.load();await assert.rejects(f.store.lifecycle('trash',id),{code:'FORBIDDEN'});assert.equal(f.trashCalls,0);await assert.rejects(f.store.lifecycle('restore',id),{code:'FORBIDDEN'});assert.equal(f.restoreCalls,0);
});


test('상세 표지와 방향을 단건 이동·재시작·복원 후에도 유지하고 서버 상태가 우선한다', async()=>{
 for (const pageSize of ['portrait','landscape']) for (const cover of [
  {enabled:true,kind:'plain',color:'#ABCDEF',plate:'ribbon',band:{on:false}} ,
  {enabled:true,kind:'photo',photo:{src:'file:///cover.jpg'},plate:'none',band:{on:true,dir:'v',color:'#112233'}},
  {enabled:false},
 ]) {
  const f=fixture();await f.store.load();
  const appearance={cover,pageSize,templateConfig:{orientation:pageSize},paperAppearance:{color:'#EFEFEF'}};
  await f.store.setDiaries(rows=>rows.map(row=>({...row,...appearance})));
  await f.store.lifecycle('trash',id);
  for(const [key,value] of Object.entries(appearance)) assert.deepEqual(f.store.getSnapshot().trash[0][key],value);
  f.store.dispose();
  const fresh=createMemberAppStore({accountId:'101',api:f.api,storage:f.storage,makeRequestId:()=> 'restart-key'});
  await fresh.load();await fresh.loadTrash();
  assert.equal(fresh.getSnapshot().trash[0].version,'2');
  assert.equal(fresh.getSnapshot().trash[0].canRestore,true);
  for(const [key,value] of Object.entries(appearance)) assert.deepEqual(fresh.getSnapshot().trash[0][key],value);
  await fresh.lifecycle('restore',id);
  for(const [key,value] of Object.entries(appearance)) assert.deepEqual(fresh.getSnapshot().diaries[0][key],value);
  assert.equal(fresh.getSnapshot().diaries[0].trashedAt,null);
  assert.equal(fresh.getSnapshot().diaries[0].version,'3');
 }
});

test('표지 정보 보존 실패 시 서버 삭제를 보내지 않고 기존 자료를 유지한다', async()=>{
 const f=fixture();await f.store.load();
 f.storage.setItem=async()=>{throw Error('disk full')};
 await assert.rejects(f.store.lifecycle('trash',id),/disk full/);
 assert.equal(f.trashCalls,0);assert.equal(f.store.getSnapshot().diaries.length,1);
});


test('손상된 표지 메타는 덮어쓰지 않고 단건·선택 이동을 차단한다',async()=>{
 for(const raw of ['{bad json','null','[]','42','"text"']) for(const bulk of [false,true]) {
  const f=fixture();await f.store.load();f.values.set(f.keys.localMeta,raw);
  if(bulk){const result=await f.store.bulkTrash([id]);assert.equal(result.failed[0].error.code,'INVALID_LOCAL_CACHE')}
  else await assert.rejects(f.store.lifecycle('trash',id),{code:'INVALID_LOCAL_CACHE'});
  assert.equal(f.trashCalls,0);assert.equal(f.values.get(f.keys.localMeta),raw);
  assert.equal(bulk?f.store.getSnapshot().bulkTrash.canRetry:f.store.getSnapshot().lifecycle.canRetry,false);
  assert.equal(f.store.getSnapshot().diaries.length,1);
 }
});


test('ID별 비정상 메타는 문자 인덱스로 펼치지 않고 보존하며 정상 항목은 읽는다',async()=>{
 for(const item of ['broken',null,[],42,true]) {
  const f=fixture();await f.store.load();
  const raw=JSON.stringify({[id]:item,other:{cover:{enabled:false}}});f.values.set(f.keys.localMeta,raw);
  await assert.rejects(f.store.lifecycle('trash',id),{code:'INVALID_LOCAL_CACHE'});
  assert.equal(f.trashCalls,0);assert.equal(f.values.get(f.keys.localMeta),raw);
  await f.store.loadTrash();assert.equal(f.store.getSnapshot().metadataError.code,'LOCAL_METADATA_UNAVAILABLE');
 }
});


test('단건 422 응답은 기존대로 동일 작업의 재시도를 허용한다',async()=>{
 const f=fixture();await f.store.load();let first=true;const trash=f.api.trash;
 f.api.trash=async(...args)=>{if(first){first=false;throw Object.assign(Error('unprocessable'),{status:422})}return trash(...args)};
 await assert.rejects(f.store.lifecycle('trash',id),{status:422});
 assert.equal(f.store.getSnapshot().lifecycle.canRetry,true);
 await f.store.retryLifecycle();assert.equal(f.store.getSnapshot().lifecycle,null);
});
