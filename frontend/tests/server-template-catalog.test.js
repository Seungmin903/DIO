import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { catalog } from '../src/editor/templates/data.js'
import { UNDATED_TEMPLATES } from '../src/editor/templates/undated.js'
import { getTemplate } from '../src/editor/templates/catalog.js'
import { SERVER_TEMPLATE_CATALOG, serverTemplateConfigFor, serverTemplateReference, localTemplateReference, toServerInitialPageSelections, plannerTemplatesEnabled } from '../src/editor/templates/serverCatalog.js'
import { catalogContract, seedMigration, catalogResource, migrationResource, V9_CONTRACT_SHA256, normalizeV9ContractSource } from '../scripts/generate-page-template-catalog.mjs'

const remoteMigrationResource = new URL('../../backend/src/main/resources/db/migration/V34__add_remote_page_templates.sql', import.meta.url)
const routeMigrationResource = new URL('../../backend/src/main/resources/db/migration/V36__add_travel_route_templates.sql', import.meta.url)
const inkRecordMigrationResource = new URL('../../backend/src/main/resources/db/migration/V45__add_ink_record_templates.sql', import.meta.url)

test('V34 원격 속지 시드는 프런트 원격 행과 같은 코드·규격·기본 설정을 쓴다', async () => {
  const sql = await readFile(remoteMigrationResource, 'utf8')
  const rows = SERVER_TEMPLATE_CATALOG.filter(row => row.remote)
  assert.deepEqual(rows.map(row => row.templateCode), ['dio-remote-landscape', 'dio-remote-portrait'])
  for (const row of rows) {
    const seed = `('${row.templateCode}', '${row.templateVersion}', '${row.name}', '${row.category}', '${row.orientation}', ${row.canvasWidth}, ${row.canvasHeight}, '${JSON.stringify(row.defaultConfig)}'::jsonb`
    assert.ok(sql.includes(seed), `missing V34 seed: ${row.templateCode}`)
  }
})

test('원격 속지는 범용 서버 행과 remoteTemplate 설정으로 오가고, 어긋난 조합은 거부한다', () => {
  for (const orientation of ['landscape', 'portrait']) {
    const assetId = `remote-spring-note-${orientation}`
    const ref = serverTemplateReference(assetId, '1.0.0', orientation)
    assert.equal(ref.templateCode, `dio-remote-${orientation}`)
    assert.deepEqual(serverTemplateConfigFor(assetId), { remoteTemplate: 'spring-note' })
    const local = localTemplateReference(ref.templateCode, ref.templateVersion, { remoteTemplate: 'spring-note' })
    assert.equal(local.backgroundAssetId, assetId)
    assert.equal(getTemplate(assetId, local.templateVersion).orientation, orientation) // 목록을 못 받아도 방향은 안다
    const config = { ...catalog.coordinateSystems[orientation], remoteTemplate: 'spring-note' }
    assert.deepEqual(JSON.parse(toServerInitialPageSelections([{ templateId: assetId, ...ref, templateConfig: config }])[0].configurationJson), config)
    assert.throws(() => localTemplateReference(ref.templateCode, ref.templateVersion)) // remoteTemplate 없음
    assert.throws(() => localTemplateReference(ref.templateCode, ref.templateVersion, { remoteTemplate: '../x' }))
    assert.throws(() => toServerInitialPageSelections([{ templateId: assetId, ...ref, templateConfig: { ...config, remoteTemplate: 'other' } }]))
    assert.throws(() => toServerInitialPageSelections([{ templateId: assetId, ...ref, templateConfig: { ...config, blank: true } }]))
  }
  assert.throws(() => serverTemplateReference('remote-spring-note-landscape', '1.0.0', 'portrait'))
  assert.throws(() => serverTemplateReference('remote-spring-note-landscape', '2.0.0', 'landscape'))
  assert.equal(serverTemplateConfigFor('2026-cover-landscape').remoteTemplate, undefined)
  // 일반 속지에 remoteTemplate 을 보내면 서버가 거부하므로 앞에서 막는다
  const cover = serverTemplateReference('2026-cover-landscape', catalog.templateVersion, 'landscape')
  assert.throws(() => toServerInitialPageSelections([{ templateId: '2026-cover-landscape', ...cover, templateConfig: { width: 1024, height: 768, remoteTemplate: 'x' } }]))
})

