import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { checkTemplateSvg } from '../scripts/template-svg-rules.mjs'

const svg = (body, { w = 1024, h = 768 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>t</title><rect width="${w}" height="${h}" fill="#ffffff" />${body}</svg>`

test('앱 속지(2026 · 만년형) 전부가 DIO 속지 형식 검사를 통과한다', () => {
  let count = 0
  for (const dir of ['../assets/templates/2026/SVG/', '../assets/templates/undated/']) {
    const url = new URL(dir, import.meta.url)
    for (const name of readdirSync(url)) {
      const orientation = name.includes('portrait') ? 'portrait' : 'landscape'
      assert.deepEqual(checkTemplateSvg(readFileSync(new URL(name, url), 'utf8'), orientation), [], name)
      count++
    }
  }
  assert.equal(count, 286)
})

test('형식에 맞는 원격 속지는 통과하고, 색 · 요소 · 크기 · 종이가 어긋나면 이유를 알려 준다', () => {
  const good = svg('<g fill="none" stroke="#d7d9dc"><line x1="0" y1="10" x2="1024" y2="10" /></g><path d="M0 0h10" fill="#292929" />')
  assert.deepEqual(checkTemplateSvg(good, 'landscape'), [])
  const cases = [
    [svg('<path d="M0 0h10" fill="#ff0000" />'), /fill="#ff0000"/],
    [svg('<path d="M0 0h10" fill="#ffffff" />'), /#ffffff 는 종이 사각형에만/],
    [svg('<path d="M0 0h10" />'), /fill 이 없는 <path>/],
    [svg('<text x="1" y="1" fill="#292929">가</text>'), /<text> 는 쓸 수 없어요/],
    [svg('<image href="a.png" />'), /<image>/],
    [svg('<path d="M0 0h10" fill="#292929" style="fill:red" />'), /style 속성/],
    [svg('<g fill="#123456"><path d="M0 0" /></g>'), /fill="#123456"/],
    [svg('', { w: 768, h: 1024 }), /가로 속지는 width="1024"/],
    ['<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768"><path d="M0 0" fill="#292929" /></svg>', /처음 그리는 요소는 종이 사각형/],
  ]
  for (const [xml, pattern] of cases) assert.match(checkTemplateSvg(xml, 'landscape').join('\n'), pattern, xml)
})
