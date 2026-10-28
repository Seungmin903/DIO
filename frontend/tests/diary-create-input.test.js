import test from 'node:test';
import assert from 'node:assert/strict';
import { diaryCreateInput } from '../src/diary/services/diaryCreateInput.js';
import { createDiaryApi } from '../src/diary/services/diaryApi.js';
import { createDiaryCommand, createDiaryMutation } from '../src/diary/services/diaryMutation.js';
import { createMockDiaryTransport } from '../src/diary/services/mockDiaryTransport.js';
import { presetTemplateConfig } from '../src/editor/templates/presets.js';
import { configuredPageIds, templatePageCount } from '../src/editor/templates/creation.js';
import { toServerInitialPageSelections, localTemplateReference } from '../src/editor/templates/serverCatalog.js';

const form = (orientation = 'landscape', dateMode = 'dated') => ({ title: '  새 여행  ', color: '#A9BFA6', pattern: 'dot', pageSize: orientation,
  templateConfig: presetTemplateConfig('schedule', orientation, dateMode), paperAppearance: { backgroundColor:'#FFF8E7',layoutColor:'#33476B' } });

test('실제 생성 입력의 날짜형·만년형·가로·세로·속지 순서와 배색을 요청에 보존한다', () => {
  for (const orientation of ['landscape','portrait']) for (const mode of ['dated','undated']) {
    const source = form(orientation, mode), before = structuredClone(source), input = diaryCreateInput(source);
    assert.equal(input.title, '새 여행'); assert.equal(input.pattern, 'dot');
    assert.equal(input.pageSize, orientation); assert.equal(input.templateConfig.dateMode, mode);
    assert.equal(input.initialPages.length, templatePageCount(source.templateConfig));
    assert.deepEqual(input.initialPages.map(p=>p.templateId),configuredPageIds(source.templateConfig));
    const selections=toServerInitialPageSelections(input.initialPages);
    assert.deepEqual(selections.map(p=>localTemplateReference(p.templateCode,p.templateVersion).backgroundAssetId),configuredPageIds(source.templateConfig));
    assert.deepEqual(selections.map(p=>JSON.parse(p.configurationJson)),input.initialPages.map(p=>p.templateConfig));
    assert.equal(input.initialPages[0].templateConfig.width,orientation==='portrait'?768:1024);
    assert.equal(input.initialPages[0].templateConfig.height,orientation==='portrait'?1024:768);
    assert.deepEqual(input.initialPages[0].templateConfig.paperAppearance,source.paperAppearance);
    assert.deepEqual(source,before);
  }
});

test('빈 제목·잘못된 구성을 거절하며 내지를 모두 끄면 빈 페이지 하나를 요청한다', () => {
  assert.throws(()=>diaryCreateInput({...form(),title:' '}),/이름/);
  assert.throws(()=>diaryCreateInput({...form(),templateConfig:{...form().templateConfig,dateMode:'invalid'}}),/날짜형/);
  const config={...form().templateConfig,cover:false,dividers:false,monthly:false,weekly:false,daily:false,reusable:[],legacyEndPages:[]};
  const input=diaryCreateInput({...form(),templateConfig:config});
  assert.equal(input.initialPages.length,1);assert.equal(input.initialPages[0].templateConfig.blank,true);
  assert.equal(input.initialPages[0].templateCode,'dio-blank-landscape');
  assert.equal(toServerInitialPageSelections(input.initialPages)[0].templateCode,'dio-blank-landscape');
});

test('실제 생성 폼→어댑터→목 응답→상세 조회에서 선택값·장수·첫 페이지 ID를 확인한다', async () => {
  const mock=createMockDiaryTransport({delay:0}), calls=[];
  const api=createDiaryApi(options=>{calls.push(options);return mock.transport(options);});
  const input=diaryCreateInput(form('portrait','undated'));
  const result=await api.create(input,{requestId:'real-form'});
  assert.ok(result.firstPageId);assert.equal(result.pageSize,'portrait');
  assert.equal(calls[0].body.coverPattern,'dot');assert.equal(calls[0].body.orientation,'portrait');
  const detail=await api.get(result.id);
  assert.equal(detail.pageCount,input.initialPages.length);
  assert.deepEqual(detail.templateConfig,input.templateConfig);assert.deepEqual(detail.paperAppearance,input.paperAppearance);
});

test('실제 생성 입력도 응답 유실·닫기·재열기에서 같은 키로 단일 생성한다', async () => {
  const mock=createMockDiaryTransport({delay:0}),api=createDiaryApi(mock.transport);
  const mutation=createDiaryMutation(createDiaryCommand(api));
  const input=diaryCreateInput(form('portrait','undated'));
  mock.setWriteScenario('response-lost');await mutation.run({kind:'create',values:input});
  mutation.dismiss();assert.deepEqual(mutation.getPendingInput().values,input);
  mock.setWriteScenario('success');await mutation.retry();
  assert.equal(mutation.getSnapshot().status,'success');
  assert.equal((await api.list()).items.filter(row=>row.title==='새 여행').length,1);
});
