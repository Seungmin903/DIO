import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Expo 번들러는 확장자 없는 내부 import를 해석한다. Node 회귀 테스트에서도
// 같은 모듈을 읽을 수 있게 상대 경로에 .js를 보완한다.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !specifier.endsWith('.js')) return nextResolve(`${specifier}.js`, context)
    return nextResolve(specifier, context)
  },
})
const { createInitialState, editorReducer } = await import('../src/editor/state/editorReducer.js')
hooks.deregister()

const doc = {
  id: 'diary-a',
  title: '테스트 다이어리',
  pages: [
    {
      id: 'page-a',
      objects: [
        { id: 'text-a', type: 'text', x: 10, y: 20, text: '첫 기록', style: { color: '#112233' }, groupId: 'group-a' },
        { id: 'photo-a', type: 'photo', x: 30, y: 40, mediaFileId: 'media-a', crop: { zoom: 1 }, groupId: 'group-a' },
      ],
    },
  ],
}

test('페이지 복제는 요소와 그룹 ID를 분리하고 원본 바로 뒤로 이동한다', () => {
  const state = editorReducer(createInitialState(doc), { type: 'duplicatePage' })
  const [original, copy] = state.doc.pages

  assert.equal(state.doc.pages.length, 2)
  assert.equal(state.pageId, copy.id)
  assert.notEqual(copy.id, original.id)
  assert.deepEqual(copy.objects.map((object) => object.text ?? object.mediaFileId), ['첫 기록', 'media-a'])
  assert.notEqual(copy.objects[0].id, original.objects[0].id)
  assert.notEqual(copy.objects[1].id, original.objects[1].id)
  assert.notEqual(copy.objects[0].groupId, original.objects[0].groupId)
  assert.equal(copy.objects[0].groupId, copy.objects[1].groupId)

  const changed = editorReducer(state, {
    type: 'updateObject',
    record: true,
    id: copy.objects[0].id,
    patch: { x: 999, style: { color: '#FFFFFF' } },
  })
  assert.equal(changed.doc.pages[0].objects[0].x, 10)
  assert.equal(changed.doc.pages[0].objects[0].style.color, '#112233')
})

test('페이지 삭제 뒤 되돌리기는 삭제한 페이지와 요소를 복구한다', () => {
  const withSecondPage = editorReducer(createInitialState(doc), { type: 'addPage' })
  const secondId = withSecondPage.pageId
  const removed = editorReducer(withSecondPage, { type: 'removePage', id: secondId })
  const restored = editorReducer(removed, { type: 'undo' })

  assert.equal(removed.doc.pages.length, 1)
  assert.equal(restored.doc.pages.length, 2)
  assert.equal(restored.doc.pages[0].objects[0].text, '첫 기록')
  assert.equal(restored.doc.pages[1].id, secondId)
})

test('인덱스 표식은 페이지별로 저장되고 되돌리기로 해제할 수 있다', () => {
  const indexed = editorReducer(createInitialState(doc), { type: 'togglePageIndex', id: 'page-a' })
  assert.equal(indexed.doc.pages[0].indexed, true)

  const unindexed = editorReducer(indexed, { type: 'togglePageIndex', id: 'page-a' })
  assert.equal(unindexed.doc.pages[0].indexed, false)

  const restored = editorReducer(unindexed, { type: 'undo' })
  assert.equal(restored.doc.pages[0].indexed, true)
})

test('여러 페이지 삭제는 남은 순서·내용을 보존하고 한 번에 undo/redo 된다', () => {
  const pages = ['a', 'b', 'c', 'd'].map(id => ({ id, objects: [{ id: `${id}-photo`, type: 'photo', mediaFileId: `media-${id}` }] }))
  const original = createInitialState({ id: 'bulk', pages })
  const selected = editorReducer(original, { type: 'selectPage', id: 'c' })
  const deleted = editorReducer(selected, { type: 'removePages', ids: ['b', 'c', 'b', 'missing'] })
  assert.deepEqual(deleted.doc.pages.map(p => p.id), ['a', 'd'])
  assert.equal(deleted.pageId, 'a')
  assert.equal(deleted.past.length, selected.past.length + 1)
  assert.equal(deleted.doc.pages[1], pages[3])
  const restored = editorReducer(deleted, { type: 'undo' })
  assert.deepEqual(restored.doc, selected.doc)
  assert.deepEqual(editorReducer(restored, { type: 'redo' }).doc, deleted.doc)
  assert.equal(JSON.parse(JSON.stringify(deleted.doc)).pages[1].objects[0].mediaFileId, 'media-d')
})

test('전체·빈 선택·없는 ID 삭제는 문서와 편집 이력을 변경하지 않는다', () => {
  const state = createInitialState({ id: 'bulk', pages: [{ id: 'a', objects: [] }, { id: 'b', objects: [] }] })
  for (const ids of [[], ['missing'], ['a', 'b']]) assert.equal(editorReducer(state, { type: 'removePages', ids }), state)
  assert.equal(editorReducer(state, { type: 'removePage', id: 'missing' }), state)
})

