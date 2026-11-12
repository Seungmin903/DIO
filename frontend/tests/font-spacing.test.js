import * as aiDisclosure from '../src/handwriting/aiDisclosure.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { correctFontSpacing, fontSpacingInfo, FONT_SPACING_VERSION } from '../src/handwriting/fontSpacing.js'
import * as format from '../src/handwriting/fontFormat.js'
import * as protocol from '../src/handwriting/protocol.js'
import { createWorkflowPersistence } from '../src/handwriting/workflowPersistence.js'
import { legacyFont, tablesOf, repairChecksum, sum32 } from './helpers/handwriting-font-fixture.js'

const original = legacyFont(), options = { family: 'DIOHW-SpacingTest', displayName: '간격 보정 테스트' }
test('전체 한글은 잉크 폭+32·LSB 16이며 윤곽선·공백·기준선·원본은 보존된다', async () => {
  const before = original.slice(), progress = [], result = await correctFontSpacing(original, { ...options, onProgress: n => progress.push(n) })
  assert.deepEqual(original, before)
  const a = tablesOf(original), b = tablesOf(result), v = new DataView(result.buffer)
  for (const tag of ['glyf', 'loca', 'cmap', 'maxp', 'post']) assert.deepEqual(result.subarray(b[tag].offset, b[tag].offset + b[tag].length), original.subarray(a[tag].offset, a[tag].offset + a[tag].length), tag)
  for (let i = 2; i < 11174; i++) {
    assert.equal(v.getUint16(b.hmtx.offset + i * 4), [640, 1024, 1536][(i - 2) % 3] + 32)
    assert.equal(v.getInt16(b.hmtx.offset + i * 4 + 2), 16)
  }
  assert.equal(v.getUint16(b.hmtx.offset + 4), 1024)
  assert.equal(v.getUint16(b.hmtx.offset), 2048)
  assert.equal(v.getUint16(b.head.offset + 16) & 2, 0)
  assert.equal(v.getInt16(b.hhea.offset + 4), 1720)
  assert.equal(v.getInt16(b.hhea.offset + 6), -328)
  assert.equal(v.getUint16(b.hhea.offset + 34), 11174)
  assert.equal(sum32(result), 0xb1b0afba)
  for (const [tag, t] of Object.entries(b)) {
    const bytes = result.slice(t.offset, t.offset + t.length)
    if (tag === 'head') new DataView(bytes.buffer).setUint32(8, 0)
    assert.equal(sum32(bytes), t.checksum, tag)
  }
  assert.equal(format.inspectTrueType(result).syllables, 11172)
  assert.deepEqual(fontSpacingInfo(result), { spacingSupported: true, spacingVersion: FONT_SPACING_VERSION })
  assert.equal(progress.at(-1), 11172)
  await assert.rejects(correctFontSpacing(result, options), /이미/)
})
test('손상·외부·힌팅·잘못된 윤곽선 폰트를 원본 변경 없이 거부한다', async () => {
  for (const kind of ['checksum', 'vendor', 'hint', 'coordinate', 'composite']) {
    const bytes = original.slice(), t = tablesOf(bytes), v = new DataView(bytes.buffer)
    if (kind === 'checksum') bytes[bytes.length - 1] ^= 1
    if (kind === 'vendor') bytes[t['OS/2'].offset + 58] = 88
    if (kind === 'hint') v.setUint16(t.glyf.offset + 12, 1)
    if (kind === 'coordinate') v.setInt16(t.glyf.offset + 18, 385)
    if (kind === 'composite') v.setInt16(t.glyf.offset, -1)
    if (kind !== 'checksum') repairChecksum(bytes)
    const before = bytes.slice()
    await assert.rejects(correctFontSpacing(bytes, options), undefined, kind)
    assert.deepEqual(bytes, before)
  }
})

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/handwriting/storage.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function storage() {
  const disk = new Map(), files = new Map(), workflowData = new Map(), removed = [], state = { failList: false, failFile: false, failWorkflow: false, picked: null, exported: null }
  let seq = 0
  const mod = { exports: {} }, asyncStorage = {
    getItem: async key => disk.get(key) ?? null,
    removeItem: async key => disk.delete(key),
    async setItem(key, value) { if (state.failList && key === 'dio-personal-fonts-v1') throw new Error('disk full'); disk.set(key, value) },
  }
  const deps = {
    '@react-native-async-storage/async-storage': asyncStorage,
    'expo-crypto': { randomUUID: () => `11111111-2222-4333-8444-${String(++seq).padStart(12, '0')}` },
    './aiDisclosure.js': aiDisclosure, './protocol.js': protocol, './fontFormat.js': format,
    './workflowPersistence.js': { createWorkflowPersistence },
    './fontSpacing.js': { correctFontSpacing, fontSpacingInfo, FONT_SPACING_VERSION },
    './files': {
      workflowBlobs: { read: async id => workflowData.get(id), write: async (id, text) => { if (state.failWorkflow) throw new Error('disk full'); workflowData.set(id, text) }, remove: async id => workflowData.delete(id) },
      readFontBytes: async uri => files.get(uri), restoreFontUri: async font => { if (!files.has(font.uri)) throw new Error('missing'); return font.uri },
      async saveFontBytes(id, bytes) { if (state.failFile) throw new Error('disk full'); const uri = `file:///${id}.ttf`; assert(!files.has(uri)); files.set(uri, bytes); return uri },
      async removeFontBytes(id) { removed.push(id); files.delete(`file:///${id}.ttf`) },
      pickLocalFile: async () => state.picked,
      writeLocalPackage: async (_name, text) => { state.exported = text; return true },
    },
  }
  new Function('require', 'module', 'exports', code)(id => deps[id], mod, mod.exports)
  files.set('file:///source.ttf', original.slice())
  return { ...mod.exports, disk, files, removed, state }
}
test('보정 사본은 새 ID·이름으로 등록하고 중복 요청·기존 문서를 보존한다', async () => {
  const s = storage(), old = await s.registerFontFile('file:///source.ttf', '가'.repeat(30), 'old-job')
  s.disk.set('existing-diary', JSON.stringify({ font: old.id }))
  const before = s.files.get(old.uri).slice(), a = s.correctRegisteredFont(old), b = s.correctRegisteredFont(old)
  assert.equal(a, b)
  const next = await a
  assert.notEqual(next.id, old.id); assert.notEqual(next.family, old.family)
  assert.equal(next.sourceFontId, old.id); assert.equal(next.spacingVersion, FONT_SPACING_VERSION)
  assert(next.label.length <= 30); assert(next.label.endsWith(' (간격 보정)'))
  assert.equal(s.disk.get('existing-diary'), JSON.stringify({ font: old.id }))
  assert.deepEqual(s.files.get(old.uri), before)
  assert.equal((await s.loadFontLibrary()).length, 2)
  assert.equal((await s.correctRegisteredFont(old)).id, next.id)
  await assert.rejects(s.correctRegisteredFont(next), /이미/)
})

