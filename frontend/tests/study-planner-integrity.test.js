import test from 'node:test'
import assert from 'node:assert/strict'
import { Children, createElement } from 'react'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as defaultDoc from '../src/editor/state/defaultDoc.js'
import * as sessionDocuments from '../src/editor/services/sessionDocuments.js'
import * as storageContract from '../src/editor/utils/storageContract.js'
import * as memberStorage from '../src/diary/services/memberStorage.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { normalizePlanner, studyPlannerId, plannerOverlaySvg, plannerTotals } from '../src/editor/templates/studyPlanner.js'
import { colorTemplateAst, colorTemplateXml } from '../src/editor/templates/appearance.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createPdfExportSnapshot } from '../src/editor/utils/pdfSnapshot.js'

const colors = ['#292929', '#666666', '#AEB3B8', '#BFC1C4', '#D7D9DC', '#E8E9EB', '#FFE066']
const appearance = { backgroundColor: '#FFF8E7', layoutColor: '#33476B' }
function page(orientation) {
  return {
    id: 'original', backgroundAssetId: studyPlannerId(orientation), templateVersion: '1.0.0',
    canvasWidth: orientation === 'portrait' ? 768 : 1024, canvasHeight: orientation === 'portrait' ? 1024 : 768,
    paperAppearance: { ...appearance },
    objects: [{ id: 'a', type: 'text', baseWidth: 80, text: '기록', x: 10, y: 20, w: 80, h: 40, groupId: 'group' }, { id: 'b', type: 'text', baseWidth: 80, text: '계획', x: 10, y: 60, w: 80, h: 40, groupId: 'group' }],
    planner: normalizePlanner({ cells: { '0,0': '#292929', '1,1': '#FFE066' }, caps: { '0,0': 'round' }, checks: { 0: '#666666' }, bands: { 1: '#BFC1C4' }, day: { i: 2, color: '#AEB3B8', hl: false }, mood: { hearts: [{ color: '#D7D9DC', hl: false }, { color: '#E8E9EB', hl: true }] }, options: { startHour: 7, restColor: '#FFE066', snap: false } }),
  }
}
for (const orientation of ['landscape', 'portrait']) {
  test(`${orientation}: 복제는 모든 페이지 내용과 기록을 독립 보존하고 Undo/Redo 한다`, () => {
    const original = page(orientation), before = structuredClone(original)
    const state = createInitialState({ id: 'regression', pages: [original] })
    const duplicated = editorReducer(state, { type: 'duplicatePage', id: original.id })
    const copy = duplicated.doc.pages[1]
    assert.deepEqual({ ...copy, id: original.id, objects: original.objects }, original)
    assert.notEqual(copy.planner, original.planner)
    assert.notEqual(copy.planner.mood.hearts, original.planner.mood.hearts)
    assert.notEqual(copy.paperAppearance, original.paperAppearance)
    assert.notEqual(copy.objects[0].id, original.objects[0].id)
    assert.notEqual(copy.objects[0].groupId, original.objects[0].groupId)
    assert.equal(copy.objects[0].groupId, copy.objects[1].groupId)
    const undone = editorReducer(duplicated, { type: 'undo' })
    assert.deepEqual(undone.doc, state.doc)
    assert.deepEqual(editorReducer(undone, { type: 'redo' }).doc, duplicated.doc)
    const changedPlanner = normalizePlanner(copy.planner)
    changedPlanner.cells['0,0'] = '#FF0000'
    const edited = editorReducer(duplicated, { type: 'setPlanner', pageId: copy.id, planner: changedPlanner })
    assert.deepEqual(edited.doc.pages[0], before)
    assert.deepEqual(editorReducer(edited, { type: 'undo' }).doc, duplicated.doc)
    assert.deepEqual(editorReducer(editorReducer(edited, { type: 'undo' }), { type: 'redo' }).doc, edited.doc)
  })
  test(`${orientation}: 복제본의 PNG/PDF 준비는 속지·시간·기록색을 보존한다`, async () => {
    const state = editorReducer(createInitialState({ id: 'export', pages: [page(orientation)] }), { type: 'duplicatePage' })
    const copy = state.doc.pages[1], before = structuredClone(copy)
    const png = createExportSnapshot(copy)
    const pdf = createPdfExportSnapshot(state.doc, { scope: 'current', currentPageId: copy.id, width: copy.canvasWidth, height: copy.canvasHeight }).pages[0]
    for (const snapshot of [png, pdf]) {
      assert.deepEqual(snapshot.planner, copy.planner)
      const result = await prepareExportSnapshot(snapshot, null, () => { throw Error('내장 속지') })
      assert.match(result.backgroundXml, /fill="#FFF8E7"/)
      assert.match(result.backgroundXml, /#33476b/)
      assert.match(result.backgroundXml, /fill="#292929"/)
      assert.match(result.backgroundXml, /stroke="#666666"/)
      assert.match(result.backgroundXml, /aria-label="07"/)
      assert.equal(plannerTotals(snapshot.planner).study, 10)
      result.dispose()
    }
    assert.deepEqual(copy, before)
  })
}
for (const color of colors) test(`${color}: 속지 배색과 투명 바탕은 모든 사용자 칠을 바꾸지 않는다`, () => {
  const planner = normalizePlanner({ cells: { '0,0': color }, checks: { 0: color }, bands: { 0: color }, day: { i: 0, color, hl: true }, mood: { hearts: [{ color, hl: false }, { color, hl: true }] } })
  const raw = plannerOverlaySvg('landscape', planner)
  // 모든 기록 도형(집계 색상표 포함)은 고정 색상임을 표시한다. 자동 집계 글자는 속지색을 따른다.
  const painted = raw.match(/<[^>]*data-preserve-paint="true"[^>]*>/g) ?? []
  assert.ok(painted.length >= 8, '칸/체크/띠/요일/색상표/막대/하트 표시')
  for (const theme of [appearance, { backgroundColor: '#EDF3EA', layoutColor: '#72533E' }]) {
    const themed = colorTemplateXml(raw, theme)
    for (const tag of painted) assert.ok(themed.includes(tag), tag)
    assert.notEqual(themed, raw, '자동 집계 글자는 배색을 따른다')
    for (const transparentPaper of [false, true]) {
      const ast = { children: [createElement('path', { fill: color, stroke: color, dataPreservePaint: 'true' }), createElement('path', { fill: '#292929' })] }
      const styled = colorTemplateAst(ast, theme, { transparentPaper })
      assert.equal(styled.children[0].props.fill, color)
      assert.equal(styled.children[0].props.stroke, color)
      assert.equal(styled.children[1].props.fill, theme.layoutColor.toLowerCase())
      assert.equal(ast.children[1].props.fill, '#292929')
    }
  }
})

// 실제 서비스의 JSON 저장/읽기를 사용하고, 플랫폼 저장소만 메모리로 대체한다.
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function loadModule(source, mocks, plugins = []) {
  const code = expo('@babel/core').transformSync(source, { configFile: false, babelrc: false, plugins: [...plugins, expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), module, module.exports)
  return module.exports
}
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
for (const orientation of ['landscape', 'portrait']) test(`${orientation}: 저장 후 캐시를 비우고 복원해도 원본과 복제본의 기록·옵션·속지색을 유지한다`, async () => {
  const disk = new Map()
  const asyncStorage = { __esModule: true, default: { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value) }, loadDocument: async key => { const raw = disk.get(key); return raw ? JSON.parse(raw) : null }, saveDocument: async (key, doc) => { disk.set(key, JSON.stringify(doc)) } } }
  const storage = loadModule(read('../src/editor/services/storage.js'), { './documentStorage': asyncStorage, '../utils/storageContract.js': storageContract })
  const docs = loadModule(read('../src/editor/services/editorDocs.js'), { '../../diary/services/memberStorage.js': memberStorage, '../../diary/utils/bookSpread.js': {},
    './documentStorage': asyncStorage, '../state/defaultDoc': defaultDoc,
    '../templates/catalog.js': {}, '../templates/loadTemplate': {}, './mediaStore': {},
    './sessionDocuments.js': sessionDocuments, './editorViewState': {}, './storage': storage,
  })
  const doc = editorReducer(createInitialState({ id: 'saved', pages: [page(orientation)] }), { type: 'duplicatePage' }).doc
  const key = docs.editorDocKey({ id: doc.id })
  assert.equal(await docs.saveEditorDoc(key, doc), true)
  docs.rememberEditorDoc(key, doc)
  docs.forgetEditorDoc(key)
  const restored = await docs.loadEditorDoc({ id: doc.id })
  assert.deepEqual(restored, doc)
  assert.notEqual(restored, doc)
  assert.notEqual(restored.pages[0].planner, restored.pages[1].planner)
  assert.equal(plannerTotals(restored.pages[1].planner).study, 10)
  const next = createInitialState(restored, restored.pages[1].id)
  assert.equal(next.pageId, restored.pages[1].id)
  assert.deepEqual(next.doc.pages[1].planner.options, doc.pages[1].planner.options)
})

