import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useGuestDiaryImport.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 let cursor=0,key='7:1',enabled=true,model,runs=0,imported=0,factoryOptions,progress,lookupError=null,pendingError=null,lookupGate=null,lookups=0,pendingQueries=0,candidates=[{id:'guest',title:'일기'}];
 const slots=[],effects=[],cleanups=[],disk=new Map(),completion=deferred();
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i].deps[j])))slots[i]={deps,value:fn()};return slots[i].value;};
 const react={useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useRef:value=>{const i=cursor++;return slots[i]??=({current:value});},useState:value=>{const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i][j]))){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}};
 const mocks={react,'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>disk.get(key)??null}},'expo/fetch':{fetch(){}},'../../auth/authService':{authService:{getSessionKey:()=>key},apiBaseUrl:'https://qa.test/api/v1',accessTokenHeader:'Authorization'},'../services/memberDiaryApi.js':{createMemberDiaryApi:()=>({})},'../services/memberTransport.js':{createAuthenticatedMemberTransport:()=>()=>{}},'../services/memberStorage.js':{memberKeys:()=>({doc:id=>id})},'../services/guestDiaryImport.js':{createGuestDiaryImporter:options=>{factoryOptions=options;return {pendingIds:async()=>{pendingQueries++;if(pendingError)throw pendingError;return [];},run:async(targets,options)=>{runs++;progress=options.onProgress;return completion.promise;}};},declineGuestImport:async()=>{},listGuestImportCandidates:async()=>{lookups++;if(lookupGate)await lookupGate;if(lookupError)throw lookupError;return {diaries:candidates,declined:false};},withUploadRetry:f=>f},'../../collaboration/canvasApi.js':{createCanvasApi:()=>({})},'../../collaboration/canvasMedia.js':{createCanvasMedia:()=>({}),createMediaRequest:()=>()=>{}},'../../editor/services/canvasMediaFiles':{canvasMediaFiles:{}},'../../editor/utils/storageContract.js':{STORAGE_KEYS:{doc:'doc'}},'../../editor/utils/common.js':{createId:()=>''}};
 const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id],mod,mod.exports);
 const render=()=>{cursor=0;model=mod.exports.useGuestDiaryImport('7',{enabled,onImported:()=>imported++});while(effects.length)effects.shift()();return model;};
 return {render,setLookupError:value=>lookupError=value,setPendingError:value=>pendingError=value,setLookupGate:value=>lookupGate=value,setCandidates:value=>candidates=value,get lookups(){return lookups;},get pendingQueries(){return pendingQueries;},setEnabled:value=>enabled=value,setSession:value=>key=value,unmount:()=>cleanups.forEach(fn=>fn?.()),finish:()=>completion.resolve({imported:[{guestDiaryId:'guest',diaryId:'server',skipped:[]}],failed:[]}),get runs(){return runs;},get imported(){return imported;},get options(){return factoryOptions;},disk,emit:()=>progress?.({guestDiaryId:'guest',done:1,total:2})};
}
test('연속 시작은 한 번만 실행하고 잠금 중에는 안내를 숨긴다',async()=>{
 const ui=fixture();ui.render();await tick();const model=ui.render();assert.equal(model.phase,'ask');
 const first=model.start();model.start();assert.equal(ui.runs,1);ui.setEnabled(false);assert.equal(ui.render().phase,null);
 ui.finish();await first;ui.setEnabled(true);assert.equal(ui.render().phase,'done');assert.equal(ui.imported,1);ui.unmount();
});
test('로그아웃과 화면 종료 뒤 이전 완료·진행 응답은 결과를 갱신하지 않는다',async()=>{
 const ui=fixture();ui.render();await tick();const first=ui.render().start();ui.unmount();ui.setSession('8:1');ui.emit();ui.finish();await first;assert.equal(ui.imported,0);assert.equal(ui.options.isActive(),false);
});
test('로컬 JSON 파싱 실패를 빈 문서로 전달하지 않는다',async()=>{
 const ui=fixture();ui.render();ui.disk.set('doc:broken','{invalid');await assert.rejects(ui.options.loadGuestDoc({id:'broken'}),error=>error.code==='INVALID_LOCAL_DOCUMENT');ui.unmount();
});

