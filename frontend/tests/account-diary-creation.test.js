import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAccountDiaryCreation} from '../src/diary/services/accountDiaryCreation.js';
import {createAuthenticatedDiaryApi,accountDiaryCreateInput} from '../src/diary/services/authenticatedDiaryApi.js';
const key='00000000-0000-4000-8000-000000000001';
const values={title:' My diary ',color:'#aabbcc',pattern:'linen',pageSize:'portrait'};
function memory(){const rows=new Map();return {rows,async getItem(k){return rows.get(k)||null;},async setItem(k,v){rows.set(k,v);},async removeItem(k){rows.delete(k);}};}
test('creation sends only the agreed blank-page contract',()=>{
  assert.deepEqual(accountDiaryCreateInput({...values,templateConfig:{unsupported:true},ownerUserId:'2'}),{diaryTitle:'My diary',coverColor:'#AABBCC',coverStyle:'LINEN',firstPage:{type:'BLANK',orientation:'portrait'}});
  for(const patch of [{title:''},{title:'a\nb'},{color:'red'},{pattern:'unknown'},{pageSize:'square'}])assert.throws(()=>accountDiaryCreateInput({...values,...patch}));
});
test('double submission is a single request persisted before HTTP',async()=>{
  const storage=memory();let calls=0,finish;
  const creator=createAccountDiaryCreation({create:async(input,options)=>{calls++;assert.equal(storage.rows.size,1);assert.equal(options.requestId,key);return new Promise(resolve=>{finish=resolve;});}},{storage,userId:'1',makeKey:()=>key});
  await creator.load();const a=creator.run(values),b=creator.run(values);assert.equal(a,b);await Promise.resolve();finish({id:'created'});await a;
  assert.equal(calls,1);assert.equal(creator.getSnapshot().status,'success');assert.equal(storage.rows.size,0);
});
test('lost response keeps original key and input over closing and application restart',async()=>{
  const storage=memory(),calls=[];let lose=true;
  const api={create:async(input,options)=>{calls.push({input,options});if(lose){lose=false;throw Error('lost after commit');}return {id:'original'};}};
  const a=createAccountDiaryCreation(api,{storage,userId:'1',makeKey:()=>key});await a.load();await a.run(values);
  await a.run({...values,title:'must not replace'});assert.equal(calls.length,1);a.dispose();
  const b=createAccountDiaryCreation(api,{storage,userId:'1',makeKey:()=>{throw Error('must not allocate a new key');}});await b.load();await b.retry();
  assert.deepEqual(calls[0],calls[1]);assert.equal(b.getSnapshot().result.id,'original');assert.equal(storage.rows.size,0);
});
test('pending intent does not leak to another user and late logout response cannot update UI',async()=>{
  const storage=memory();let finish;
  const a=createAccountDiaryCreation({create:()=>new Promise(resolve=>{finish=resolve;})},{storage,userId:'1',makeKey:()=>key});
  await a.load();const pending=a.run(values);await Promise.resolve();a.dispose();finish({id:'late'});await pending;
  assert.equal(storage.rows.size,1);
  const b=createAccountDiaryCreation({},{storage,userId:'2',makeKey:()=>key});await b.load();assert.equal(b.getSnapshot().status,'idle');assert.equal(b.getSnapshot().input,null);
});
test('storage failure before dispatch never sends an untracked request',async()=>{
  let calls=0;const storage=memory();storage.setItem=async()=>{throw Error('disk failure');};
  const creator=createAccountDiaryCreation({create:async()=>{calls++;}},{storage,userId:'1',makeKey:()=>key});await creator.load();await creator.run(values);
  assert.equal(calls,0);assert.equal(creator.getSnapshot().status,'error');assert.equal(creator.getSnapshot().canRetry,true);
});
test('failure clearing a successful receipt retries the same key',async()=>{
  const storage=memory(),remove=storage.removeItem;let fail=true;storage.removeItem=async k=>{if(fail){fail=false;throw Error('disk failure');}return remove(k);};
  const keys=[];const creator=createAccountDiaryCreation({create:async(_,options)=>{keys.push(options.requestId);return {id:'same'};}},{storage,userId:'1',makeKey:()=>key});
  await creator.load();await creator.run(values);await creator.retry();assert.deepEqual(keys,[key,key]);assert.equal(creator.getSnapshot().status,'success');
});
test('409 expiry cannot silently replace the request or mint a new key',async()=>{
  const storage=memory();let count=0;
  const creator=createAccountDiaryCreation({create:async()=>{count++;throw Object.assign(Error('expired'),{status:409,code:'IDEMPOTENCY_KEY_EXPIRED'});}},{storage,userId:'1',makeKey:()=>key});
  await creator.load();await creator.run(values);await creator.retry();await creator.run(values);assert.equal(count,1);assert.equal(storage.rows.size,1);
  await creator.discard();assert.equal(storage.rows.size,0);assert.equal(creator.getSnapshot().status,'idle');
});
test('corrupt persisted intent blocks creation until explicitly cleared',async()=>{
  const storage=memory();await storage.setItem('dio:account-diary-creation:v1:1','broken');
  const creator=createAccountDiaryCreation({create:()=>{throw Error('must not send');}},{storage,userId:'1',makeKey:()=>key});
  await creator.load();assert.equal(creator.getSnapshot().status,'blocked');await creator.run(values);await creator.discard();assert.equal(creator.getSnapshot().status,'idle');
});
test('POST adapter consumes actual Spring creation response',{skip:!process.env.DIO_DIARY_CREATE_CONTRACT_OUTPUT},async()=>{
  const body=JSON.parse(readFileSync(process.env.DIO_DIARY_CREATE_CONTRACT_OUTPUT,'utf8'));
  const auth={getSessionKey:()=> '1:1',getConnectionOptions:()=>({baseUrl:'https://api.example/api/v1'}),getAccessToken:async()=> 'token'};
  const api=createAuthenticatedDiaryApi({auth,userId:'1',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.example/api/v1/diaries');assert.equal(options.method,'POST');assert.equal(options.headers['Idempotency-Key'],key);
    assert.deepEqual(JSON.parse(options.body),accountDiaryCreateInput(values));return {ok:true,status:201,json:async()=>body};}});
  const result=await api.create(values,{requestId:key});assert.equal(result.role,'OWNER');assert.equal(result.pageCount,1);assert.equal(result.firstPageId,body.firstPageId);
});
