import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiaryEditor, diaryUpdateInput } from '../src/diary/services/diaryEditor.js';
import { createDiaryApi } from '../src/diary/services/diaryApi.js';
import { createMockDiaryTransport } from '../src/diary/services/mockDiaryTransport.js';

function fixture() {
  const mock = createMockDiaryTransport({ delay: 0 }), calls = [];
  const api = createDiaryApi(options => { calls.push(options); return mock.transport(options); });
  return { mock, api, calls, editor: createDiaryEditor(api) };
}
const form = { title: ' 수정 제목 ', color: '#A9BFA6', pattern: 'gingham', pageSize:'portrait', templateConfig:{malicious:true} };

test('실제 수정 입력은 제목·표지만 매핑하며 생성 설정과 페이지 규격을 수정하지 않는다', () => {
  assert.deepEqual(diaryUpdateInput(form,{version:'1'}),{title:'수정 제목',color:'#A9BFA6',pattern:'gingham',version:'1'});
  assert.throws(()=>diaryUpdateInput({...form,title:' '},{version:'1'}),{status:400});
  assert.throws(()=>diaryUpdateInput(form,{}),{status:409});
});
test('목 수정 권한은 응답 기준이며 없는 필드도 허용으로 해석하지 않는다', async () => {
  const {api,editor}=fixture();
  await editor.open('mock-shared');
  assert.equal(editor.getSnapshot().source,null);assert.equal(editor.getSnapshot().loadError.status,403);
  await assert.rejects(api.update('mock-shared',{title:'금지',version:'1'}),{status:403});
  editor.dispose();
});
test('수정 전 최신 정보 조회 후 취소하면 요청하지 않고 저장하면 제목·색·패턴·버전만 반영한다', async () => {
  const {editor,api,calls}=fixture();
  await editor.open('mock-travel');editor.close();
  assert.equal(calls.filter(c=>c.method==='PATCH').length,0);
  await editor.open('mock-travel');await editor.submit(form);
  assert.equal(editor.getSnapshot().mutation.status,'success');
  const updated=await api.get('mock-travel');
  assert.equal(updated.title,'수정 제목');assert.equal(updated.color,'#A9BFA6');assert.equal(updated.pattern,'gingham');
  assert.equal(updated.pageCount,9);assert.equal(updated.pageSize,'landscape');assert.equal(updated.version,'2');
  assert.equal(calls.find(c=>c.method==='PATCH').body.expectedVersion,'1');
  editor.dispose();
});
test('실제 다른 수정으로 충돌하면 최신 버전 확인 전 재저장하지 않고 원래 폼 source를 보존한다', async () => {
  const {editor,mock,api,calls}=fixture();await editor.open('mock-travel');
  const source=editor.getSnapshot().source;
  mock.simulateEdit('mock-travel',{diaryTitle:'다른 기기 제목',coverPattern:'STRIPE'});
  await editor.submit(form);
  assert.equal(editor.getSnapshot().needsReview,true);
  const before=calls.filter(c=>c.method==='PATCH').length;await editor.submit(form);
  assert.equal(calls.filter(c=>c.method==='PATCH').length,before);
  await editor.refreshLatest();
  assert.equal(editor.getSnapshot().source,source);
  assert.equal(editor.getSnapshot().latest.title,'다른 기기 제목');
  await editor.submit(form);
  assert.equal((await api.get('mock-travel')).title,'수정 제목');
  assert.equal(calls.filter(c=>c.method==='PATCH').at(-1).body.expectedVersion,'2');editor.dispose();
});
test('권한이 저장 직전 바뀌면 저장과 단순 재시도를 막고 최신 권한 재조회 후에만 다시 허용한다', async () => {
  const {editor,mock,calls}=fixture();await editor.open('mock-travel');
  mock.simulateEdit('mock-travel',{canEdit:false});await editor.submit(form);
  assert.equal(editor.getSnapshot().permissionBlocked,true);
  const count=calls.length;await editor.submit(form);assert.equal(calls.length,count);
  await editor.refreshLatest();assert.equal(editor.getSnapshot().latestError.status,403);
  mock.simulateEdit('mock-travel',{canEdit:true});await editor.refreshLatest();
  assert.equal(editor.getSnapshot().permissionBlocked,false);await editor.submit(form);
  assert.equal(editor.getSnapshot().mutation.status,'success');editor.dispose();
});
test('응답 유실 후 닫고 다른 카드로 열어도 같은 수정 요청과 입력으로 결과를 확인한다', async () => {
  const {editor,mock,api,calls}=fixture();await editor.open('mock-travel');
  mock.setWriteScenario('response-lost');await editor.submit(form);editor.close();
  assert.equal(editor.getSnapshot().visible,false);
  await editor.open('mock-shared');assert.equal(editor.getSnapshot().source.id,'mock-travel');
  mock.setWriteScenario('success');await editor.submit({...form,title:'다른 입력'});
  const updates=calls.filter(c=>c.method==='PATCH');assert.equal(updates[0].requestId,updates[1].requestId);
  assert.deepEqual(updates[0].body,updates[1].body);
  assert.equal((await api.get('mock-travel')).version,'2');editor.dispose();
});
test('새 계정 경계나 창 닫기 이후 늦은 조회는 수정 폼을 되살리지 않는다', async () => {
  let finish;
  const editor=createDiaryEditor({get:()=>new Promise(resolve=>{finish=resolve;}),update(){}});
  const pending=editor.open('a');editor.dispose();
  finish({id:'a',title:'이전 계정',version:'1',canEdit:true});await pending;
  assert.equal(editor.getSnapshot().source,null);assert.equal(editor.getSnapshot().visible,false);
});

test('수정 실패 후 휴지통 이동 시 최신 확인으로 저장을 다시 허용하지 않고 복원 후 재개한다', async () => {
  const { editor, mock, api, calls } = fixture();
  await editor.open('mock-travel'); mock.setWriteScenario('fail-once');
  await editor.submit(form); editor.close();
  mock.setWriteScenario('success'); await api.trash('mock-travel');
  await editor.open('mock-travel'); await editor.submit(form);
  assert.equal(editor.getSnapshot().needsReview, true);
  await editor.refreshLatest();
  assert.equal(editor.getSnapshot().latestError.code, 'DIARY_TRASHED');
  assert.equal(editor.getSnapshot().permissionBlocked, true);
  const count = calls.filter(c => c.method === 'PATCH').length;
  await editor.submit(form);
  assert.equal(calls.filter(c => c.method === 'PATCH').length, count);
  editor.close(); await api.restore('mock-travel');
  await editor.open('mock-travel'); await editor.submit(form);
  assert.equal(editor.getSnapshot().mutation.status, 'success'); editor.dispose();
});
test('휴지통 항목을 직접 수정 조회해도 폼을 열지 않는다', async () => {
  const { editor, api } = fixture(); await api.trash('mock-travel');
  await editor.open('mock-travel');
  assert.equal(editor.getSnapshot().source, null);
  assert.equal(editor.getSnapshot().loadError.code, 'DIARY_TRASHED'); editor.dispose();
});
