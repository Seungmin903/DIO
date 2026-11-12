import test from 'node:test';
import assert from 'node:assert/strict';
import { serverDiaryCreateInput, serverPaperAppearance } from '../src/diary/services/serverPaperFont.js';

test('서버로 보내는 속지 모양에서만 글꼴을 빼고 색은 그대로 둔다', () => {
  assert.deepEqual(serverPaperAppearance({ backgroundColor: '#ABCDEF', font: 'gowun-dodum' }), { backgroundColor: '#ABCDEF' });
  assert.equal(serverPaperAppearance({ font: 'nanum-pen' }), undefined);
  const plain = { layoutColor: '#123456' };
  assert.equal(serverPaperAppearance(plain), plain);
  assert.equal(serverPaperAppearance(undefined), undefined);
});

test('회원 다이어리 생성 입력의 모든 자리(전체 · 첫 페이지들)에서 글꼴을 뺀다', () => {
  const input = {
    title: '여름', paperAppearance: { backgroundColor: '#FFFFFF', font: 'poor-story' },
    templateConfig: { width: 1280, height: 800, paperAppearance: { font: 'poor-story' } },
    initialPages: [
      { templateCode: 'BLANK', templateVersion: '1', templateConfig: { blank: true, paperAppearance: { backgroundColor: '#FFFFFF', font: 'poor-story' } } },
      { templateCode: 'LINED', templateVersion: '1', templateConfig: { width: 1280 } },
    ],
  };
  const sent = serverDiaryCreateInput(input);
  assert.equal(JSON.stringify(sent).includes('font'), false);
  assert.deepEqual(sent.paperAppearance, { backgroundColor: '#FFFFFF' });
  assert.deepEqual(sent.templateConfig, { width: 1280, height: 800 });
  assert.deepEqual(sent.initialPages[0].templateConfig, { blank: true, paperAppearance: { backgroundColor: '#FFFFFF' } });
  assert.deepEqual(sent.initialPages[1].templateConfig, { width: 1280 });
  assert.equal(input.paperAppearance.font, 'poor-story');
});