test('작업 목록 이관은 기존 폰트와 초안을 보존하고 반복 실행해도 중복되지 않는다', async () => {
  const s = storage(), font = await s.registerFontFile('file:///source.ttf', '이전 폰트', 'legacy-job')
  const draft = { schema: 1, id: 'legacy-draft', samples: { 값: { coordinateSize: 1024, strokes: [{ width: 9, points: [{ x: 100, y: 100 }] }] } } }
  await s.saveDraft(draft); await s.saveLastJob({ id: 'legacy-job', state: 'ready' })
  const beforeFonts = s.disk.get('dio-personal-fonts-v1'), beforeDraft = s.disk.get('dio-handwriting-draft-v1')
  const entries = await s.loadWorkflow(); assert.equal(entries.length, 2)
  assert.equal(entries.find(e => e.fontId === font.id).draft, null)
  assert.deepEqual(entries.find(e => e.status === 'draft').draft, draft)
  assert.deepEqual(await s.loadWorkflow(), entries)
  assert.equal(s.disk.get('dio-personal-fonts-v1'), beforeFonts); assert.equal(s.disk.get('dio-handwriting-draft-v1'), beforeDraft)
})

test('v2 작업은 파일 저장을 확정한 후에만 기존 키를 정리하고 이관 실패는 재시도한다', async () => {
  const s = storage(), entries = [{ id: 'old', name: '원본', status: 'ready', jobId: 'done', draft: { samples: { 값: 'original' } }, preview: { 안: 'data:image/png;base64,original' } }]
  const old = JSON.stringify({ schema: 2, entries }); s.disk.set('dio-handwriting-workflow-v2', old)
  s.state.failWorkflow = true
  await assert.rejects(s.loadWorkflow(), /disk full/)
  assert.equal(s.disk.get('dio-handwriting-workflow-v2'), old)
  assert.equal(s.disk.has('dio-handwriting-workflow-v3'), false)
  s.state.failWorkflow = false
  assert.deepEqual(await s.loadWorkflow(), entries)
  assert.equal(s.disk.has('dio-handwriting-workflow-v2'), false)
  assert(s.disk.get('dio-handwriting-workflow-v3').length < 150)
  assert.deepEqual(await s.loadWorkflow(), entries)
})

