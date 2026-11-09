import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { catalog, annualBook, portraitAnnualBook } from '../src/editor/templates/data.js'
import { REUSABLE_TEMPLATES, reusableTemplates, getTemplate, templateReference } from '../src/editor/templates/catalog.js'
import { defaultTemplateConfig } from '../src/editor/templates/creation.js'
import { createTemplateCache } from '../src/editor/templates/cache.js'
import { createDefaultDoc, createTemplatePage, firstPageAssetId, migrateUntouchedAnnualDoc } from '../src/editor/state/defaultDoc.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'
import { pageSize, pageTemplateOrientation } from '../src/editor/utils/pageGeometry.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createMenuPdfSnapshot, menuPdfPolicy } from '../src/editor/utils/pdfMenu.js'
import { createPageImageRenderer } from '../src/editor/utils/pageImageRenderer.js'
import { readSvg } from '../src/editor/templates/readSvg.web.js'
import { REGION_PRESETS, fitRegionPreset, validRegion } from '../src/editor/utils/regionGeometry.js'

test('가로·세로 SVG 각 138개가 원본 ID·방향별 좌표로 모두 매핑된다(공용 속지만 번들, 나머지는 원격)', async () => {
  const directory = new URL('../assets/templates/2026/SVG/', import.meta.url)
  const files = await readdir(directory)
  assert.equal(files.length, 276)
  assert.equal(catalog.assets.length, 276)
  for (const orientation of ['landscape', 'portrait']) assert.equal(catalog.assets.filter(asset => asset.orientation === orientation).length, 138)
  const mapping = await readFile(new URL('../src/editor/templates/assets.js', import.meta.url), 'utf8')
  const bundled = [...mapping.matchAll(/require\("\.\.\/\.\.\/\.\.\/assets\/templates\/2026\/SVG\/([^"]+)"\)/g)].map(match => match[1])
  const remote = [...mapping.matchAll(/remoteAsset\("templates\/2026\/SVG\/([^"]+)"\)/g)].map(match => match[1])
  assert.equal(bundled.length + remote.length, 276)
  assert.equal(bundled.length, 14)
  assert.ok(bundled.every(name => name.startsWith('2026-reusable-')))
  assert.ok(remote.every(name => !name.startsWith('2026-reusable-')))
  for (const asset of catalog.assets) {
    assert.ok(['landscape', 'portrait'].includes(asset.orientation))
    assert.ok(mapping.includes(JSON.stringify(asset.id)))
    const xml = await readFile(new URL(asset.svg.split('/').pop(), directory), 'utf8')
    assert.ok(xml.includes(asset.orientation === 'portrait' ? 'viewBox="0 0 768 1024"' : 'viewBox="0 0 1024 768"'), asset.id)
    assert.ok(xml.includes('id="' + asset.id + '"'), asset.id)
    assert.doesNotMatch(xml, /<(text|script|image)\b/)
  }
})

test('새 다이어리는 연간 78페이지 순서로 시작하며 페이지 ID는 독립적이다', () => {
  const doc = createDefaultDoc()
  assert.equal(doc.title, '2026 다이어리')
  assert.equal(doc.pages.length, 78)
  assert.equal(new Set(doc.pages.map(p => p.id)).size, 78)
  assert.deepEqual(doc.pages.map(p => p.backgroundAssetId), annualBook.pages)
  for (const page of doc.pages) assert.notEqual(page.id, page.backgroundAssetId)
  for (const page of doc.pages) { assert.deepEqual(page.objects, []); assert.deepEqual(pageSize(page), { width: 1024, height: 768 }) }
  assert.notEqual(createDefaultDoc().id, doc.id)
})

test('세로형 연간 순서·공용 속지 추가·빈 페이지 크기를 유지한다', () => {
  const doc = createDefaultDoc({ pageSize: 'portrait' })
  assert.equal(doc.orientation, 'portrait')
  assert.equal(doc.pages.length, 78)
  assert.deepEqual(doc.pages.map(page => page.backgroundAssetId), portraitAnnualBook.pages)
  assert.equal(new Set(doc.pages.map(page => page.id)).size, 78)
  for (const page of doc.pages) assert.deepEqual(pageSize(page), { width: 768, height: 1024 })
  const menu = reusableTemplates('portrait')
  assert.equal(menu.length, 9)
  for (const item of menu) {
    const state = editorReducer(createInitialState(doc), { type: 'addPage', backgroundAssetId: item.assetId })
    assert.equal(getTemplate(getCurrentPage(state).backgroundAssetId).orientation, 'portrait')
    assert.deepEqual(pageSize(getCurrentPage(state)), { width: 768, height: 1024 })
  }
  for (const orientation of ['landscape', 'portrait']) {
    const config = { ...defaultTemplateConfig(orientation), cover: false, dividers: false, monthly: false, weekly: false }
    const blank = createDefaultDoc({ pageSize: orientation, templateConfig: config })
    assert.equal(blank.pages.length, 1)
    assert.equal(blank.pages[0].backgroundAssetId, undefined)
    assert.deepEqual(pageSize(blank.pages[0]), orientation === 'portrait' ? { width: 768, height: 1024 } : { width: 1188, height: 840 })
  }
})

test('속지 추가 방향은 문서 방향을 우선하고 구형 페이지 크기를 변경하지 않는다', () => {
  const legacy = { id: 'legacy', objects: [{ id: 'text', x: 100, y: 80 }] }
  const before = JSON.stringify(legacy)
  assert.equal(pageTemplateOrientation({ orientation: 'portrait' }, legacy), 'portrait')
  assert.equal(pageTemplateOrientation({ orientation: 'landscape' }, { canvasWidth: 768, canvasHeight: 1024 }), 'landscape')
  assert.equal(pageTemplateOrientation({}, { canvasWidth: 768, canvasHeight: 1024 }), 'portrait')
  assert.equal(pageTemplateOrientation({}, legacy), 'landscape')
  assert.deepEqual(pageSize(legacy), { width: 1188, height: 840 })
  assert.equal(JSON.stringify(legacy), before)
})

test('첫 페이지 서식과 날짜를 정확한 가로형 SVG 한 장으로 연결한다', () => {
  assert.equal(firstPageAssetId('blank'), '2026-reusable-note-plain-landscape')
  assert.equal(firstPageAssetId('lined'), '2026-reusable-note-ruled-landscape')
  assert.equal(firstPageAssetId('grid'), '2026-reusable-note-grid-landscape')
  assert.equal(firstPageAssetId('dot'), '2026-reusable-note-dots-landscape')
  assert.equal(firstPageAssetId('monthly', '2026-10-21'), '2026-monthly-10-landscape')
  assert.equal(firstPageAssetId('weekly', '2026-01-01'), '2026-weekly-blocks-2025-12-29-landscape')
  assert.equal(firstPageAssetId('weekly', '2026-12-31'), '2026-weekly-blocks-2026-12-28-landscape')
  for (const id of [
    firstPageAssetId('monthly', '2026-02-14'),
    firstPageAssetId('weekly', '2026-07-08'),
  ]) assert.equal(getTemplate(id).orientation, 'landscape')
})

test('내용 없는 이전 연간 문서와 편집한 문서를 모두 그대로 보존한다', () => {
  const legacy = {
    id: 'legacy',
    pages: annualBook.pages.map((backgroundAssetId, index) => ({ id: `page-${index}`, backgroundAssetId, objects: [] })),
  }
  const migrated = migrateUntouchedAnnualDoc(legacy)
  assert.equal(migrated, legacy)
  assert.equal(migrated.pages.length, 78)
  assert.deepEqual(migrated.pages, legacy.pages)

  const edited = {
    ...legacy,
    pages: legacy.pages.map((page, index) => (index === 2 ? { ...page, objects: [{ id: 'note' }] } : page)),
  }
  assert.equal(migrateUntouchedAnnualDoc(edited), edited)
})

test('공용 속지 9종(스터디 · 데일리 플래너 · 여행 노선 포함)은 현재 페이지 다음에 추가되며 취소 이력·재실행·JSON 복원이 유지된다', () => {
  assert.equal(REUSABLE_TEMPLATES.length, 9)
  for (const item of REUSABLE_TEMPLATES) {
    const doc = createDefaultDoc()
    let state = createInitialState(doc)
    state = editorReducer(state, { type: 'selectPage', id: doc.pages[0].id })
    state = editorReducer(state, { type: 'addPage', backgroundAssetId: item.assetId })
    const added = getCurrentPage(state)
    assert.equal(state.doc.pages[1], added)
    assert.equal(added.backgroundAssetId, item.assetId)
    assert.equal(state.doc.pages.length, doc.pages.length + 1)
    assert.notEqual(createTemplatePage(item.assetId).id, added.id)
    const undo = editorReducer(state, { type: 'undo' })
    assert.deepEqual(undo.doc, doc)
    state = editorReducer(undo, { type: 'redo' })
    assert.deepEqual(state.doc.pages[1], added)
    const restored = editorReducer(state, { type: 'load', doc: JSON.parse(JSON.stringify(state.doc)) })
    assert.deepEqual(restored.doc, state.doc)
    assert.equal('xml' in restored.doc.pages[1], false)
  }
})

test('기존 문서·요소 좌표를 보존하고 신규/기존 페이지 중앙 정렬에 각 크기를 사용한다', () => {
  const object = { id: 'photo', type: 'photo', x: 900, y: 700, w: 100, h: 80, rotation: 0 }
  const legacy = { id: 'old', title: '기존 여행', pages: [{ id: 'old-page', objects: [object] }] }
  const before = JSON.stringify(legacy)
  let state = createInitialState(legacy)
  assert.deepEqual(pageSize(getCurrentPage(state)), { width: 1188, height: 840 })
  state = editorReducer(state, { type: 'addPage', backgroundAssetId: REUSABLE_TEMPLATES[0].assetId })
  assert.equal(JSON.stringify(legacy), before)
  assert.deepEqual(state.doc.pages[0], legacy.pages[0])
  for (const [page, cx, cy] of [[legacy.pages[0], 594, 420], [{ ...state.doc.pages[1], objects: [object] }, 512, 384]]) {
    let aligned = createInitialState({ pages: [page] })
    aligned = editorReducer(aligned, { type: 'align', ids: ['photo'], mode: 'hcenter' })
    aligned = editorReducer(aligned, { type: 'align', ids: ['photo'], mode: 'vcenter' })
    const result = getCurrentPage(aligned).objects[0]
    assert.equal(result.x + result.w / 2, cx)
    assert.equal(result.y + result.h / 2, cy)
  }
})

test('삭제·실행 취소는 배경 참조를 복구하고 마지막 한 페이지 삭제를 막는다', () => {
  const doc = createDefaultDoc()
  let state = createInitialState(doc)
  state = editorReducer(state, { type: 'removePage', id: doc.pages[0].id })
  assert.equal(state.doc.pages.length, doc.pages.length - 1)
  assert.deepEqual(editorReducer(state, { type: 'undo' }).doc, doc)
  const one = createInitialState({ pages: [doc.pages[0]] })
  assert.equal(editorReducer(one, { type: 'removePage', id: one.pageId }), one)
})

test('알 수 없는 ID·버전 누락/불일치는 내보내기 오류이며 세로형은 허용한다', () => {
  const page = createTemplatePage('2026-reusable-daily-landscape')
  for (const patch of [{ backgroundAssetId: 'missing' }, { backgroundAssetId: '' }, { templateVersion: '9.0.0' }, { templateVersion: undefined }]) {
    assert.throws(() => createExportSnapshot({ ...page, ...patch }), { code: 'EXPORT_TEMPLATE_FAILED' })
  }
  assert.equal(templateReference({ objects: [] }), null)
  const portrait = createExportSnapshot(createTemplatePage('2026-cover-portrait'))
  assert.deepEqual([portrait.width, portrait.height], [768, 1024])
  assert.equal(portrait.template.backgroundAssetId, '2026-cover-portrait')
})

test('PNG 스냅샷은 속지 참조·크기를 고정하고 원본 페이지 변경과 독립적이다', () => {
  const page = createTemplatePage('2026-reusable-daily-landscape')
  const snapshot = createExportSnapshot(page)
  assert.equal(snapshot.width, 1024); assert.equal(snapshot.pixelHeight, 768)
  page.backgroundAssetId = 'missing'
  assert.equal(snapshot.template.backgroundAssetId, '2026-reusable-daily-landscape')
  assert.equal(snapshot.background, '#FFFFFF')
  const old = createExportSnapshot({ id: 'old', objects: [] })
  assert.equal(old.width, 1188); assert.equal(old.height, 840); assert.equal(old.template, null)
})

test('배경 준비가 끝나기 전에는 출력 준비가 완료되지 않고 실패 후 재시도할 수 있다', async () => {
  const snapshot = createExportSnapshot(createTemplatePage('2026-reusable-daily-landscape'))
  let release
  let done = false
  const pending = prepareExportSnapshot(snapshot, () => assert.fail('No user images'), () => new Promise(resolve => { release = resolve })).then(v => { done = true; return v })
  await Promise.resolve()
  assert.equal(done, false)
  release('<svg viewBox="0 0 1024 768"/>')
  const prepared = await pending
  assert.equal(prepared.backgroundXml, '<svg viewBox="0 0 1024 768"/>')
  prepared.dispose(); prepared.dispose()
  await assert.rejects(prepareExportSnapshot(snapshot, () => {}, async () => { throw new Error('missing') }), { code: 'EXPORT_TEMPLATE_FAILED' })
  await assert.rejects(prepareExportSnapshot(snapshot, () => {}), { code: 'EXPORT_TEMPLATE_FAILED' })
  await assert.rejects(prepareExportSnapshot(snapshot, () => {}, async () => ''), { code: 'EXPORT_TEMPLATE_FAILED' })
  const retried = await prepareExportSnapshot(snapshot, () => {}, async () => '<svg/>')
  assert.equal(retried.backgroundXml, '<svg/>')
})

test('기존 흰 페이지 출력은 SVG 로더를 호출하지 않는다', async () => {
  const snapshot = createExportSnapshot({ id: 'old', objects: [] })
  const prepared = await prepareExportSnapshot(snapshot, () => {}, () => assert.fail('legacy page'))
  assert.equal(prepared.backgroundXml, null)
  assert.equal(prepared.background, '#FFFFFF')
})

test('SVG 캐시는 동시 요청을 합치고 LRU 상한·실패 후 재시도를 지킨다', async () => {
  const counts = new Map()
  let fail = true
  const load = createTemplateCache(async key => {
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (key === 'bad' && fail) throw new Error('read failure')
    return key
  }, 2)
  assert.deepEqual(await Promise.all([load('a'), load('a')]), ['a', 'a'])
  assert.equal(counts.get('a'), 1)
  await load('b'); await load('a'); await load('c'); await load('b')
  assert.equal(counts.get('b'), 2)
  await assert.rejects(load('bad'))
  fail = false
  assert.equal(await load('bad'), 'bad')
  assert.equal(counts.get('bad'), 2)
})

test('웹 SVG 읽기는 HTTP 오류를 성공한 XML로 돌려주지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }))
  await assert.rejects(readSvg('https://local.invalid/template.svg'), /404/)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async (_, options) => { assert.ok(options.signal); return { ok: true, text: async () => '<svg/>' } })
  assert.equal(await readSvg('https://local.invalid/template.svg'), '<svg/>')
})


