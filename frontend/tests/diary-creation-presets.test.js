import test from 'node:test'
import assert from 'node:assert/strict'
import { DIARY_PRESETS, presetTemplateConfig, templateComposition } from '../src/editor/templates/presets.js'
import { configuredMonthPageIds, configuredPageIds, defaultTemplateConfig, normalizeTemplateConfig } from '../src/editor/templates/creation.js'
import { getTemplate, reusableTemplates } from '../src/editor/templates/catalog.js'
import { createDefaultDoc, migrateUntouchedAnnualDoc } from '../src/editor/state/defaultDoc.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'
import { initialCreationFlow, creationFlowReducer as reduce, activeCreationConfig } from '../src/diary/utils/creationFlow.js'
import { DEFAULT_PAPER_APPEARANCE } from '../src/editor/templates/appearance.js'
import { normalizeDiaries } from '../src/diary/utils/diaryLibrary.js'
import { readFile } from 'node:fs/promises'
import { UNDATED_TEMPLATES } from '../src/editor/templates/undated.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'

const expectations = {
  schedule: { cover: 1, divider: 12, monthly: 12, weekly: 53 },
  journal: { cover: 1, divider: 12, monthly: 12, diary: 12 },
  free: { cover: 1, divider: 12, note: 36 },
}

for (const orientation of ['landscape', 'portrait']) for (const [preset, total] of [['schedule', 9], ['journal', 4], ['free', 5]]) {
  test(`만년형 ${orientation} ${preset}: 한 달 생성·요약·복원이 일치하고 날짜가 남지 않는다`, () => {
    const config = presetTemplateConfig(preset, orientation, 'undated')
    const summary = templateComposition(config)
    const doc = createDefaultDoc({ templateConfig: config })
    assert.equal(doc.pages.length, total)
    assert.equal(summary.total, total)
    assert.equal(summary.sections.reduce((sum, section) => sum + section.count, 0), total)
    assert.equal(summary.months, 1)
    assert.equal(doc.year, null)
    assert.equal(new Set(doc.pages.map(page => page.id)).size, total)
    assert.deepEqual(configuredMonthPageIds(config), configuredPageIds(config).slice(1))
    for (const page of doc.pages) {
      const asset = getTemplate(page.backgroundAssetId, page.templateVersion)
      assert.equal(asset.orientation, orientation)
      assert.equal(asset.month, undefined)
      assert.equal(asset.weekStart, undefined)
      assert.deepEqual([page.canvasWidth, page.canvasHeight], orientation === 'portrait' ? [768, 1024] : [1024, 768])
    }
    const [entry] = normalizeDiaries([{ id: doc.id, title: doc.title, pageSize: orientation, templateConfig: JSON.parse(JSON.stringify(config)) }])
    assert.deepEqual(entry.templateConfig, normalizeTemplateConfig(config))
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc)
  })
}

