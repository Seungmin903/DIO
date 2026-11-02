import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useGuestDiaryImport.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 let cursor=0,key='7:1',enabled=true,model,runs=0,imported=0,factoryOptions,progress;
 const slots=[],effects=[],cleanups=[],disk=new Map(),completion=deferred();
 const memo=(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i].deps[j])))slots[i]={deps,value:fn()};return slots[i].value;};
 const react={useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useRef:value=>{const i=cursor++;return slots[i]??=({current:value});},useState:value=>{const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i][j]))){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}};
 const mocks={react,'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async key=>disk.get(key)??null}},'expo/fetch':{fetch(){}},'../../auth/authService':{authService:{getSessionKey:()=>key},apiBaseUrl:'https://qa.test/api/v1',accessTokenHeader:'Authorization'},'../services/memberDiaryApi.js':{createMemberDiaryApi:()=>({})},'../services/memberTransport.js':{createAuthenticatedMemberTransport:()=>()=>{}},'../services/memberStorage.js':{memberKeys:()=>({doc:id=>id})},'../services/guestDiaryImport.js':{createGuestDiaryImporter:options=>{factoryOptions=options;return {pendingIds:async()=>[],run:async(targets,options)=>{runs++;progress=options.onProgress;return completion.promise;}};},declineGuestImport:async()=>{},listGuestImportCandidates:async()=>({diaries:[{id:'guest',title:'일기'}],declined:false}),withUploadRetry:f=>f},'../../collaboration/canvasApi.js':{createCanvasApi:()=>({})},'../../collaboration/canvasMedia.js':{createCanvasMedia:()=>({}),createMediaRequest:()=>()=>{}},'../../editor/services/canvasMediaFiles':{canvasMediaFiles:{}},'../../editor/utils/storageContract.js':{STORAGE_KEYS:{doc:'doc'}},'../../editor/utils/common.js':{createId:()=>''}};
 const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id],mod,mod.exports);
 const render=()=>{cursor=0;model=mod.exports.useGuestDiaryImport('7',{enabled,onImported:()=>imported++});while(effects.length)effects.shift()();return model;};
 return {render,setEnabled:value=>enabled=value,setSession:value=>key=value,unmount:()=>cleanups.forEach(fn=>fn?.()),finish:()=>completion.resolve({imported:[{guestDiaryId:'guest',diaryId:'server',skipped:[]}],failed:[]}),get runs(){return runs;},get imported(){return imported;},get options(){return factoryOptions;},disk,emit:()=>progress?.({guestDiaryId:'guest',done:1,total:2})};
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
