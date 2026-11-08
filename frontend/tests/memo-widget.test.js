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

test('기본 메모지 12종은 윤곽선 없는 단색 종이 + 무늬 하나 그림이고, 캐릭터 · 창 점 말고는 색 자리 두 개 밖의 색 · 글자가 없다', () => {
  assert.deepEqual(MEMO_ARTS.map((art) => art.name), ['무지 메모', '줄 메모', '모눈 메모', '도트 메모', '체크 메모', '인덱스 카드', '영수증', '뜯은 노트', 'MEMO 메모', '모아 메모', '디오 메모', '창 메모'])
  for (const art of MEMO_ARTS) {
    assert.match(art.svg, /^<svg [^>]*viewBox="0 0 220 \d+"/)
    assert.ok(art.svg.includes('{paper}') && art.svg.endsWith('</svg>'), art.id)
    // 캐릭터 그림 · 창 메모 삼색 점만 정해진 색을 쓴다
    const pattern = art.svg.replace(/<g class="character"[^>]*>.*?<\/g>/, '').replace(/<g class="dots"[^>]*>.*?<\/g>/, '')
    assert.equal(pattern !== art.svg, Boolean(art.character || art.dots), art.id)
    assert.doesNotMatch(pattern, /#[0-9a-f]{3,6}\b|<text|<image|<filter|<mask|Gradient/i, art.id)
    // 종이 바탕은 불투명하고 바깥 윤곽선이 없다(흰 인덱스 카드만 흰 속지에 묻혀 윤곽선을 남긴다)
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