test('첫 페이지 삭제는 다음 생존 페이지로 이동하고 비선택 현재 페이지는 유지한다', () => {
  const state = createInitialState({ id: 'bulk', pages: ['a', 'b', 'c'].map(id => ({ id, objects: [] })) })
  assert.equal(editorReducer(state, { type: 'removePages', ids: ['a', 'b'] }).pageId, 'c')
  assert.equal(editorReducer(state, { type: 'removePages', ids: ['b'] }).pageId, 'a')
})


test('다이어리 초기화는 문서 메타데이터와 종이 크기를 유지하고 빈 페이지 하나를 만든다', () => {
 const original={...doc,coverColor:'#123456',orientation:'portrait',paperAppearance:{backgroundColor:'#ffffff'},pages:[{id:'old',canvasWidth:768,canvasHeight:1024,backgroundAssetId:'template',indexed:true,objects:[{id:'ink',type:'stroke'}]},{id:'other',objects:[]}]};
 const state=createInitialState(original);state.selectedIds=['ink'];
 const next=editorReducer(state,{type:'resetDiary'});
 assert.equal(next.doc.id,original.id);assert.equal(next.doc.title,original.title);assert.equal(next.doc.coverColor,original.coverColor);
 assert.equal(next.doc.pages.length,1);const page=next.doc.pages[0];
 assert.ok(!original.pages.some(p=>p.id===page.id));assert.equal(next.pageId,page.id);assert.deepEqual(next.selectedIds,[]);
 assert.deepEqual(page.objects,[]);assert.equal(page.indexed,undefined);assert.equal(page.backgroundAssetId,undefined);
 assert.equal(page.canvasWidth,768);assert.equal(page.canvasHeight,1024);assert.deepEqual(page.paperAppearance,original.paperAppearance);
 assert.deepEqual(original.pages[0].objects,[{id:'ink',type:'stroke'}]);
 assert.equal(next.past.length,1);
 const undone=editorReducer(next,{type:'undo'});assert.deepEqual(undone.doc,original);
 const redone=editorReducer(undone,{type:'redo'});assert.deepEqual(redone.doc,next.doc);
});

test('한 장짜리 문서도 초기화할 수 있고 직렬화 후 빈 페이지를 유지한다', () => {
 const next=editorReducer(createInitialState(doc),{type:'resetDiary'});
 const restored=createInitialState(JSON.parse(JSON.stringify(next.doc)));
 assert.equal(restored.doc.pages.length,1);assert.deepEqual(restored.doc.pages[0].objects,[]);
 assert.equal(restored.pageId,next.pageId);
});

test('나의 속지처럼 미리 만든 페이지는 그대로 지금 페이지 뒤에 넣고 첫 장으로 이동한다', () => {
  const pages = [
    { id: 'pdf-1', canvasWidth: 1200, canvasHeight: 1600, objects: [{ id: 'bg-1', type: 'sticker', locked: true, backdrop: true, mediaFileId: 'm-1' }] },
    { id: 'pdf-2', canvasWidth: 1200, canvasHeight: 1600, objects: [{ id: 'bg-2', type: 'sticker', locked: true, backdrop: true, mediaFileId: 'm-2' }] },
  ]
  const next = editorReducer(createInitialState(doc), { type: 'addPage', pages })
  assert.deepEqual(next.doc.pages.map((page) => page.id), ['page-a', 'pdf-1', 'pdf-2'])
  assert.equal(next.doc.pages[1].canvasHeight, 1600)
  assert.equal(next.doc.pages[2].objects[0].mediaFileId, 'm-2')
  assert.equal(next.pageId, 'pdf-1')
})

test('파일 이름이 없는 사진은 그 페이지에서 사진 1, 사진 2… 로 이름 짓고 파일 이름이 있으면 그대로 둔다', async () => {
  const { mediaDisplayName } = await import('../src/editor/utils/mediaImport.js')
  assert.equal(mediaDisplayName('바다 여행.jpg'), '바다 여행')
  assert.equal(mediaDisplayName('IMG_20261102_101500.jpg'), 'IMG_20261102_101500')
  for (const raw of ['image.png', '1000012345.jpg', '2b5e8c1a-3f4d-4e6a-9b7c-1d2e3f4a5b6c.jpeg', 'a3f9c0d2e1b4567890abcdef.jpg', '']) assert.equal(mediaDisplayName(raw), null, raw)
  let state = createInitialState({ id: 'd', pages: [{ id: 'p', objects: [{ id: 'old', type: 'photo', name: '사진 2' }, { id: 'named', type: 'photo', name: '바다' }] }] })
  state = editorReducer(state, { type: 'addObjects', objects: [{ id: 'a', type: 'photo', name: null }, { id: 'b', type: 'photo' }, { id: 'c', type: 'photo', name: '산책' }, { id: 's', type: 'sticker' }] })
  assert.deepEqual(state.doc.pages[0].objects.map((o) => o.name ?? null), ['사진 2', '바다', '사진 3', '사진 4', '산책', null])
})
