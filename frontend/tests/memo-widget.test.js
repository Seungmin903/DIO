import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as shapes from '../src/editor/utils/editorShapes.js'
import { MEMO_ARTS } from '../src/editor/widgets/memoArt.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const load = (file, mocks) => {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id], module, module.exports)
  return module.exports
}
const memo = load('../src/editor/widgets/memo.js', { '../utils/editorShapes': shapes, './memoArt': { MEMO_ARTS } })

test('기본 메모지 14종은 윤곽선 없는 단색 종이 + 무늬 하나 그림이고, 캐릭터 · 창 점 말고는 색 자리 두 개 밖의 색 · 글자가 없다', () => {
  assert.deepEqual(MEMO_ARTS.map((art) => art.name), ['무지 메모', '줄 메모', '모눈 메모', '도트 메모', '체크 메모', '인덱스 카드', '영수증', '뜯은 노트', 'MEMO 메모', '모아 메모', '디오 메모', '창 메모', '각진 잉크병 메모', '둥근 잉크병 메모'])
  for (const art of MEMO_ARTS) {
    assert.match(art.svg, /^<svg [^>]*viewBox="0 0 220 \d+"/)
    assert.ok(art.svg.includes('{paper}') && art.svg.endsWith('</svg>'), art.id)
    // 캐릭터 그림 · 창 메모 삼색 점만 정해진 색을 쓴다
    const pattern = art.svg.replace(/<g class="character"[^>]*>.*?<\/g>/, '').replace(/<g class="dots"[^>]*>.*?<\/g>/, '')
    assert.equal(pattern !== art.svg, Boolean(art.character || art.dots), art.id)
    assert.doesNotMatch(pattern, /#[0-9a-f]{3,6}\b|<text|<image|<filter|<mask|Gradient/i, art.id)
    // 종이 바탕은 불투명하고 바깥 윤곽선이 없다(흰 인덱스 카드만 흰 속지에 묻혀 윤곽선을 남긴다 —
    // 잉크병 메모 둘도 2026-11-10 사용자 요청으로 겉 네모 윤곽선이 없다)
    const sheet = art.svg.match(/<(path|rect)[^>]*fill="\{paper\}"[^>]*>/)[0]
    assert.doesNotMatch(sheet, / opacity=/, art.id)
    assert.equal(/ stroke=/.test(sheet), art.id === 'index', art.id)
    const area = art.textArea
    assert.ok(area.x >= 0 && area.y >= 0 && area.x + area.w <= art.w && area.y + area.h <= art.h, art.id)
    assert.ok(!/NaN|undefined/.test(art.outline) && /^M/.test(art.outline), art.id)
  }
})

test('메모는 그림의 비율 · 글 칸으로 붙고, 줄 간격에 글 줄 높이를 맞추며 커지면 글도 같은 배율로 커진다', () => {
  for (const art of MEMO_ARTS) {
    const object = memo.createMemo({ memo: art.id }, { x: 300, y: 200 })
    assert.equal(object.type, 'shape')
    assert.equal(object.art, art.id)
    assert.equal(object.name, art.name)
    assert.equal(object.fill, art.paper)
    assert.equal(object.borderColor, art.line)
    assert.ok(Math.abs(object.w / object.h - art.w / art.h) < 1e-9)
    assert.ok(shapes.EDITOR_SHAPES.some((shape) => shape.id === object.shape && shape.category === 'memo'))
    if (art.rule) assert.ok(Math.abs(shapes.shapeTextStyle(object).lineHeight - art.rule.step) < 1e-9, art.id)
  }
  const lined = memo.createMemo({ memo: 'lined' }, { x: 0, y: 0 }), art = MEMO_ARTS.find((item) => item.id === 'lined')
  const box = shapes.shapeTextBox(lined)
  assert.equal(box.top, art.rule.top - art.rule.step)
  assert.equal(box.left, art.textArea.x)
  const big = { ...lined, w: lined.w * 2, h: lined.h * 2 }
  assert.equal(shapes.shapeTextBox(big).left, art.textArea.x * 2)
  assert.ok(Math.abs(shapes.shapeTextStyle(big).lineHeight - art.rule.step * 2) < 1e-9)
})

test('메모는 내보내기 검사를 통과하고, 없앤 기본 스티커는 내보내기에서 빠진다', () => {
  const page = { id: 'p', objects: [
    memo.createMemo({ memo: 'grid' }, { x: 300, y: 200 }),
    { id: 'old', type: 'sticker', asset: 'smile', x: 0, y: 0, w: 96, h: 96, rotation: 0 },
  ] }
  const snapshot = createExportSnapshot(page, { width: 1280, height: 800 })
  assert.deepEqual(snapshot.objects.map((object) => object.type), ['shape'])
  assert.equal(snapshot.objects[0].art, 'grid')
})

test('잉크병 메모는 선만 한 겹 더 맨 위에 올려, 그 위에 쓴 펜 색이 병 선을 덮지 않는다', () => {
  // 어느 메모가 덧그림을 쓰는지
  const over = MEMO_ARTS.filter((art) => art.overTop).map((art) => art.id)
  assert.deepEqual(over, ['inkSquare', 'inkRound'])
  const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
  // StaticPage: 덧그림은 요소마다 자리표(overTopMark)를 목록 사이에 끼우고, 맨 뒤에 남는 것(tailMarks)만
  // 획 층 **밖**에서 linesOnly 로 다시 그린다(새 요소가 아니라 획 묶음 캐시가 살아 있다). 차례는 stroke-layers 가 본다
  const page = read('../src/editor/components/canvas/StaticPage.js')
  assert.match(page, /if \(drawsOnPage\(object\) && memoArtOf\(object\.art\)\?\.overTop\) pending\.push\(overTopMark\(object\)\)/)
  assert.match(page, /<PageObject key=\{`over-\$\{object\.id\}`\} object=\{object\} zoom=\{zoom\} linesOnly/)
  // 덧그림은 글자 재기 통로 **밖**에 둔다 — 안에 두면 통로의 외동 자식이 배열이 돼 획 층을 읽던 검사가 깨진다
  const strokes = page.indexOf('ordered.filter(object => !object.hidden).map(renderObject)')
  const overlay = page.indexOf('{tailMarks.map(mark => renderOverTop(mark.overTopOf))}')
  assert.ok(strokes > 0 && overlay > page.indexOf('</TextMeasure.Provider>') && overlay > strokes, '덧그림은 획 층 뒤에 와야 한다')
  // 덧그림은 종이 · 글 · 그림자 없이 선만 그리고 손가락을 안 받는다
  const shape = read('../src/editor/components/canvas/ShapeContent.js')
  assert.match(shape, /\.replaceAll\('\{paper\}', linesOnly \? 'none' :/)
  assert.match(shape, /\{!hideText && !linesOnly && Boolean\(object\.text\)/)
  assert.match(shape, /const castShadow = !linesOnly &&/)
  assert.match(read('../src/editor/components/canvas/PageObject.js'), /pointerEvents=\{linesOnly \? 'none' : undefined\}/)
})
