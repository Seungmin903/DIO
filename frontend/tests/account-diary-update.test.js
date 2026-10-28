import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountDiaryUpdateInput,accountDiaryUpdatePayload,createAuthenticatedDiaryApi,toAuthenticatedDiary} from '../src/diary/services/authenticatedDiaryApi.js';
import {createDiaryEditor} from '../src/diary/services/diaryEditor.js';
const source={id:'00000000-0000-0000-0000-000000000001',title:'Original',color:'#AABBCC',pattern:null,version:'1',canEdit:true};
const fail=status=>Object.assign(Error('error'),{status});
test('partial edit includes only dirty metadata and string expectedVersion',()=>{
  assert.deepEqual(accountDiaryUpdatePayload(accountDiaryUpdateInput({...source,title:' Changed ',visibility:'LINK'},source)),{expectedVersion:'1',diaryTitle:'Changed'});
  assert.deepEqual(accountDiaryUpdatePayload({version:'9007199254740993',pattern:null}),{expectedVersion:'9007199254740993',coverStyle:'PLAIN'});
  assert.throws(()=>accountDiaryUpdateInput(source,source),{code:'NO_CHANGES'});
  for(const version of [1,null,'0','01','-1','9223372036854775808'])assert.throws(()=>accountDiaryUpdatePayload({version,title:'new'}));
});
test('conflict preserves original draft and rebase only changes version after explicit read',async()=>{
  let latest={...source},calls=[];
  const api={get:async()=>({...latest}),update:async(id,values)=>{calls.push(values);if(values.version!==latest.version)throw fail(409);latest={...latest,...values,version:String(BigInt(latest.version)+1n)};return latest;}};
  const editor=createDiaryEditor(api,accountDiaryUpdateInput);await editor.open(source.id);
  latest={...latest,color:'#112233',version:'2'};const form={...source,title:'My change'};
  await editor.submit(form);assert.equal(editor.getSnapshot().needsReview,true);await editor.submit(form);assert.equal(calls.length,1);
  await editor.refreshLatest();assert.equal(calls.length,1);assert.equal(editor.getSnapshot().source.title,'Original');
  await editor.submit(form);assert.deepEqual(calls[1],{version:'2',title:'My change'});assert.equal(latest.color,'#112233');editor.dispose();
});
test('lost response retries original version then requires conflict review without duplicate overwrite',async()=>{
  let row={...source},calls=[],lose=true;
  const editor=createDiaryEditor({get:async()=>row,update:async(id,input)=>{
    calls.push(input);if(input.version!==row.version)throw fail(409);row={...row,...input,version:'2'};
    if(lose){lose=false;throw Error('lost');}return row;
  }},accountDiaryUpdateInput);
  await editor.open(source.id);await editor.submit({...source,title:'Saved'});editor.close();await editor.open('other');
  await editor.submit({...source,title:'Must not replace'});assert.deepEqual(calls[0],calls[1]);assert.equal(editor.getSnapshot().needsReview,true);
  await editor.refreshLatest();assert.equal(editor.getSnapshot().latest.title,'Saved');editor.dispose();
});
test('permission errors block writes and disposal drops late results',async()=>{
  let calls=0;const editor=createDiaryEditor({get:async()=>source,update:async()=>{calls++;throw fail(403);}},accountDiaryUpdateInput);
  await editor.open(source.id);await editor.submit({...source,title:'new'});await editor.submit({...source,title:'again'});assert.equal(calls,1);assert.equal(editor.getSnapshot().permissionBlocked,true);editor.dispose();
  let finish;const late=createDiaryEditor({get:()=>new Promise(resolve=>{finish=resolve;})},accountDiaryUpdateInput);const pending=late.open(source.id);late.dispose();finish(source);await pending;assert.equal(late.getSnapshot().source,null);
});
test('PATCH consumes actual Spring response with no creation idempotency header',{skip:!process.env.DIO_DIARY_UPDATE_CONTRACT_OUTPUT},async()=>{
  const body=JSON.parse(readFileSync(process.env.DIO_DIARY_UPDATE_CONTRACT_OUTPUT,'utf8'));
  const auth={getSessionKey:()=> '1:1',getConnectionOptions:()=>({baseUrl:'https://api.example/api/v1'}),getAccessToken:async()=> 'token'};
  const api=createAuthenticatedDiaryApi({auth,userId:'1',fetchImpl:async(url,options)=>{
    assert.equal(options.method,'PATCH');assert.equal(options.headers['Idempotency-Key'],undefined);assert.equal(options.headers.Authorization,'Bearer token');
    assert.deepEqual(JSON.parse(options.body),{expectedVersion:'1',diaryTitle:'Changed'});return {ok:true,status:200,json:async()=>body};
  }});
  const result=await api.update(body.diary.diaryId,{version:'1',title:'Changed'});assert.equal(result.version,'2');assert.equal(result.canEdit,true);
  for(const version of [2,'0','01','9223372036854775808'])assert.throws(()=>toAuthenticatedDiary({...body.diary,version}));
  assert.equal(toAuthenticatedDiary({...body.diary,myRole:'EDITOR'}).canEdit,false);
});