test('react-native-svg 실제 파서는 기록색 보존 표식을 AST 배색까지 전달한다', () => {
  const xmlPath = require.resolve('react-native-svg/package.json').replace(/package\.json$/, 'src/xml.tsx')
  const { parse } = loadModule(readFileSync(xmlPath, 'utf8'), {
    './utils/fetchData': {}, './xmlTags': { tags: new Proxy({}, { get: (_, tag) => tag }) },
  }, [[expo.resolve('@babel/plugin-transform-typescript'), { isTSX: true }], [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }]])
  const ast = parse(plannerOverlaySvg('portrait', page('portrait').planner))
  const styled = colorTemplateAst(ast, appearance)
  let preserved = 0, themed = 0
  const compare = (before, after) => {
    if (!before?.props) return
    if (before.props.dataPreservePaint === 'true') {
      preserved++
      assert.equal(after.props.fill, before.props.fill)
      assert.equal(after.props.stroke, before.props.stroke)
    } else if (before.props.fill === '#292929') {
      themed++
      assert.equal(after.props.fill, '#33476b')
    }
    const a = Children.toArray(before.props.children), b = Children.toArray(after.props.children)
    a.forEach((child, i) => compare(child, b[i]))
  }
  Children.toArray(ast.children).forEach((child, i) => compare(child, Children.toArray(styled.children)[i]))
  assert.ok(preserved >= 9)
  assert.ok(themed > 0)
})
