import test from 'node:test'
import assert from 'node:assert/strict'
import { PROMPTS, MODEL_VERSION, PREPROCESS_VERSION, componentAddresses, prepareSample, rasterize, validateDraft, jobMatchesModel } from '../src/handwriting/protocol.js'
import { fromBase64, toBase64, inspectTrueType } from '../src/handwriting/fontFormat.js'
import { getTextFonts, registerPersonalTextFonts, textStyle, textStyleSupport, markTextFontLoaded, textFontListSnapshot } from '../src/editor/utils/text.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const sample = (points, width = 9) => ({ coordinateSize: 1024, strokes: [{ width, points: points.map(([x, y]) => ({ x, y, pressure: null, time: 0 })) }] })
test('이전 모델·전처리의 작업은 현재 모델의 이어하기 입력으로 인정하지 않는다', () => {
  const current = { modelVersion: MODEL_VERSION, preprocessVersion: PREPROCESS_VERSION }
  assert.equal(jobMatchesModel(current), true)
  assert.equal(jobMatchesModel({ ...current, modelVersion: 'different-model' }), false)
  assert.equal(jobMatchesModel({ ...current, preprocessVersion: 'different-preprocessing' }), false)
  assert.equal(jobMatchesModel({ ...current, preprocessVersion: 'dio-ink-fit96-margin4-fp32-v1' }), false)
  assert.equal(jobMatchesModel(null), false)
  assert.equal(jobMatchesModel(current, 'different-native-model'), false)
  const old = { ...current, modelVersion: 'different-model', state: 'ready', fontUri: 'file:///previous.ttf' }
  jobMatchesModel(old)
  assert.equal(old.state, 'ready'); assert.equal(old.fontUri, 'file:///previous.ttf')
})
test('36개 안내 글자는 기존 모델의 68개 메모리 주소를 모두 제공한다', () => {
  assert.equal(PROMPTS.length, 36)
  assert.equal(new Set(PROMPTS.flatMap(componentAddresses)).size, 68)
  assert.deepEqual(componentAddresses('가'), [0, 19, 40])
  assert.throws(() => componentAddresses('A'))
})
test('자동 배율은 잉크 중심과 원본을 보존하고 작은/큰/비대칭 글자에 4px 여백을 남긴다', () => {
  for (const input of [sample([[420, 350], [500, 700], [650, 650]]), sample([[100, 80], [900, 900]], 18), sample([[140, 200], [500, 700], [620, 250]]), sample([[450, 350], [450, 600]], 5)]) {
    const original = JSON.stringify(input), prepared = prepareSample(input)
    assert.equal(JSON.stringify(input), original)
    assert.equal(prepared.pixels.length, 16384)
    assert(prepared.metadata.scale > 0)
    assert(Math.abs(prepared.metadata.scale / prepared.metadata.maximumSafeScale - .9) < .001)
    assert(prepared.metadata.margin >= 4)
    assert(prepared.metadata.centerError <= .2)
    assert.deepEqual(prepared.original, rasterize(input))
  }
})
test('빈 초안과 범위 밖 좌표는 생성 입력으로 전달하지 않는다', () => {
  assert.throws(() => prepareSample({ coordinateSize: 1024, strokes: [] }))
  assert.throws(() => prepareSample(sample([[-1, 40], [50, 60]])))
  assert.throws(() => validateDraft({ schema: 1, id: 'draft', samples: {} }, true))
})

test('작은 입력도 1.6배 상한 없이 안전 최대의 90%로 확대하며 재래스터 결과와 메타데이터가 일치한다', () => {
  const input = sample([[470, 460], [510, 550], [550, 480]], 18)
  const prepared = prepareSample(input), m = prepared.metadata
  assert(m.scale > 1.6)
  assert.equal(m.safetyFraction, .9)
  assert(Math.abs(m.scale / m.maximumSafeScale - .9) < .001)
  assert(m.margin >= 4)
  assert(m.centerError <= .2)
  assert.deepEqual(prepared.pixels, rasterize(input, { scale: m.scale, pivot: m.pivot, correction: m.correction }))
  assert.deepEqual(prepareSample(input), prepared)
})
test('개인 글꼴은 UUID를 유지하며 Regular만 사용하고 기본 글꼴 목록은 남는다', () => {
  const id = 'personal-11111111-2222-4333-8444-555555555555', family = 'DIOHW_11111111222243338444555555555555'
  const before = textFontListSnapshot()
  const baseIds = getTextFonts().map(font => font.id)
  registerPersonalTextFonts([{ id, family, label: '내 손글씨' }]); markTextFontLoaded(family)
  assert.equal(getTextFonts().length, baseIds.length + 1); assert(textFontListSnapshot() > before)
  assert(baseIds.every(baseId => getTextFonts().some(font => font.id === baseId)))
  assert.deepEqual(textStyleSupport(id), { bold: false, italic: true })
  const style = textStyle({ font: id, bold: true, italic: true })
  assert.equal(style.fontFamily, family); assert.equal(style.fontWeight, '400'); assert.equal(style.fontStyle, 'normal'); assert.deepEqual(style.transform, [{ skewX: '-12deg' }])
  const object = { id: 'personal-text', type: 'text', font: id, text: '한이민글', x: 0, y: 0, w: 300, h: 100, baseWidth: 300, fontSize: 32 }
  assert.equal(createExportSnapshot({ objects: [object] }).objects[0].font, id)
  registerPersonalTextFonts([{ id, family, label: '이름 변경' }])
  assert.equal(getTextFonts().find(f => f.id === id).label, '이름 변경')
  registerPersonalTextFonts([])
  assert.deepEqual(textStyleSupport(id), { bold: false, italic: true })
})
test('로컬 이관용 base64는 잘리지 않고 왕복하며 잘못된 폰트를 거부한다', () => {
  for (const size of [1, 2, 3, 12287, 12288, 12289, 60000]) {
    const data = Uint8Array.from({ length: size }, (_, i) => i % 256)
    assert.deepEqual(fromBase64(toBase64(data)), data)
  }
  assert.throws(() => fromBase64('%%%=')); assert.throws(() => inspectTrueType(new Uint8Array(200)))
})
