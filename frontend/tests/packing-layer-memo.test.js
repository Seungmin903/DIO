import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('캐리어 색 · 앞 그림 층은 요소 목록이 아니라 속지 · 크기 · 배율 · 칠한 색만 받아 스티커를 넣을 때 다시 그리지 않는다(소스 확인)', () => {
  const source = readFileSync(new URL('../src/editor/components/canvas/PackingColorLayer.js', import.meta.url), 'utf8')
  assert.match(source, /const PackingColorSvg = memo\(function PackingColorSvg\(\{ assetId, width, height, zoom, colors: colorKey \}\)/)
  assert.match(source, /const PackingFrontSvg = memo\(function PackingFrontSvg\(\{ assetId, width, height, zoom \}\)/)
  // 칠한 색은 문자열로 넘겨 요소가 늘어도 같은 값이면 memo 가 막는다
  assert.match(source, /const colors = JSON\.stringify\(/)
  const colorSvg = source.slice(source.indexOf('const PackingColorSvg'), source.indexOf('export function PackingFrontLayer'))
  const frontSvg = source.slice(source.indexOf('const PackingFrontSvg'))
  for (const body of [colorSvg, frontSvg]) assert.doesNotMatch(body, /\bpage\./, '안쪽 그림은 page 를 받지 않는다')
})
