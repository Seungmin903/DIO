import test from 'node:test'
import assert from 'node:assert/strict'
import { createTermsConsentApi, createTermsConsentRuntime, optionalTerms, readTermsConsents } from '../src/auth/termsConsent.js'

const agreements = () => optionalTerms.map(item => ({termsType:item.termsType,termsVersion:'v3',agreed:false,agreedAt:null,recordStatus:'NOT_RECORDED'}))
const stamp = '2026-11-03T12:00:00.123456Z'
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return { promise,resolve,reject } }
test('선택 동의 4종은 조회한 v3 버전의 각 PUT에 boolean만 전송한다', async () => {
  const calls=[]
  const api=createTermsConsentApi(async input=>{calls.push(input);return {termsType:input.path.split('/')[3],termsVersion:'v3',agreed:input.body.agreed,agreedAt:stamp}})
  for(const item of optionalTerms) for(const agreed of [true,false]) {
    assert.equal((await api.update(item.termsType,agreed,'v3')).agreed,agreed)
    assert.deepEqual(calls.at(-1),{method:'PUT',path:`/me/terms/${item.termsType}/v3`,body:{agreed}})
  }
  assert.equal(calls.length,8)
})
test('필수 약관 철회·알 수 없는 항목·boolean 아닌 값은 요청 전에 거부한다', async()=>{
  let calls=0;const api=createTermsConsentApi(async()=>{calls++})
  for(const type of ['SERVICE','PRIVACY'])await assert.rejects(api.update(type,false),{code:'REQUIRED_TERMS_NOT_AGREED'})
  for(const [type,agreed] of [['MARKETING',true],['UNKNOWN',true],['toString',true],['AD_PUSH','true']])await assert.rejects(api.update(type,agreed),{code:'INVALID_TERMS'})
  assert.equal(calls,0)
})
test('GET의 버전·기록 상태와 PUT 응답을 검증한다',async()=>{
 const calls=[]; const rows=agreements(); rows[1].recordStatus='PREVIOUS_VERSION_ONLY';
 const api=createTermsConsentApi(async input=>{calls.push(input);return {agreements:rows}});
 assert.equal((await api.load()).AD_EMAIL.recordStatus,'PREVIOUS_VERSION_ONLY');
 assert.deepEqual(calls,[{method:'GET',path:'/me/terms'}]);
 for(const bad of [[],[...rows,rows[0]],rows.map((r,i)=>i?r:{...r,recordStatus:'UNKNOWN'}),rows.map((r,i)=>i?r:{...r,agreed:true}),rows.map((r,i)=>i?r:{...r,termsVersion:''})])
  assert.throws(()=>readTermsConsents(bad),{code:'INVALID_TERMS_RESPONSE'});
 const valid={termsType:'AD_EMAIL',termsVersion:'v3',agreed:false,agreedAt:stamp};
 for(const row of [null,{...valid,termsType:'AD_PUSH'},{...valid,termsVersion:'v2'},{...valid,agreed:true},{...valid,agreedAt:null}])
  await assert.rejects(createTermsConsentApi(async()=>row).update('AD_EMAIL',false,'v3'),{code:'INVALID_TERMS_RESPONSE'});
})
function fixture(){
  let key='101:1',user='101',calls=0;const gate=deferred()
  const auth={getSessionKey:()=>key,getCurrentUserId:()=>user}
  const runtime=createTermsConsentRuntime({auth,accountId:'101',api:{load:async()=>readTermsConsents(agreements()),update:()=>{calls++;return gate.promise}}})
  return {runtime,gate,calls:()=>calls,change:()=>{key='202:2';user='202'}}
}
test('같은 항목 연타는 동일 Promise로 합치며 반대 선택은 처리 중 거부한다',async()=>{
  const f=fixture();await f.runtime.load();const first=f.runtime.update('AD_PUSH',true)
  assert.equal(first,f.runtime.update('AD_PUSH',true));assert.equal(f.calls(),1)
  await assert.rejects(f.runtime.update('AD_PUSH',false),{code:'TERMS_PENDING'})
  f.gate.resolve({agreed:true});await first
})
for(const rejected of [false,true])test(`계정 전환 뒤 늦은 ${rejected?'실패':'성공'} 응답을 차단한다`,async()=>{
  const f=fixture();await f.runtime.load();const p=f.runtime.update('AD_PUSH',true),check=assert.rejects(p,{code:'STALE_ACCOUNT'})
  f.change();if(rejected)f.gate.reject(Error('offline'));else f.gate.resolve({agreed:true})
  await check
})
test('종료 후 호출은 동기 예외 없이 거부하고 서버에 보내지 않는다',async()=>{
  const f=fixture();f.runtime.dispose();let promise
  assert.doesNotThrow(()=>{promise=f.runtime.update('AD_EMAIL',false)})
  await assert.rejects(promise,{code:'STALE_ACCOUNT'});assert.equal(f.calls(),0)
})
test('서버 오류 코드와 동의 선택을 보존하여 같은 값으로 재시도한다',async()=>{
  let count=0;const error=Object.assign(Error('invalid version'),{code:'INVALID_TERMS',status:400})
  const api=createTermsConsentApi(async input=>{if(input.method==='GET')return {agreements:agreements()};if(count++===0)throw error;return {termsType:'AD_PUSH',termsVersion:'v3',agreed:input.body.agreed,agreedAt:stamp}})
  const runtime=createTermsConsentRuntime({auth:{getSessionKey:()=>'a',getCurrentUserId:()=>'101'},accountId:'101',api})
  await runtime.load()
  await assert.rejects(runtime.update('AD_PUSH',false),{code:'INVALID_TERMS',status:400})
  assert.equal((await runtime.update('AD_PUSH',false)).agreed,false)
})

