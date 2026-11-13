import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useGuestDiaryImport.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 let pendingList=[],createdList=[];
 let cursor=0,key='7:1',enabled=true,model,runs=0,imported=0,factoryOptions,progress,lookupError=null,pendingError=null,lookupGate=null,lookups=0,pendingQueries=0,declineError=null,declineGate=null,declines=0,slotsAvailable=5,candidates=[{id:'guest',title:'일기'}];
 const slots=[],effects=[],cleanups=[],notices=[],disk=new Map(),completion=deferred();
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i].deps[j])))slots[i]={deps,value:fn()};return slots[i].value;};
 const react={useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useRef:value=>{const i=cursor++;return slots[i]??=({current:value});},useState:value=>{const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i][j]))){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}};
 const mocks={react,'../../shared/dialogs':{notify:(...args)=>notices.push(args)},'../../editor/services/documentStorage':{__esModule:true,default:{getItem:async key=>disk.get(key)??null}},'expo/fetch':{fetch(){}},'../../auth/authService':{authService:{getSessionKey:()=>key},apiBaseUrl:'https://qa.test/api/v1',accessTokenHeader:'Authorization'},'../services/memberDiaryApi.js':{createMemberDiaryApi:()=>({})},'../services/memberTransport.js':{createAuthenticatedMemberTransport:()=>()=>{}},'../services/memberStorage.js':{memberKeys:()=>({doc:id=>id})},'../services/guestOriginalCleanup':{guestOriginalCleanup:{}},'../services/guestDiaryImport.js':{createGuestDiaryImporter:options=>{factoryOptions=options;return {availableSlots:async()=>slotsAvailable,pendingIds:async(options={})=>{pendingQueries++;if(pendingError)throw pendingError;return options.createdOnly?createdList:pendingList;},run:async(targets,options)=>{runs++;progress=options.onProgress;return completion.promise;}};},sweepMovedGuestDiaries:async()=>{},removeGuestOriginal:async()=>true,dismissGuestImport:async()=>{declines++;if(declineGate)await declineGate;if(declineError)throw declineError;},listGuestImportCandidates:async()=>{lookups++;if(lookupGate)await lookupGate;if(lookupError)throw lookupError;return {diaries:candidates,unasked:candidates};},withUploadRetry:f=>f},'../../collaboration/canvasApi.js':{createCanvasApi:()=>({})},'../../collaboration/canvasMedia.js':{createCanvasMedia:()=>({}),createMediaRequest:()=>()=>{}},'../../editor/services/canvasMediaFiles':{canvasMediaFiles:{}},'../../editor/utils/storageContract.js':{STORAGE_KEYS:{doc:'doc'}},'../../editor/utils/common.js':{createId:()=>''}};
 mocks['../../editor/utils/mediaRepository']={entries:async()=>[]};
 mocks['../../collaboration/canvasMedia.js'].createMediaRequest=options=>{assert.equal(options.photoEntries,mocks['../../editor/utils/mediaRepository'].entries);return ()=>{};};
 const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id],mod,mod.exports);
 const render=()=>{cursor=0;model=mod.exports.useGuestDiaryImport('7',{enabled,onImported:()=>imported++});while(effects.length)effects.shift()();return model;};
 return {render,notices,setPendingIds:value=>pendingList=value,setCreatedIds:value=>createdList=value,get declines(){return declines;},setDeclineError:value=>declineError=value,setDeclineGate:value=>declineGate=value,setLookupError:value=>lookupError=value,setPendingError:value=>pendingError=value,setLookupGate:value=>lookupGate=value,setCandidates:value=>candidates=value,setSlots:value=>slotsAvailable=value,get lookups(){return lookups;},get pendingQueries(){return pendingQueries;},setEnabled:value=>enabled=value,setSession:value=>key=value,unmount:()=>cleanups.forEach(fn=>fn?.()),finish:()=>completion.resolve({imported:[{guestDiaryId:'guest',diaryId:'server',skipped:[]}],failed:[]}),get runs(){return runs;},get imported(){return imported;},get options(){return factoryOptions;},disk,emit:()=>progress?.({guestDiaryId:'guest',done:1,total:2})};
}
test('남은 한 자리까지만 게스트 다이어리를 선택할 수 있다', async () => {
 const ui = fixture();
 ui.setCandidates([{id:'guest',title:'첫째'},{id:'second',title:'둘째'}]);
 ui.setSlots(1);
 ui.render(); await tick();
 const model = ui.render();
 assert.equal(model.slots, 1);
 assert.equal(model.selected.size, 0);
 model.toggle('guest');
 model.toggle('second');
 assert.deepEqual([...ui.render().selected], ['guest']);
 ui.render().toggle('guest');
 ui.render().toggle('second');
 assert.deepEqual([...ui.render().selected], ['second']);
 ui.unmount();
});

