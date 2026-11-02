import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { catalog } from '../src/editor/templates/data.js'
import { UNDATED_TEMPLATES } from '../src/editor/templates/undated.js'
import { getTemplate } from '../src/editor/templates/catalog.js'
import { SERVER_TEMPLATE_CATALOG, serverTemplateReference, localTemplateReference, toServerInitialPageSelections, plannerTemplatesEnabled } from '../src/editor/templates/serverCatalog.js'
import { catalogContract, seedMigration, catalogResource, migrationResource, V9_CONTRACT_SHA256, normalizeV9ContractSource } from '../scripts/generate-page-template-catalog.mjs'

const plannerMigrationResource = new URL('../../backend/src/main/resources/db/migration/V25__add_study_and_daily_planner_templates.sql', import.meta.url)

test('전체 속지·플래너·빈 속지가 독립된 서버 코드로 매핑된다', () => {
  const plannerAssets = ['landscape', 'portrait'].flatMap(orientation => [
    { id: `study-planner-${orientation}`, templateVersion: '1.0.0', orientation, type: 'study' },
    { id: `day-planner-${orientation}`, templateVersion: '1.0.0', orientation, type: 'day' },
  ])
  assert.equal(SERVER_TEMPLATE_CATALOG.length, 292)
  assert.equal(new Set(SERVER_TEMPLATE_CATALOG.map(t => `${t.templateCode}\0${t.templateVersion}`)).size, 292)
  for (const asset of [...catalog.assets, ...UNDATED_TEMPLATES, ...plannerAssets]) {
    const before = structuredClone(asset)
    const ref = serverTemplateReference(asset.id, asset.templateVersion, asset.orientation)
    assert.equal(ref.templateCode, asset.id)
    const local = localTemplateReference(ref.templateCode, ref.templateVersion)
    assert.equal(local.backgroundAssetId, asset.id)
    assert.equal(getTemplate(local.backgroundAssetId, local.templateVersion).orientation, asset.orientation)
    assert.deepEqual({ width: local.canvasWidth, height: local.canvasHeight }, catalog.coordinateSystems[asset.orientation])
    assert.deepEqual(asset, before)
  }
})

test('V25 전용 빌드는 플래너 선택을 명시적으로 끌 수 있다', () => {
  assert.equal(plannerTemplatesEnabled('0'), false)
  assert.equal(plannerTemplatesEnabled('1'), true)
  assert.equal(plannerTemplatesEnabled(undefined), true)
})

test('빈 페이지는 null 에셋 참조와 방향·규격을 보존하고 명시적인 서버 코드로 매핑된다', () => {
  for (const orientation of ['landscape', 'portrait']) {
    const ref = serverTemplateReference(null, catalog.templateVersion, orientation)
    assert.equal(ref.templateCode, `dio-blank-${orientation}`)
    const local = localTemplateReference(ref.templateCode, ref.templateVersion)
    assert.equal(local.backgroundAssetId, null)
    const initial = { templateId: null, ...ref, templateConfig: { ...catalog.coordinateSystems[orientation], blank: true } }
    assert.deepEqual(JSON.parse(toServerInitialPageSelections([initial])[0].configurationJson), initial.templateConfig)
  }
})

test('중복 선택 순서와 설정은 유지하며 매핑되지 않은 ID·버전·방향·규격은 거부한다', () => {
  const ref = serverTemplateReference('2026-cover-landscape', catalog.templateVersion, 'landscape')
  const page = { templateId: ref.templateCode, ...ref, templateConfig: { width: 1024, height: 768 } }
  assert.equal(toServerInitialPageSelections([page, page]).length, 2)
  assert.throws(() => serverTemplateReference('missing', catalog.templateVersion, 'landscape'))
  assert.throws(() => serverTemplateReference(page.templateId, 'old', 'landscape'))
  assert.throws(() => serverTemplateReference(page.templateId, catalog.templateVersion, 'portrait'))
  assert.throws(() => serverTemplateReference(null, catalog.templateVersion, 'invalid'))
  assert.throws(() => localTemplateReference('missing', catalog.templateVersion))
  assert.throws(() => toServerInitialPageSelections([]))
  assert.throws(() => toServerInitialPageSelections([{ ...page, templateId: 'another-id' }]))
  assert.throws(() => toServerInitialPageSelections([{ ...page, templateConfig: { width: 768, height: 1024 } }]))
  assert.throws(() => toServerInitialPageSelections([{ ...page, templateConfig: { width: 1024, height: 768, blank: true } }]))
})

test('V9 스냅샷과 Flyway 등록 SQL은 런타임 플래너 추가와 독립적으로 고정된다', async () => {
  assert.deepEqual(JSON.parse(await readFile(catalogResource, 'utf8')), catalogContract())
  assert.equal(await readFile(migrationResource, 'utf8'), seedMigration())
  assert.equal(catalogContract().templates.length, 288)
  assert.equal(catalogContract().templates.some(t => /^(study|day)-planner-/.test(t.templateCode)), false)
  assert.equal(V9_CONTRACT_SHA256, 'a69cf406902291ed6a511ad41ac5891a4895b101f1ba490b4f6e6ed6b3fb7ad0')
  assert.equal(normalizeV9ContractSource('{\r\n  "v": 1\r\n}'), '{\n  "v": 1\n}')
  assert.ok(SERVER_TEMPLATE_CATALOG.every(t => t.templateCode.length <= 100 && t.templateVersion.length <= 30))
})

test('V25 플래너 시드는 프런트 플래너 카탈로그와 같은 코드·규격·기본 설정을 쓴다', async () => {
  const sql = await readFile(plannerMigrationResource, 'utf8')
  const planners = SERVER_TEMPLATE_CATALOG.filter(row => /^(study|day)-planner-(landscape|portrait)$/.test(row.templateCode))
  assert.equal(planners.length, 4)
  planners.forEach((row, index) => {
    const seed = `('${row.templateCode}', '${row.templateVersion}', '${row.name}', '${row.category}', '${row.orientation}', ${row.canvasWidth}, ${row.canvasHeight}, '${JSON.stringify(row.defaultConfig)}'::jsonb, ${index + 1})`
    assert.ok(sql.includes(seed), `missing V25 seed: ${row.templateCode}`)
  })
})

test('DB 숫자 PK나 다른 속지 ID를 프런트 속지 ID 대신 보내지 않는다', () => {
  const ref = serverTemplateReference('2026-cover-landscape', catalog.templateVersion, 'landscape')
  const config = { width: 1024, height: 768 }
  assert.throws(() => toServerInitialPageSelections([{ templateId: 987, ...ref, templateConfig: config }]))
  assert.throws(() => toServerInitialPageSelections([{ templateId: 'another-template', ...ref, templateConfig: config }]))
  const [selection] = toServerInitialPageSelections([{ templateId: ref.templateCode, ...ref, templateConfig: config }])
  assert.equal(selection.templateCode, '2026-cover-landscape')
  assert.equal('templateId' in selection, false)
})
