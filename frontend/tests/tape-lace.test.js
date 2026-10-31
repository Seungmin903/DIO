import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LACE_HEIGHT, LACE_TILES } from '../src/editor/components/canvas/laceTapes.js'

const constants = readFileSync(new URL('../src/editor/constants.js', import.meta.url), 'utf8')
const tapeView = readFileSync(new URL('../src/editor/components/canvas/TapeView.js', import.meta.url), 'utf8')
const ids = Object.keys(LACE_TILES)
const subpaths = d => d.split('M').slice(1).map(part => `M${part.trim()}`)

test('레이스 테이프가 무늬 목록에 모두 있다', () => {
  assert.ok(ids.length >= 1)
  ids.forEach(id => assert.match(constants, new RegExp(`'${id}': '[^']+'`), `${id} 이름 누락`))
})

test('레이스 도안은 구멍이 뚫린 닫힌 경로이고 타일 크기가 맞다', () => {
  assert.equal(LACE_HEIGHT, 34)
  ids.forEach(id => {
    const { width, body } = LACE_TILES[id]
    assert.ok(width >= 4 && width <= 56, `${id} 타일 폭`)
    const parts = subpaths(body)
    // 바깥 모양 + 구멍 수십 개. 구멍이 하위 경로로 있어야 evenodd 로 진짜 비어 있다
    assert.ok(parts.length >= 10, `${id} 구멍 수`)
    parts.forEach(part => assert.match(part, /Z$/, `${id} 닫히지 않은 경로`))
    assert.doesNotMatch(body, /[^MLCZ0-9.\s-]/, `${id} 허용되지 않은 명령`)
  })
})

test('레이스는 evenodd 로 칠하고 바탕 사각형을 깔지 않는다', () => {
  const lace = tapeView.slice(tapeView.indexOf('const lace = LACE_TILES'), tapeView.indexOf('switch (pattern)'))
  assert.match(lace, /fillRule="evenodd"/)
  assert.doesNotMatch(lace, /<Rect/)
})