test('나중에를 고르면 같은 로그인에서 잠금 해제만으로 다시 묻지 않는다',async()=>{
 const ui=fixture();ui.render();await tick();ui.render().later();assert.equal(ui.render().phase,null);
 ui.setEnabled(false);ui.render();ui.setEnabled(true);ui.render();await tick();assert.equal(ui.render().phase,null);ui.unmount();
});


for (const source of ['candidates','pending']) {
 test(`조회 실패(${source})는 기존 결과 상태로 안내하고 수동 재시도만 후보를 다시 읽는다`,async()=>{
  const ui=fixture(),error=Object.assign(Error('broken record'),{code:'INVALID_LOCAL_CACHE'});
  if(source==='candidates')ui.setLookupError(error);else ui.setPendingError(error);
  ui.disk.set('saved-record','keep');ui.render();await tick();
  const failed=ui.render();assert.equal(failed.phase,'done');assert.equal(failed.failed[0].lookup,true);
  assert.equal(failed.failed[0].error.code,'INVALID_LOCAL_CACHE');assert.match(failed.failed[0].error.message,/기록을 읽지 못했어요/);
  assert.equal(ui.runs,0);const calls=ui.lookups,pending=ui.pendingQueries;
  ui.setEnabled(false);ui.render();ui.setEnabled(true);ui.render();await tick();
  assert.equal(ui.lookups,calls);assert.equal(ui.pendingQueries,pending);
  ui.setLookupError(null);ui.setPendingError(null);ui.render().retry();ui.render();await tick();
  const recovered=ui.render();assert.equal(recovered.phase,'ask');assert.equal(recovered.failed.length,0);
  assert.equal(ui.lookups,calls+1);assert.equal(ui.runs,0);assert.equal(ui.disk.get('saved-record'),'keep');ui.unmount();
 });
}

test('조회 실패를 닫으면 같은 세션의 잠금 해제나 재렌더에서 오류를 반복하지 않는다',async()=>{
 const ui=fixture();ui.setLookupError(Error('read failed'));ui.render();await tick();
 assert.equal(ui.render().failed[0].error.code,'GUEST_IMPORT_LOOKUP_FAILED');ui.render().close();
 const calls=ui.lookups;ui.render();ui.setEnabled(false);ui.render();ui.setEnabled(true);ui.render();await tick();
 assert.equal(ui.render().phase,null);assert.equal(ui.lookups,calls);ui.unmount();
});

test('화면 종료와 세션 변경 뒤 늦은 조회 실패는 결과 상태에 반영하지 않는다',async()=>{
 const ui=fixture(),gate=deferred();ui.setLookupGate(gate.promise);ui.setLookupError(Error('late error'));
 const before=ui.render();ui.unmount();ui.setSession('8:1');gate.resolve();await tick();
 assert.equal(before.phase,null);assert.equal(ui.imported,0);assert.equal(ui.runs,0);
 ui.setLookupError(null);ui.setLookupGate(null);ui.render();await tick();assert.equal(ui.render().phase,'ask');ui.unmount();
});

test('조회 재시도가 복구됐지만 후보가 없으면 가져오기 실행 없이 안내를 닫는다',async()=>{
 const ui=fixture();ui.setPendingError(Object.assign(Error('broken'),{code:'INVALID_LOCAL_CACHE'}));ui.render();await tick();
 assert.equal(ui.render().phase,'done');ui.setPendingError(null);ui.setCandidates([]);ui.render().retry();ui.render();await tick();
 assert.equal(ui.render().phase,null);assert.equal(ui.runs,0);ui.unmount();
});
