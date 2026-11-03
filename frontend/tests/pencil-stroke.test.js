import test from 'node:test'
import assert from 'node:assert/strict'
import { pencilLayerPaths, pencilLook, pencilPreviewPaths } from '../src/editor/utils/pencilStroke.js'
import { DUST_PATTERN, PAPER_PATTERNS, paperClass, paperCoverage, paperPatternIndex } from '../src/editor/utils/pencilTexture.js'
import { withDistances } from '../src/editor/utils/nibStroke.js'
import { createStrokePreview } from '../src/editor/utils/strokePreview.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createStroke } from '../src/editor/utils/strokes.js'

const wave = n => Array.from({ length: n }, (_, i) => ({ x: i * 2, y: Math.sin(i / 9) * 15 }))
const numbers = path => path.match(/-?\d+(\.\d+)?/g).map(Number)
const extent = path => { const ys = numbers(path).filter((_, i) => i % 2); return Math.max(...ys) - Math.min(...ys) }

test('연필은 불투명한 몸통(종이 결 구멍) · 테두리 알갱이 띠 · 바깥 가루이고, 굵으면 몸통이 세 겹이다', () => {
  const stroke = createStroke(wave(80), { kind: 'pencil', width: 5 })
  const [body, middle, core, edge, dust] = pencilLayerPaths(stroke, 5)
  assert.doesNotMatch(body + middle + core + edge + dust, /NaN|Infinity/)
  // 굵은 연필은 테두리 띠가 없다(윤곽선처럼 보였다). 가루만 몸통보다 조금 넓다
  assert.equal(edge, '')
  assert.ok(extent(dust) > extent(body))
  // 굵기 5(4.5 이상)는 가운데로 갈수록 좁은 몸통 세 겹이 쌓인다
  assert.ok(extent(body) > extent(middle) && extent(body) > extent(core))
  // 가는 연필: 바깥 성긴 결 + 안쪽 거의 꽉 찬 결 두 겹(중간 겹 없음)
  const thin = pencilLayerPaths(createStroke(wave(80), { kind: 'pencil', width: 3 }), 2.55)
  assert.equal(thin[1], ''); assert.ok(thin[2].length > 0)
  assert.ok(extent(thin[4]) > extent(thin[3]) && extent(thin[3]) > extent(thin[0]), '가는 연필: 테두리 띠 · 가루가 몸통보다 조금씩 넓다')
  // 결 무늬: 굵기 등급마다 4가지 위상, 꽉 찬 사각 + 구멍 수백 개(evenodd), 획 id 로 고정 선택
  for (const name of ['small', 'medium', 'tooth']) {
    assert.equal(PAPER_PATTERNS[name].length, 4)
    for (const pattern of PAPER_PATTERNS[name]) {
      assert.match(pattern.base, /^M0 0H240V240H0Z/)
      assert.ok((pattern.base.match(/Z/g) ?? []).length > 70)
      // 알갱이마다 진하기가 다르다: 반쯤 메운 구멍 · 진한 알갱이가 따로 있다
      assert.ok(pattern.half.length > 0 && pattern.dark.length > 0)
      assert.ok(pattern.base.length + pattern.half.length + pattern.dark.length < 30000, '획마다 복사되는 무늬 길이')
    }
  }
  assert.equal(paperPatternIndex(7), paperPatternIndex(7))
  assert.deepEqual([2.5, 4, 5, 10].map(paperClass), ['small', 'medium', 'tooth', 'tooth'])
  assert.ok(DUST_PATTERN.length > 0)
  // 탭은 원(겹마다)
  assert.equal(pencilLayerPaths(createStroke([{ x: 1, y: 1 }], { kind: 'pencil', width: 5 }), 4.25).filter(Boolean).length, 4)
})

test('종이 결: 얇은 연필은 아주 은은하게(1% 안팎), 굵은 연필은 겹마다 약 40% — 세 겹이 쌓이면 가운데로 갈수록 진하다', () => {
  const small = paperCoverage('small', 0, 80), medium = paperCoverage('medium', 0, 80), tooth = paperCoverage('tooth', 0, 80)
  assert.ok(small < 0.015 && medium < 0.02, `${small} ${medium}`)
  assert.ok(tooth > 0.36 && tooth < 0.44, String(tooth))
})

test('연필 가장자리는 좌우가 따로 거칠다', () => {
  const stroke = createStroke(Array.from({ length: 101 }, (_, i) => ({ x: i * 2, y: 0 })), { kind: 'pencil', width: 10 })
  const [body] = pencilLayerPaths(stroke, 8.5)
  const n = numbers(body), tops = [], bottoms = []
  for (let x = 40; x <= 160; x += 4) {
    const ys = []
    for (let i = 0; i < n.length; i += 2) if (Math.abs(n[i] + stroke.x - x) < 1.6) ys.push(n[i + 1] + stroke.y)
    tops.push(Math.min(...ys)); bottoms.push(Math.max(...ys))
  }
  const spread = values => Math.max(...values) - Math.min(...values)
  assert.ok(spread(tops) > 0.15 && spread(bottoms) > 0.15)
  assert.ok(spread(tops.map((top, i) => top + bottoms[i])) > 0.1, '위 · 아래가 같이 움직이지 않는다')
})