test('서버 생성 전 재개 항목도 남은 한 자리를 차지한다', async () => {
 const ui=fixture();ui.setCandidates([{id:'resume',title:'재개'},{id:'new',title:'새 항목'}]);ui.setPendingIds(['resume']);ui.setCreatedIds([]);ui.setSlots(1);
 ui.render();await tick();
 assert.equal(ui.render().pending.has('resume'),false);
 ui.render().toggle('resume');ui.render().toggle('new');
 assert.deepEqual([...ui.render().selected],['resume']);ui.unmount();
});

test('서버 다이어리가 있는 재개 항목만 남은 자리 없이 선택할 수 있다', async () => {
 const ui=fixture();ui.setCandidates([{id:'resume',title:'재개'},{id:'new',title:'새 항목'}]);ui.setPendingIds(['resume']);ui.setCreatedIds(['resume']);ui.setSlots(0);
 ui.render();await tick();
 assert.deepEqual([...ui.render().selected],['resume']);
 ui.render().toggle('new');assert.deepEqual([...ui.render().selected],['resume']);ui.unmount();
});

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


test('나중에 저장 성공은 안내를 닫고 오류 알림을 만들지 않는다',async()=>{
 const ui=fixture();ui.render();await tick();await ui.render().later();
 assert.equal(ui.render().phase,null);assert.equal(ui.declines,1);assert.deepEqual(ui.notices,[]);assert.equal(ui.runs,0);ui.unmount();
});

test('나중에 저장 실패는 기존 notify로 원본 보존과 다음 로그인 재안내 가능성을 알린다',async()=>{
 const ui=fixture();ui.setDeclineError(Error('disk failure'));ui.disk.set('original','keep');ui.render();await tick();
 await ui.render().later();assert.equal(ui.render().phase,null);assert.equal(ui.notices.length,1);
 assert.equal(ui.notices[0][0],'선택을 저장하지 못했어요');assert.match(ui.notices[0][1],/다음 로그인/);
 assert.equal(ui.disk.get('original'),'keep');assert.equal(ui.runs,0);ui.unmount();
});

test('저장 실패가 세션 변경·화면 종료 뒤 도착하면 다른 계정에 오류 알림을 표시하지 않는다',async()=>{
 const ui=fixture(),gate=deferred();ui.setDeclineGate(gate.promise);ui.setDeclineError(Error('late failure'));ui.render();await tick();
 const saving=ui.render().later();ui.unmount();ui.setSession('8:1');gate.resolve();await saving;
 assert.deepEqual(ui.notices,[]);assert.equal(ui.declines,1);
});

test('나중에 연속 선택은 저장이 끝나기 전 중복 요청을 만들지 않는다',async()=>{
 const ui=fixture(),gate=deferred();ui.setDeclineGate(gate.promise);ui.render();await tick();
 const model=ui.render(),first=model.later(),second=model.later();assert.equal(ui.declines,1);
 gate.resolve();await Promise.all([first,second]);assert.deepEqual(ui.notices,[]);ui.unmount();
});

test('잠긴 상태의 나중에 호출은 저장과 알림을 실행하지 않는다',async()=>{
 const ui=fixture();ui.setEnabled(false);await ui.render().later();assert.equal(ui.declines,0);assert.deepEqual(ui.notices,[]);ui.unmount();
});

test('나중에로 닫아도 입구에서 다시 열 수 있다',async()=>{
 const ui=fixture();ui.render();await tick();await ui.render().later();assert.equal(ui.render().phase,null);assert.equal(ui.render().waiting.length,1);
 ui.render().open();assert.equal(ui.render().phase,'ask');assert.equal(ui.render().candidates.length,1);ui.unmount();
});
