import test from 'node:test'
import assert from 'node:assert/strict'
import { tastingBaseSvg, tastingOverlaySvg, tastingSvg, applyTastingStroke, eraseTastingStroke } from '../src/editor/templates/tastingPaper.js'
import { plannerFor } from '../src/editor/templates/planners.js'
import { TASTING_ID, TASTING_LANDSCAPE_ID, tastingPhotoBox, tastingLayout, tastingMarks } from '../src/editor/templates/tastingGeometry.js'
import { remoteTemplateList } from '../src/editor/templates/remoteTemplates.js'
import { serverTemplateReference, localTemplateReference } from '../src/editor/templates/serverCatalog.js'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { readFileSync } from 'node:fs'
import { TASTING_PORTRAIT_SVG, TASTING_LANDSCAPE_SVG } from '../src/editor/templates/tastingReferenceSvg.js'

test('빈 속지는 사진 안내 없이 인쇄 항목과 가이드를 포함한다', () => {
  const svg = tastingBaseSvg()
  assert.match(svg, /aria-label="테이스팅 노트"/)
  assert.doesNotMatch(svg, /<text\b/)
  assert.doesNotMatch(svg, /사진 추가/)
  assert.match(svg, /#a5a6aa/)
  assert.equal(TASTING_PORTRAIT_SVG, readFileSync(new URL('../assets/templates/tasting-note/tasting-portrait.svg', import.meta.url), 'utf8'))
  assert.equal(TASTING_LANDSCAPE_SVG, readFileSync(new URL('../assets/templates/tasting-note/tasting-landscape.svg', import.meta.url), 'utf8'))
})

test('지우개는 닿은 채움만 지우고 출력에는 남은 채움이 들어간다', () => {
  const original = { fills: { 'star-0': '#ff0000', 'star-1': '#00ff00' } }
  const next = eraseTastingStroke(original, [{ x: 455, y: 298 }, { x: 472, y: 298 }])
  assert.deepEqual(next.fills, { 'star-1': '#00ff00' })
  assert.match(tastingSvg(next), /#00ff00/)
  assert.doesNotMatch(tastingSvg(next), /#ff0000/)
  assert.equal(original.fills['star-0'], '#ff0000')
})

test('방문 원의 가장자리를 지나는 짧은 지우개 이동도 즉시 지운다', () => {
  const value = { fills: { 'visit-0': '#123456', 'again-0': '#abcdef' } }
  const next = eraseTastingStroke(value, [{ x: 187, y: 379 }, { x: 189, y: 379 }])
  assert.deepEqual(next.fills, { 'again-0': '#abcdef' })
})

test('지나간 별만 현재 색으로 채우고 다른 기록을 보존한다', () => {
  const next = applyTastingStroke({ fills: { 'visit-0': '#123456' } }, [{ x: 450, y: 298 }, { x: 600, y: 298 }], { color: '#aabbcc' })
  assert.deepEqual(Object.keys(next.fills), ['visit-0', 'star-0', 'star-1', 'star-2'])
  assert.match(tastingOverlaySvg(next), /#aabbcc/)
  assert.equal(applyTastingStroke(next, [{ x: 1, y: 1 }, { x: 20, y: 1 }], {}), null)
})

test('편집기 플래너 경로에서 칠하기, 지우기, 출력 SVG를 제공한다', () => {
  const api = plannerFor(TASTING_ID)
  assert.equal(api.kind, 'tasting')
  const points = [{ x: 455, y: 298 }, { x: 472, y: 298 }]
  const result = api.stroke(null, points, { color: '#ff0000' })
  assert.match(api.svg(result.planner), /#ff0000/)
  assert.deepEqual(api.erase(result.planner, points).fills, {})
  assert.equal(plannerFor('remote-other-portrait'), null)
  const landscape = plannerFor('remote-tasting-note-landscape')
  const moved = [{ x: 459, y: 271.5 }, { x: 475, y: 271.5 }]
  assert.ok(landscape.stroke(null, moved, { color: '#ff0000' }).planner.fills['star-0'])
  assert.match(landscape.baseSvg(), /viewBox="0 0 1024 768"/)
})

test('목록과 서버 저장 참조가 같은 속지를 가리킨다', () => {
  assert.equal(remoteTemplateList().find(item => item.id === 'tasting-note')?.name, '테이스팅 노트')
  const saved = serverTemplateReference(TASTING_ID, '1.0.0', 'portrait')
  assert.equal(saved.templateCode, 'dio-remote-portrait')
  assert.equal(localTemplateReference(saved.templateCode, saved.templateVersion, { remoteTemplate: 'tasting-note' }).backgroundAssetId, TASTING_ID)
})

test('가로·세로 사진과 선택 도형 좌표는 각각 원본 SVG의 위치를 따른다', () => {
  for (const id of [TASTING_ID, TASTING_LANDSCAPE_ID]) {
    const L = tastingLayout(id), photo = tastingPhotoBox(id), svg = tastingBaseSvg(id)
    assert.match(svg, new RegExp(`id="photo-area"[^>]*x="${L.photo.x}"[^>]*y="${L.photo.y}"`))
    assert.ok(Math.abs(photo.width - L.photo.width * L.width / L.sourceWidth) < 0.001)
    for (const mark of tastingMarks(id)) {
      const p = { x: mark.x * L.width / L.sourceWidth, y: mark.y * L.height / L.sourceHeight }
      const next = applyTastingStroke(null, [{ x: p.x - 5, y: p.y }, { x: p.x + 5, y: p.y }], { color: '#112233' }, id)
      assert.ok(next?.fills[mark.id], `${id} ${mark.id}`)
      assert.deepEqual(eraseTastingStroke(next, [p], id).fills, {})
    }
  }
})

test('내보내기 배경에 채운 별이 포함되고 사진 추가 안내는 포함되지 않는다', async () => {
  for (const id of [TASTING_ID, TASTING_LANDSCAPE_ID]) {
    const L = tastingLayout(id)
    const page = { id: 'test', backgroundAssetId: id, templateVersion: '1.0.0', canvasWidth: L.width, canvasHeight: L.height, objects: [], planner: { fills: { 'star-0': '#ff0000', 'again-1': '#00aa22' } } }
    const output = await prepareExportSnapshot(createExportSnapshot(page), async () => null, async () => 'unused')
    try {
      assert.match(output.backgroundXml, /#ff0000/)
      assert.match(output.backgroundXml, /#00aa22/)
      assert.doesNotMatch(output.backgroundXml, /사진 추가/)
      assert.match(output.backgroundXml, new RegExp(`viewBox="0 0 ${L.width} ${L.height}"`))
    } finally { output.dispose() }
  }
})