test('보관함에서 전달한 ID·생성 시각·제목·색상을 유지하면서 연간 문서를 생성한다', () => {
  const diary = { id: 'diary-123', createdAt: '2026-10-22T08:00:00.000Z', title: '나의 기록', color: '#6E92C6' }
  const doc = createDefaultDoc(diary)
  assert.equal(doc.id, diary.id)
  assert.equal(doc.createdAt, diary.createdAt)
  assert.equal(doc.title, diary.title)
  assert.equal(doc.coverColor, diary.color)
  assert.equal(doc.pages.length, 78)
  assert.equal(doc.pages[0].backgroundAssetId, '2026-cover-landscape')
})

test('페이지 순서를 바꾸고 되돌려도 속지·크기·요소와 현재 페이지를 유지한다', () => {
  const doc = createDefaultDoc()
  const selected = doc.pages[0]
  let state = editorReducer(createInitialState(doc), { type: 'selectPage', id: selected.id })
  state = editorReducer(state, { type: 'addPage', backgroundAssetId: REUSABLE_TEMPLATES[0].assetId })
  state = editorReducer(state, { type: 'selectPage', id: selected.id })
  const beforeMove = state.doc
  state = editorReducer(state, { type: 'movePage', id: selected.id, toIndex: 1 })
  assert.equal(state.doc.pages[1], selected)
  assert.equal(getCurrentPage(state), selected)
  assert.deepEqual(editorReducer(state, { type: 'undo' }).doc, beforeMove)
  assert.deepEqual(JSON.parse(JSON.stringify(state.doc.pages[1])), selected)
})