test('구형 완료 작업의 이관은 폰트가 등록될 때까지 등록 대기 상태를 유지한다', async () => {
  const s = storage(); s.disk.set('dio-handwriting-job-v1', JSON.stringify({id:'done',state:'ready',fontUri:'file:///font.ttf'}))
  const entries = await s.loadWorkflow()
  assert.equal(entries.find(e => e.jobId === 'done').status, 'registering')
})

test('가져온 초안은 구형 단일 AsyncStorage 값에 중복 저장하지 않는다', async () => {
  const s = storage(), draft = { schema: 1, kind: 'dio-handwriting-draft', id: 'import', samples: {}, updatedAt: 'now' }
  s.state.picked = { name: 'draft.json', bytes: new TextEncoder().encode(JSON.stringify(draft)) }
  assert.deepEqual((await s.importLocalFile()).draft, draft)
  assert.equal(s.disk.has('dio-handwriting-draft-v1'), false)
})
test('완료 등록은 동시 요청·앱 재시작에도 작업 ID 기준으로 중복되지 않는다', async () => {
  const s = storage()
  const [a, b] = await Promise.all([s.registerFontFile('file:///source.ttf', 'A', 'same'), s.registerFontFile('file:///source.ttf', 'A', 'same')])
  assert.equal(a.id, b.id)
  assert.equal((await s.registerFontFile('file:///source.ttf', 'A', 'same')).id, a.id)
  assert.equal((await s.loadFontLibrary()).length, 1)
  await s.renameFont(a.id, '새 이름')
  const renamed = (await s.loadFontLibrary())[0]; assert.equal(renamed.id, a.id); assert.equal(renamed.family, a.family); assert.equal(renamed.uri, a.uri); assert.equal(renamed.label, '새 이름')
})
test('파일·목록 저장 실패 시 원본과 목록을 보존하고 새 파일만 정리한다', async () => {
  for (const fail of ['failFile', 'failList']) {
    const s = storage(), old = await s.registerFontFile('file:///source.ttf', '원본')
    const list = s.disk.get('dio-personal-fonts-v1'), count = s.files.size
    s.state[fail] = true
    await assert.rejects(s.correctRegisteredFont(old), /disk full/)
    assert.equal(s.disk.get('dio-personal-fonts-v1'), list)
    assert.equal(s.files.size, count)
    assert.deepEqual(s.files.get(old.uri), original)
  }
})
test('사본 파일이 없으면 기존 ID를 지우지 않고 원본에서 새 사본을 복구한다', async () => {
  const s = storage(), old = await s.registerFontFile('file:///source.ttf', '가'.repeat(21) + '😀😀')
  const copy = await s.correctRegisteredFont(old)
  assert(!/[\uD800-\uDBFF] \(간격 보정\)/.test(copy.label))
  s.files.delete(copy.uri)
  const restored = await s.correctRegisteredFont(old)
  assert.notEqual(restored.id, copy.id)
  assert.equal((await s.loadFontLibrary()).find(f => f.id === copy.id).missing, true)
  assert.equal((await s.loadFontLibrary()).find(f => f.id === old.id).missing, undefined)
})
test('구형 JSON·TTF 가져오기와 보정 메타데이터 이관을 지원하며 허위 버전은 무시한다', async () => {
  const s = storage()
  s.state.picked = { name: 'old.json', bytes: new TextEncoder().encode(JSON.stringify({ kind: 'dio-font', schema: 1, label: '구형', spacingVersion: FONT_SPACING_VERSION, ttf: format.toBase64(original) })) }
  const old = (await s.importLocalFile()).font
  assert.equal(old.spacingVersion, undefined)
  const next = await s.correctRegisteredFont(old)
  await s.exportFont(next)
  const data = JSON.parse(s.state.exported)
  assert.deepEqual(data.aiGeneration, { generated: true, label: aiDisclosure.AI_FONT_LABEL, notice: aiDisclosure.AI_FONT_EXPORT_NOTICE })
  assert.deepEqual(format.fromBase64(data.ttf), s.files.get(next.uri), 'AI notice must not change font bytes')
  assert.equal(data.sourceFontId, old.id); assert.equal(data.spacingVersion, FONT_SPACING_VERSION)
  const target = storage(); target.state.picked = { name: 'copy.json', bytes: new TextEncoder().encode(s.state.exported) }
  const restored = (await target.importLocalFile()).font
  assert.equal(restored.spacingVersion, FONT_SPACING_VERSION); assert.equal(restored.sourceFontId, old.id)
  target.state.picked = { name: 'copy.ttf', bytes: s.files.get(next.uri) }
  assert.equal((await target.importLocalFile()).font.spacingVersion, FONT_SPACING_VERSION)
})