test('그리는 중 끝난 구간은 다시 계산하지 않고, 저장한 획과 같은 결 위치를 쓴다', () => {
  const points = withDistances(wave(300))
  const preview = createStrokePreview()
  // 필기 중에는 같은 배열이 자란다
  const growing = points.slice(0, 200)
  const early = preview.snapshot(growing)
  const first = pencilPreviewPaths(early, 5, 4.25)
  growing.push(...points.slice(200))
  const later = preview.snapshot(growing)
  assert.equal(early[0], later[0], '끝난 구간은 같은 객체')
  const second = pencilPreviewPaths(later, 5, 4.25)
  assert.ok(second[0].startsWith(first[0].slice(0, 2000)), '앞 구간 외곽선이 그대로')
  // 저장 획과 미리보기의 외곽선 범위가 같다
  const stroke = createStroke(points.map(({ inkDistance, ...p }) => p), { kind: 'pencil', width: 5 })
  const saved = pencilLayerPaths(stroke, 4.25)[0], live = second[0]
  assert.ok(Math.abs(extent(saved) - extent(live)) < 0.3)
})

test('연필을 닿은 부분만 지워도 남은 조각의 외곽선은 그대로다', () => {
  const stroke = createStroke(wave(120), { id: 'p', kind: 'pencil', width: 6 })
  const session = createEraserSession([stroke], 6, 'area')
  session.move({ x: 120 + stroke.x * 0, y: Math.sin(60 / 9) * 15 })
  const result = session.finish()
  const fragments = result.replacements.p
  assert.ok(fragments.length >= 1)
  assert.ok(fragments.every(f => f.sampled))
  // 조각을 다시 그려도(다시 지워도) 같은 표본을 쓴다
  const again = createEraserSession(fragments, 6, 'area')
  again.move({ x: -500, y: -500 })
  assert.equal(again.finish(), null)
  const [body] = pencilLayerPaths(fragments[0], 5.1)
  assert.equal(pencilLayerPaths(fragments[0], 5.1)[0], body)
})

test('필압이 약하면 연필이 얇아지되 겹이 함께 좁아져 성긴 띠 가운데 심 한 줄이 남지 않는다', () => {
  const at = force => Array.from({ length: 60 }, (_, i) => ({ x: i * 2, y: 0, pressure: force }))
  const strong = pencilLayerPaths(createStroke(at(0.85), { kind: 'pencil', width: 8 }), 6.8)
  const weak = pencilLayerPaths(createStroke(at(0.85 * 0.7), { kind: 'pencil', width: 8 }), 6.8)
  const outer = extent(weak[0]) / extent(strong[0]), core = extent(weak[2]) / extent(strong[2])
  assert.ok(outer < 0.85, '바깥 폭이 좁다')
  assert.ok(Math.abs(core - outer) < 0.12, `가운데 겹도 같은 비율로(${core} · ${outer})`)
  assert.ok(numbers(weak[1]).length > 0, '갉는 겹은 남아 있다')
})

test('연필을 기울이면 바깥 겹은 넓어지고 진한 안쪽 겹은 좁아진다', () => {
  const at = tilt => Array.from({ length: 60 }, (_, i) => ({ x: i * 2, y: 0, pressure: 0.85, tiltX: tilt, tiltY: 0 }))
  const upright = pencilLayerPaths(createStroke(at(0), { kind: 'pencil', width: 8, renderVersion: 3 }), 6.8)
  const slanted = pencilLayerPaths(createStroke(at(65), { kind: 'pencil', width: 8, renderVersion: 3 }), 6.8)
  assert.ok(extent(slanted[0]) > extent(upright[0]) * 1.35)
  assert.ok(extent(slanted[2]) < extent(upright[2]))
})

test('안드로이드 S펜 센서 값이 있으면 펜 이벤트의 고정 필압 · 기울기를 바꾼다', async () => {
  const { withStylusSensor } = await import('../src/editor/utils/stylusSensor.js')
  const event = { pointerType: 'pen', pressure: 0.5, tiltX: 0, tiltY: 0 }
  assert.deepEqual(withStylusSensor(event), event, '모듈이 없으면 그대로')
})

test('안드로이드 터치 경로도 같은 때 본 펜 센서 값이면 펜 필압 · 기울기를 붙이고, 손가락은 그대로 둔다', async () => {
  globalThis.expo = { modules: { DioStylus: { sample: () => [0.3, 20, -10, 1000] } } }
  try {
    const { withStylusSensor } = await import('../src/editor/utils/stylusSensor.js?touch')
    assert.deepEqual(withStylusSensor({ timestamp: 990, force: 0 }), { timestamp: 990, force: 0, pointerType: 'pen', pressure: 0.3, tiltX: 20, tiltY: -10 })
    assert.equal(withStylusSensor({ timestamp: 1100, force: 0 }).pointerType, undefined, '펜보다 늦게 닿은 손가락')
    assert.equal(withStylusSensor({ timestamp: 990, isRelease: true }).pressure, undefined, '뗄 때 필압은 덮지 않는다')
    assert.equal(withStylusSensor({ timestamp: 990, pointerType: 'touch' }).pressure, undefined)
  } finally { delete globalThis.expo }
})