test('PDF는 저장된 페이지별 크기와 속지 참조를 보존하고 공통 출력에 전달한다', () => {
  const page = createTemplatePage('2026-reusable-daily-landscape')
  const legacy = { id: 'legacy-pdf', canvasWidth: 1188, canvasHeight: 840, objects: [] }
  const doc = { title: '혼합 문서', pages: [legacy, page] }
  const before = JSON.stringify(doc)
  const snapshot = createMenuPdfSnapshot(doc, { mode: 'range', from: '1', to: '2' }, { width: 1280, height: 800 })
  assert.deepEqual(snapshot.pages.map(p => [p.width,p.height,p.pixelWidth,p.pixelHeight]), [[1188,840,2376,1680],[1024,768,2048,1536]])
  assert.equal(snapshot.pages[0].template,null)
  assert.equal(snapshot.pages[1].template.backgroundAssetId,page.backgroundAssetId)
  assert.equal(JSON.stringify(doc),before)
  const twenty = { pages: Array.from({length:20},() => createTemplatePage('2026-reusable-daily-landscape')) }
  assert.deepEqual(menuPdfPolicy(twenty,{width:1280,height:800}),{enabled:true,maxPages:20,totalPages:20})
})

test('공통 PNG/PDF 작업기는 SVG 준비를 기다리고 실패 후 재시도해도 참조·크기를 유지한다', async () => {
  const snapshot = createExportSnapshot(createTemplatePage('2026-reusable-daily-landscape'))
  let resolve, fail = false, renders = 0
  const renderer = createPageImageRenderer({
    prepare: input => prepareExportSnapshot(input, () => assert.fail('no images'), () => fail ? Promise.reject(new Error('SVG failure')) : new Promise(r => { resolve = r })),
    render: async input => { renders++; assert.equal(input.template.backgroundAssetId,snapshot.template.backgroundAssetId); assert.equal(input.width,1024); assert.equal(input.backgroundXml,'<svg/>'); return {dispose(){}} },
  })
  const first = renderer.renderPageImage(snapshot)
  await Promise.resolve()
  assert.equal(renders,0)
  resolve('<svg/>')
  ;(await first).dispose()
  fail = true
  await assert.rejects(renderer.renderPageImage(snapshot),{code:'EXPORT_TEMPLATE_FAILED'})
  assert.equal(renders,1)
  fail = false
  const retried = renderer.renderPageImage(snapshot)
  await Promise.resolve()
  resolve('<svg/>')
  ;(await retried).dispose()
  assert.equal(renders,2)
})

test('최신 영역 프리셋은 SVG와 구형 페이지 각각의 크기 안에서 비율과 중심을 유지한다', () => {
  const pages = [createTemplatePage('2026-reusable-daily-landscape'), { id: 'legacy-region', objects: [] }]
  for (const page of pages) {
    const size = pageSize(page)
    const full = { x: 0, y: 0, ...size }
    for (const [id, preset] of Object.entries(REGION_PRESETS)) {
      const fitted = fitRegionPreset(full, id, size)
      assert.ok(validRegion(fitted, size, preset.ratio), `${page.id}/${id}`)
      assert.ok(Math.abs(fitted.x + fitted.width / 2 - size.width / 2) < 1e-6)
      assert.ok(Math.abs(fitted.y + fitted.height / 2 - size.height / 2) < 1e-6)
    }
  }
})
