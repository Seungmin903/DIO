import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TASTING_ID, TASTING_V2_ID, TASTING_V2_LANDSCAPE_ID, tastingLayout, tastingMarks, tastingPhotoBox } from '../src/editor/templates/tastingGeometry.js'
import { tastingBaseSvg, tastingOverlaySvg, applyTastingStroke, eraseTastingStroke } from '../src/editor/templates/tastingPaper.js'
import { remoteTemplateList } from '../src/editor/templates/remoteTemplates.js'
import { localTemplateReference, serverTemplateReference } from '../src/editor/templates/serverCatalog.js'
import { plannerFor } from '../src/editor/templates/planners.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { paperById, papersIn } from '../src/diary/utils/paperChoice.js'

test('new tasting pages have independent IDs and retain old template', () => {
  assert.ok(remoteTemplateList().some(item => item.id === 'tasting-note-v2'))
  assert.ok(papersIn('diary').some(item => item.id === 'remote:tasting-note-v2'))
  assert.ok(!papersIn('diary').some(item => item.id === 'remote:tasting-note'))
  assert.equal(paperById('remote:tasting-note').name, '테이스팅 노트')
  assert.equal(tastingLayout(TASTING_ID).sourceWidth, 1058)
  for (const [id, direction] of [[TASTING_V2_ID, 'portrait'], [TASTING_V2_LANDSCAPE_ID, 'landscape']]) {
    const saved = serverTemplateReference(id, '1.0.0', direction)
    assert.equal(localTemplateReference(saved.templateCode, saved.templateVersion, { remoteTemplate: 'tasting-note-v2' }).backgroundAssetId, id)
    assert.equal(plannerFor(id).kind, 'tasting')
  }
})

test('v2 photo boxes match each SVG and maintain a 3:4 ratio', () => {
  for (const [id, orientation] of [[TASTING_V2_ID, 'portrait'], [TASTING_V2_LANDSCAPE_ID, 'landscape']]) {
    const box = tastingPhotoBox(id), svg = tastingBaseSvg(id)
    assert.equal(box.width / box.height, 3 / 4)
    assert.match(svg, new RegExp(`id="photo-frame" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"`))
    assert.equal(svg, readFileSync(new URL(`../assets/templates/tasting-note-v2/tasting-${orientation}.svg`, import.meta.url), 'utf8'))
    assert.doesNotMatch(svg, /<text\b|data:font|사진 추가/)
  }
})

test('each v2 mark can be filled and erased at its own SVG coordinates', () => {
  for (const id of [TASTING_V2_ID, TASTING_V2_LANDSCAPE_ID]) {
    const svg = tastingBaseSvg(id)
    for (const mark of tastingMarks(id)) {
      if (mark.kind === 'circle') assert.match(svg, new RegExp(`cx="${mark.x}" cy="${mark.y}" r="${mark.radius}"`))
      else assert.ok(svg.includes(`translate(${mark.x} ${mark.y})`))
      const next = applyTastingStroke(null, [{ x: mark.x - 5, y: mark.y }, { x: mark.x + 5, y: mark.y }], { color: '#123456' }, id)
      assert.deepEqual(next?.fills, { [mark.id]: '#123456' }, `${id}: ${mark.id}`)
      assert.match(tastingOverlaySvg(next, id), /#123456/)
      assert.deepEqual(eraseTastingStroke(next, [{ x: mark.x, y: mark.y }], id).fills, {})
    }
  }
})

test('a stroke across the second revisit row fills only that row', () => {
  for (const id of [TASTING_V2_ID, TASTING_V2_LANDSCAPE_ID]) {
    const mark = tastingMarks(id).find(item => item.id === 'again-2')
    const result = applyTastingStroke(null, [{ x: mark.x - 8, y: mark.y }, { x: mark.x + 8, y: mark.y }], { color: '#112233' }, id)
    assert.deepEqual(result.fills, { 'again-2': '#112233' })
  }
})

test('v2 exported page includes mark fills and excludes the photo button', async () => {
  for (const id of [TASTING_V2_ID, TASTING_V2_LANDSCAPE_ID]) {
    const layout = tastingLayout(id)
    const page = { id: 'page', backgroundAssetId: id, templateVersion: '1.0.0', canvasWidth: layout.width, canvasHeight: layout.height, objects: [], planner: { fills: { 'star-0': '#ff0000', 'again-2': '#00aa22' } } }
    const output = await prepareExportSnapshot(createExportSnapshot(page), async () => null, async () => 'unused')
    try {
      assert.match(output.backgroundXml, /#ff0000/)
      assert.match(output.backgroundXml, /#00aa22/)
      assert.doesNotMatch(output.backgroundXml, /사진 추가/)
    } finally { output.dispose() }
  }
})
