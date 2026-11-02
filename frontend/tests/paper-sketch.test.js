import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PAPERS } from '../src/diary/utils/paperChoice.js'
import { PAPER_SKETCHES } from '../src/diary/utils/paperSketches.js'
import { sketchXml } from '../src/diary/utils/paperSketchXml.js'

const rects = xml => [...xml.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/g)]
  .map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], fill: m[5] }))
const page = key => (key.endsWith('landscape') ? [1024, 768] : [768, 1024])

test('속지 고르기의 플래너 · 일기 속지는 모두 방향마다 대표 그림이 있다', () => {
  for (const paper of PAPERS.filter(item => item.group !== 'note')) {
    for (const o of ['landscape', 'portrait']) assert.ok(PAPER_SKETCHES[`${paper.id}-${o}`], `${paper.id}-${o}`)
  }
})

test('대표 그림은 기기 픽셀 정수 자리에 1px 선 · 막대만 그리고 칸 밖으로 나가지 않는다', () => {
  for (const key of Object.keys(PAPER_SKETCHES)) {
    const [pw, ph] = page(key)
    for (const css of [30, 40, 54, 72]) {
      const width = Math.round(css * 2), height = Math.round(css * ph / pw * 2)
      const xml = sketchXml(key, pw, ph, width, height)
      for (const r of rects(xml)) {
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= width + 1 && r.y + r.h <= height + 1, `${key} ${css} 칸 밖 ${JSON.stringify(r)}`)
        assert.ok(['#bfc1c4', '#aeb3b8', '#d7d9dc', '#666666'].includes(r.fill), `${key} 팔레트 밖 색 ${r.fill}`)
      }
    }
  }
})

test('달력 칸 수는 작은 칸에서도 그대로고, 칸 안 옅은 모눈 결은 촘촘하면 뺀다', () => {
  for (const css of [30, 40, 54]) {
    const width = css * 2, height = Math.round(css * 1024 / 768 * 2)
    const columns = rects(sketchXml('monthly-portrait', 768, 1024, width, height)).filter(r => r.w === 1 && r.h > height / 3)
    assert.equal(columns.length, 8, `${css}px: 세로선 = 테두리 2 + 칸 나눔 6`)
  }
  const width = 72 * 2, height = 54 * 2
  const weekly = rects(sketchXml('weekly-blocks-landscape', 1024, 768, width, height))
  assert.ok(weekly.length < 60, `주간 블록 결 무늬가 빠져야 한다 (${weekly.length}개)`)
})

test('속지 고르기 화면만 대표 그림을 쓰고 페이지 목록은 그대로다', () => {
  const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
  assert.match(read('../src/diary/components/PaperOptions.js'), /width=\{thumb\} appearance=\{appearance\} sketch \/>/)
  assert.match(read('../src/editor/components/PageAddPicker.js'), /width=\{36\} appearance=\{appearance\} sketch \/>/)
  assert.doesNotMatch(read('../src/diary/components/Cover.js'), /sketch/)
})