// 기기당 생성 한도(workflow.js requireGenerationSlot)는 완성 폰트를 jobId 로 센다. 이관한 폰트도 생성 폰트면 jobId 를 갖고
// (생성 폰트는 처음부터 작업 ID(sourceJob)를 달아 등록했다), 가져온 폰트 · 글자 간격 보정본은 갖지 않아야 한도를 우회하거나 잘못 막지 않는다
test('이관한 생성 폰트는 한도를 쓰고, 가져온 폰트 · 간격 보정본은 쓰지 않는다', async () => {
  const { createFontWorkflow } = await import('../src/handwriting/workflow.js')
  const flowOf = s => createFontWorkflow({ uuid: () => `new-${Math.random()}`, maxGeneratedFonts: 1,
    repository: { load: current => s.loadWorkflow(current), save: async () => {}, newDraft: () => ({ schema: 1, id: 'd', samples: {}, updatedAt: 'now' }) },
    engine: { capabilities: async () => ({ available: true, modelVersion: protocol.MODEL_VERSION }), latest: async () => null, jobDraft: async () => null, isBusy: async () => false } })

  const mine = storage()
  const generated = await mine.registerFontFile('file:///source.ttf', '내가 만든 폰트', 'job-1')
  const entries = await mine.loadWorkflow()
  assert.equal(entries.find(e => e.fontId === generated.id).jobId, 'job-1')
  const withGenerated = flowOf(mine); await withGenerated.init()
  await assert.rejects(withGenerated.create(), /1개까지/)

  const other = storage()
  const imported = await other.registerFontFile('file:///source.ttf', '가져온 폰트')
  const corrected = await other.correctRegisteredFont(imported)
  const otherEntries = await other.loadWorkflow()
  assert.deepEqual(otherEntries.map(e => [e.fontId, e.jobId]).sort(), [[corrected.id, null], [imported.id, null]].sort())
  const withoutGenerated = flowOf(other); await withoutGenerated.init()
  assert.ok(await withoutGenerated.create())
})