const plannerMigrationResource = new URL('../../backend/src/main/resources/db/migration/V27__add_study_and_daily_planner_templates.sql', import.meta.url)

test('전체 속지·플래너·빈 속지가 독립된 서버 코드로 매핑된다', () => {
  const plannerAssets = ['landscape', 'portrait'].flatMap(orientation => [
    { id: `study-planner-${orientation}`, templateVersion: '1.0.0', orientation, type: 'study' },
    { id: `day-planner-${orientation}`, templateVersion: '1.0.0', orientation, type: 'day' },
    { id: `route-planner-${orientation}`, templateVersion: '1.0.0', orientation, type: 'route' },
  ])
  // V9 288 + V27 플래너 4 + V34 원격 속지 2 + V36 여행 노선 2 + V45 발색 기록 4
  assert.equal(SERVER_TEMPLATE_CATALOG.length, 300)
  assert.equal(new Set(SERVER_TEMPLATE_CATALOG.map(t => `${t.templateCode}\0${t.templateVersion}`)).size, 300)
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

test('V27 전용 빌드는 플래너 선택을 명시적으로 끌 수 있다', () => {
  assert.equal(plannerTemplatesEnabled('0'), false)
  assert.equal(plannerTemplatesEnabled('1'), true)
  assert.equal(plannerTemplatesEnabled(undefined), true)
})

// 플래그는 import 시점에 고정되므로 값을 0으로 둔 자식 프로세스에서 모듈을 새로 읽어 확인한다.
test('플래그 0 빌드는 플래너 선택·생성을 막고 예전 하루 계획 메뉴와 기존 플래너 해석은 유지한다', () => {
  const source = `
    import assert from 'node:assert/strict'
    import { reusableTemplates, getTemplate } from ${JSON.stringify(new URL('../src/editor/templates/catalog.js', import.meta.url).href)}
    import { SERVER_TEMPLATE_CATALOG, PLANNER_TEMPLATE_SELECTION_ENABLED, serverTemplateSelectable, serverTemplateReference, toServerInitialPageSelections, localTemplateReference } from ${JSON.stringify(new URL('../src/editor/templates/serverCatalog.js', import.meta.url).href)}
    import { createServerPage } from ${JSON.stringify(new URL('../src/collaboration/serverPages.js', import.meta.url).href)}
    import { DAILY_ASSET_ID, defaultTemplateConfig, normalizeTemplateConfig, configuredPageIds, replacedAssetId } from ${JSON.stringify(new URL('../src/editor/templates/creation.js', import.meta.url).href)}
    assert.equal(DAILY_ASSET_ID, '2026-reusable-daily-landscape')
    assert.equal(PLANNER_TEMPLATE_SELECTION_ENABLED, false)
    const planners = SERVER_TEMPLATE_CATALOG.filter(row => /^(study|day)-planner-/.test(row.templateCode))
    assert.equal(planners.length, 4)
    for (const row of planners) {
      const orientation = row.orientation.toLowerCase()
      assert.equal(serverTemplateSelectable(row), false)
      assert.throws(() => serverTemplateReference(row.backgroundAssetId, row.templateVersion, orientation))
      assert.throws(() => toServerInitialPageSelections([{ templateCode: row.templateCode, templateVersion: row.templateVersion,
        templateId: row.backgroundAssetId, templateConfig: { ...row.defaultConfig } }]))
      assert.equal(localTemplateReference(row.templateCode, row.templateVersion).backgroundAssetId, row.backgroundAssetId)
      assert.equal(getTemplate(row.backgroundAssetId, row.templateVersion).orientation, orientation)
      let calls = 0
      await assert.rejects(createServerPage({ transport: async () => { calls++ }, diaryId: '00000000-0000-4000-8000-000000000000',
        backgroundAssetId: row.backgroundAssetId, orientation, storage: { getItem: async () => null }, key: 'k', createId: () => 'x' }),
        { code: 'INVALID_SERVER_PAGES' })
      assert.equal(calls, 0)
    }
    for (const orientation of ['landscape', 'portrait']) {
      const menu = reusableTemplates(orientation)
      assert.deepEqual(menu.filter(item => ['study', 'day'].includes(item.type)), [])
      assert.equal(menu[0].type, 'daily')
      assert.equal(menu[0].assetId, '2026-reusable-daily-' + orientation)
      assert.equal(replacedAssetId(menu[0].assetId), menu[0].assetId)
      const config = normalizeTemplateConfig({ ...defaultTemplateConfig(orientation), year: 2026, startMonth: 1, months: 1,
        cover: false, dividers: false, monthly: false, weekly: false, daily: true })
      assert.deepEqual(configuredPageIds(config), [menu[0].assetId])
      const legacy = normalizeTemplateConfig({year:2026,startMonth:1,months:1,daily:true,dailyCount:2,orientation})
      assert.deepEqual(configuredPageIds(legacy), [menu[0].assetId,menu[0].assetId])
      assert.equal(serverTemplateReference(menu[0].assetId, getTemplate(menu[0].assetId).templateVersion, orientation).templateCode, menu[0].assetId)
    }
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, EXPO_PUBLIC_PLANNER_TEMPLATES_ENABLED: '0' }, encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
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

test('V27 플래너 시드는 프런트 플래너 카탈로그와 같은 코드·규격·기본 설정을 쓴다', async () => {
  const sql = await readFile(plannerMigrationResource, 'utf8')
  const planners = SERVER_TEMPLATE_CATALOG.filter(row => /^(study|day)-planner-(landscape|portrait)$/.test(row.templateCode))
  assert.equal(planners.length, 4)
  planners.forEach((row, index) => {
    const seed = `('${row.templateCode}', '${row.templateVersion}', '${row.name}', '${row.category}', '${row.orientation}', ${row.canvasWidth}, ${row.canvasHeight}, '${JSON.stringify(row.defaultConfig)}'::jsonb, ${index + 1})`
    assert.ok(sql.includes(seed), `missing V27 seed: ${row.templateCode}`)
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

test('V36 여행 노선 시드는 프런트 노선 속지 행과 같은 코드·규격·기본 설정을 쓴다', async () => {
  const sql = await readFile(routeMigrationResource, 'utf8')
  const rows = SERVER_TEMPLATE_CATALOG.filter(row => /^route-planner-(landscape|portrait)$/.test(row.templateCode))
  assert.deepEqual(rows.map(row => [row.templateCode, row.category, row.name]), [['route-planner-landscape', 'ROUTE', '여행 노선'], ['route-planner-portrait', 'ROUTE', '여행 노선']])
  rows.forEach((row, index) => {
    const seed = `('${row.templateCode}', '${row.templateVersion}', '${row.name}', '${row.category}', '${row.orientation}', ${row.canvasWidth}, ${row.canvasHeight}, '${JSON.stringify(row.defaultConfig)}'::jsonb, ${index + 1})`
    assert.ok(sql.includes(seed), `missing V36 seed: ${row.templateCode}`)
  })
  assert.equal(catalogContract().templates.some(t => /^route-planner-/.test(t.templateCode)), false, 'V9 고정 계약에는 들어가지 않는다')
})

test('V45 발색 기록 시드는 프런트 행과 같은 코드·규격·기본 설정을 쓴다', async () => {
  const sql = await readFile(inkRecordMigrationResource, 'utf8')
  const rows = SERVER_TEMPLATE_CATALOG.filter(row => row.category === 'INKRECORD')
  assert.equal(rows.length, 4)
  for (const row of rows) {
    const seed = `('${row.templateCode}', '${row.templateVersion}', '${row.name}', '${row.category}', '${row.orientation}', ${row.canvasWidth}, ${row.canvasHeight}, '${JSON.stringify(row.defaultConfig)}'::jsonb`
    assert.ok(sql.includes(seed), `missing V45 seed: ${row.templateCode}`)
  }
})
