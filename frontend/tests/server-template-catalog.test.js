import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { catalog } from '../src/editor/templates/data.js'
import { UNDATED_TEMPLATES } from '../src/editor/templates/undated.js'
import { getTemplate } from '../src/editor/templates/catalog.js'
import { SERVER_TEMPLATE_CATALOG, serverTemplateReference, localTemplateReference, toServerInitialPageSelections } from '../src/editor/templates/serverCatalog.js'
import { catalogContract, seedMigration, catalogResource, migrationResource } from '../scripts/generate-page-template-catalog.mjs'

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

test('버전 고정 서버 리소스·Flyway 등록 SQL이 프런트 카탈로그와 정확하게 일치한다', async () => {
  assert.deepEqual(JSON.parse(await readFile(catalogResource, 'utf8')), catalogContract())
  assert.equal(await readFile(migrationResource, 'utf8'), seedMigration())
  assert.ok(SERVER_TEMPLATE_CATALOG.every(t => t.templateCode.length <= 100 && t.templateVersion.length <= 30))
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