test('만년형 SVG 10종의 정적 매핑·날짜 제거·요일 유지·6주 달력과 색상 출력을 확인한다', async () => {
  const mapping = await readFile(new URL('../src/editor/templates/undatedAssets.js', import.meta.url), 'utf8')
  assert.equal((mapping.match(/require\(/g) ?? []).length, UNDATED_TEMPLATES.length)
  for (const asset of UNDATED_TEMPLATES) {
    assert.ok(mapping.includes(asset.id))
    const xml = await readFile(new URL(`../assets/templates/undated/${asset.id}.svg`, import.meta.url), 'utf8')
    assert.ok(xml.includes(`id="${asset.id}"`))
    assert.ok(xml.includes(asset.orientation === 'portrait' ? 'viewBox="0 0 768 1024"' : 'viewBox="0 0 1024 768"'))
    assert.doesNotMatch(xml, /data-calendar-date=|data-iso=|aria-label="(?:\d+|\d+월|[^"\n]*2026[^"\n]*)"|<(?:text|script|image)\b/)
    if (asset.type === 'monthly') {
      assert.match(xml, /data-rows="6"/)
      assert.equal((xml.match(/data-calendar-weekday=/g) ?? []).length, 7)
    }
    if (asset.type === 'weekly') assert.equal((xml.match(/data-weekday=/g) ?? []).length, 7)
    const page = createDefaultDoc({ templateConfig: presetTemplateConfig('schedule', asset.orientation, 'undated') }).pages.find(p => getTemplate(p.backgroundAssetId).type === 'monthly')
    const snapshot = createExportSnapshot({ ...page, backgroundAssetId: asset.id, paperAppearance: { backgroundColor: '#FFF2DD', layoutColor: '#325599' } })
    const prepared = await prepareExportSnapshot(snapshot, undefined, async ref => {
      assert.equal(ref.backgroundAssetId, asset.id)
      return xml
    })
    assert.ok(JSON.stringify(prepared).includes('#FFF2DD'))
    assert.ok(JSON.stringify(prepared).includes('#325599'))
  }
})

test('날짜형·만년형 전환과 화면 왕복에서 직접 구성의 양식과 장수를 보존한다', () => {
  let flow = reduce(reduce(initialCreationFlow(), { type: 'next' }), { type: 'custom' })
  flow = reduce(flow, { type: 'configure', value: { ...flow.custom, weeklyStyle: 'journal', daily: true,
    dailyTemplates: flow.custom.dailyTemplates.map(item => ({ ...item, enabled: true, count: '2' })),
    reusable: flow.custom.reusable.map(item => ({ ...item, enabled: true, count: '3' })) } })
  flow = reduce(flow, { type: 'dateMode', value: 'undated' })
  assert.equal(templateComposition(activeCreationConfig(flow)).total, 9 + 6 + 12)
  assert.ok(configuredPageIds(activeCreationConfig(flow)).includes('undated-weekly-journal-landscape'))
  flow = reduce(flow, { type: 'colors' })
  assert.equal(activeCreationConfig(flow).dateMode, 'undated')
  flow = reduce(reduce(flow, { type: 'back' }), { type: 'back' })
  flow = reduce(flow, { type: 'dateMode', value: 'dated' })
  flow = reduce(flow, { type: 'custom' })
  assert.equal(activeCreationConfig(flow).weeklyStyle, 'journal')
  assert.equal(templateComposition(activeCreationConfig(flow)).total, 78 + 18 * 12)
  flow = reduce(flow, { type: 'orientation', value: 'portrait' })
  flow = reduce(flow, { type: 'dateMode', value: 'undated' })
  assert.ok(configuredPageIds(activeCreationConfig(flow)).every(id => id.endsWith('-portrait')))
})

test('구형 문서는 날짜형으로 해석하며 만년형에서 모두 제외하면 빈 페이지를 유지한다', () => {
  const old = defaultTemplateConfig()
  delete old.dateMode
  assert.equal(normalizeTemplateConfig(old).dateMode, 'dated')
  assert.equal(createDefaultDoc({ templateConfig: old }).pages.length, 78)
  const none = { ...defaultTemplateConfig('portrait', 'undated'), cover: false, dividers: false, monthly: false, weekly: false }
  assert.equal(createDefaultDoc({ templateConfig: none }).pages.length, 1)
  assert.equal(templateComposition(none).total, 1)
  assert.throws(() => normalizeTemplateConfig({ ...old, dateMode: 'unknown' }), /날짜형 또는 만년형/)
})
for (const orientation of ['landscape', 'portrait']) for (const preset of DIARY_PRESETS) {
  test(`${orientation} ${preset.name}: 월별 미리보기 12개를 합치면 실제 생성 순서와 일치한다`, () => {
    const config = presetTemplateConfig(preset.id, orientation)
    const months = Array.from({ length: 12 }, (_, index) => configuredMonthPageIds(config, index + 1))
    assert.deepEqual(months.flat(), configuredPageIds(config).filter(id => getTemplate(id).type !== 'cover'))
    for (const [index, ids] of months.entries()) {
      assert.equal(getTemplate(ids[0]).type, 'divider')
      assert.equal(getTemplate(ids[0]).month, index + 1)
      assert.ok(ids.every(id => getTemplate(id).orientation === orientation))
    }
    assert.equal(months[0].length, preset.id === 'schedule' ? 7 : preset.id === 'journal' ? 3 : 4)
  })
  test(`${orientation} ${preset.name}: 안내와 실제 생성 내지·장수·저장 복원이 일치한다`, () => {
    const config = presetTemplateConfig(preset.id, orientation)
    const summary = templateComposition(config)
    const doc = createDefaultDoc({ id: 'saved', title: preset.name, pageSize: orientation, templateConfig: config })
    const types = {}
    for (const page of doc.pages) {
      const asset = getTemplate(page.backgroundAssetId)
      types[asset.type] = (types[asset.type] ?? 0) + 1
      assert.equal(asset.orientation, orientation)
      assert.deepEqual(page.objects, [])
      assert.deepEqual(page.paperAppearance, DEFAULT_PAPER_APPEARANCE)
    }
    assert.deepEqual(types, expectations[preset.id])
    assert.equal(doc.pages.length, summary.total)
    assert.equal(summary.sections.reduce((sum, item) => sum + item.count, 0), summary.total)
    assert.deepEqual(doc.pages.map(page => page.backgroundAssetId), configuredPageIds(config))
    assert.equal(new Set(doc.pages.map(page => page.id)).size, summary.total)
    const restored = JSON.parse(JSON.stringify(doc))
    assert.equal(migrateUntouchedAnnualDoc(restored), restored)
    assert.deepEqual(restored, doc)
    const [entry] = normalizeDiaries([{ id: 'saved', title: preset.name, pageSize: orientation, templateConfig: config }])
    assert.deepEqual(entry.templateConfig, normalizeTemplateConfig(config))
    if (preset.id === 'free') for (const kind of ['ruled', 'grid', 'plain']) assert.equal(doc.pages.filter(page => page.backgroundAssetId.includes(`note-${kind}-`)).length, 12)
  })
}

test('기본 추천은 일정 관리용이며 세부·색상 단계를 건너뛸 수 있다', () => {
  let flow = reduce(initialCreationFlow(), { type: 'next' })
  assert.equal(flow.step, 'recommend')
  assert.equal(flow.preset, 'schedule')
  assert.deepEqual(activeCreationConfig(flow), defaultTemplateConfig())
  for (const id of ['schedule', 'journal', 'free']) {
    flow = reduce(flow, { type: 'preset', id })
    assert.equal(flow.step, 'recommend')
    assert.equal(createDefaultDoc({ templateConfig: activeCreationConfig(flow) }).pages.length, templateComposition(activeCreationConfig(flow)).total)
  }
})

test('월별 미리보기는 구분 페이지가 없어도 월 배치를 유지하고 맨 뒤 구형 추가 내지를 제외한다', () => {
  const base = presetTemplateConfig('journal')
  const config = { ...base, dividers: false, legacyEndPages: [{ assetId: '2026-reusable-note-dots-landscape', enabled: true, count: 2 }] }
  const preview = Array.from({ length: 12 }, (_, index) => configuredMonthPageIds(config, index + 1)).flat()
  assert.deepEqual(configuredPageIds(config), ['2026-cover-landscape', ...preview, '2026-reusable-note-dots-landscape', '2026-reusable-note-dots-landscape'])
})

test('미리보기의 월은 1~12월의 정수만 허용한다', () => {
  for (const month of [0, 13, 1.5, '1', NaN]) assert.throws(() => configuredMonthPageIds(defaultTemplateConfig(), month), /1~12월/)
})

test('직접 구성·추천·선택 색상·표지 화면 왕복과 방향 변경에도 수정한 장수를 보존한다', () => {
  let flow = reduce(reduce(initialCreationFlow(), { type: 'next' }), { type: 'preset', id: 'journal' })
  flow = reduce(flow, { type: 'custom' })
  assert.equal(flow.custom.daily, true)
  const config = { ...flow.custom, weekly: true, weeklyStyle: 'journal', cover: false, dividers: false,
    dailyTemplates: flow.custom.dailyTemplates.map(item => ({ ...item, enabled: true, count: '3' })),
    reusable: flow.custom.reusable.map(item => ({ ...item, enabled: true, count: '2' })) }
  flow = reduce(flow, { type: 'configure', value: config })
  flow = reduce(flow, { type: 'colors' })
  assert.equal(flow.colorReturn, 'custom')
  assert.equal(activeCreationConfig(flow), config)
  flow = reduce(flow, { type: 'back' })
  flow = reduce(flow, { type: 'back' })
  flow = reduce(flow, { type: 'preset', id: 'free' })
  flow = reduce(flow, { type: 'back' })
  flow = reduce(flow, { type: 'orientation', value: 'portrait' })
  flow = reduce(flow, { type: 'next' })
  flow = reduce(flow, { type: 'custom' })
  assert.equal(flow.custom.weeklyStyle, 'journal')
  assert.equal(flow.custom.cover, false)
  assert.equal(flow.custom.dividers, false)
  assert.ok(flow.custom.dailyTemplates.every(item => item.count === '3' && item.assetId.endsWith('-portrait')))
  assert.ok(flow.custom.reusable.every(item => item.count === '2'))
  const summary = templateComposition(flow.custom)
  assert.equal(summary.perMonth, 17)
  assert.equal(summary.total, 12 + 53 + 17 * 12)
  assert.equal(createDefaultDoc({ templateConfig: activeCreationConfig(flow) }).pages.length, summary.total)
})

test('일부 잘못된 직접 구성은 안내하고, 추천으로 돌아오면 유효한 구성을 사용한다', () => {
  let flow = reduce(reduce(initialCreationFlow(), { type: 'next' }), { type: 'custom' })
  const config = { ...flow.custom, reusable: flow.custom.reusable.map(item => ({ ...item, enabled: true, count: '' })) }
  flow = reduce(flow, { type: 'configure', value: config })
  assert.throws(() => templateComposition(activeCreationConfig(flow)), /장수/)
  flow = reduce(flow, { type: 'back' })
  assert.equal(templateComposition(activeCreationConfig(flow)).total, 78)
  flow = reduce(flow, { type: 'custom' })
  assert.equal(flow.custom, config)
})

test('모두 제외한 직접 구성은 빈 페이지 1장과 월별 추가 0장으로 안내한다', () => {
  const config = { ...defaultTemplateConfig(), cover: false, dividers: false, monthly: false, weekly: false }
  assert.equal(templateComposition(config).total, 1)
  assert.equal(templateComposition(config).perMonth, 0)
  assert.equal(createDefaultDoc({ templateConfig: config }).pages.length, 1)
})

test('내지 표시명 변경은 기존 ID·버전과 이전 문서 편집을 유지한다', () => {
  const menu = reusableTemplates()
  assert.equal(menu.find(item => item.type === 'daily').name, '하루 계획')
  assert.equal(menu.find(item => item.type === 'scrap').name, '사진·스크랩')
  const old = { id: 'old', title: '기존 다이어리', pages: [{ id: 'p', backgroundAssetId: '2026-reusable-daily-landscape', templateVersion: '1.0.0', objects: [{ id: 'old-text', type: 'text', x: 80, y: 90, w: 100, h: 30, text: '기록' }] }] }
  const before = JSON.stringify(old)
  const restored = migrateUntouchedAnnualDoc(JSON.parse(before))
  let state = createInitialState(restored)
  state = editorReducer(state, { type: 'addObjects', objects: [{ id: 'new-text', type: 'text', x: 10, y: 20, w: 100, h: 30, text: '추가' }] })
  assert.equal(getCurrentPage(state).objects.length, 2)
  assert.deepEqual(getCurrentPage(state).objects[0], old.pages[0].objects[0])
  assert.equal(getCurrentPage(state).backgroundAssetId, old.pages[0].backgroundAssetId)
  assert.equal(JSON.stringify(old), before)
})