test('조회 전 변경 차단·조회 중복 방지·계정 전환 후 조회 차단',async()=>{
 let session='a',count=0;const gate=deferred();
 const runtime=createTermsConsentRuntime({auth:{getSessionKey:()=>session,getCurrentUserId:()=>'101'},accountId:'101',api:{load:()=>{count++;return gate.promise}}});
 await assert.rejects(runtime.update('AD_PUSH',true),{code:'TERMS_NOT_READY'});
 const p=runtime.load();assert.equal(p,runtime.load());assert.equal(count,1);
 const check=assert.rejects(p,{code:'STALE_ACCOUNT'});session='b';gate.resolve(readTermsConsents(agreements()));await check;
})
test('저장 중 재조회는 이전 값으로 덮어쓰지 않는다',async()=>{
 const f=fixture();await f.runtime.load();const p=f.runtime.update('AD_PUSH',true);
 await assert.rejects(f.runtime.load(),{code:'TERMS_PENDING'});f.gate.resolve({agreed:true});await p;
})

test('현재 버전의 철회 기록은 그대로 읽고 재진입하면 저장된 서버 상태를 다시 조회한다',async()=>{
 const rows=agreements();rows[0]={...rows[0],recordStatus:'CURRENT_VERSION',agreed:false,agreedAt:stamp};
 let reads=0;
 const api=createTermsConsentApi(async input=>{
  if(input.method==='GET'){reads++;return {agreements:rows};}
  const row=rows.find(r=>r.termsType===input.path.split('/')[3]);
  Object.assign(row,{agreed:input.body.agreed,agreedAt:stamp,recordStatus:'CURRENT_VERSION'});return row;
 });
 const options={auth:{getSessionKey:()=>'a',getCurrentUserId:()=>'101'},accountId:'101',api};
 const first=createTermsConsentRuntime(options);assert.equal((await first.load()).MARKETING_PRIVACY.agreed,false);
 await first.update('AD_EMAIL',true);first.dispose();
 const second=createTermsConsentRuntime(options);assert.equal((await second.load()).AD_EMAIL.agreed,true);assert.equal(reads,2);
})
