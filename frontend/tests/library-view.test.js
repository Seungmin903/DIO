import test from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY_VIEWS, cardTapAction, savedLibraryView } from '../src/diary/utils/libraryView.js';

test('저장해 둔 보기는 펼쳐서 · 스와이프 · 한눈에만 받고, 알 수 없는 값은 무시한다', () => {
  for (const view of LIBRARY_VIEWS) assert.equal(savedLibraryView(view), view);
  for (const saved of [null, undefined, '', 'list', 'OPEN', 3, {}, ['grid']]) assert.equal(savedLibraryView(saved), null, String(saved));
});

test('카드를 누르면: 관리 모드는 선택, 스와이프 옆 카드는 가운데로, 그 밖은 열기', () => {
  assert.equal(cardTapAction({ selecting: true, layout: 'carousel', carouselActive: false, canCenter: true }), 'select');
  assert.equal(cardTapAction({ layout: 'carousel', carouselActive: false, canCenter: true }), 'center');
  assert.equal(cardTapAction({ layout: 'carousel', carouselActive: true, canCenter: true }), 'open');
  // 가운데로 옮길 수 없으면(onCenter 없음) 옆 카드도 연다
  assert.equal(cardTapAction({ layout: 'carousel', carouselActive: false, canCenter: false }), 'open');
  assert.equal(cardTapAction({ layout: 'grid', canCenter: true }), 'open');
});
