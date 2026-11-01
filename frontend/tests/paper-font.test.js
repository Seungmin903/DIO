import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { colorTemplateXml, normalizePaperAppearance } from '../src/editor/templates/appearance.js'
import { PAPER_FONTS, DEFAULT_PAPER_FONT, isPaperFontId, paperPrintsText, swapPaperFont } from '../src/editor/templates/paperFont.js'
import MARU from '../src/editor/templates/paperFonts/maruburi.js'
import nanumGothic from '../src/editor/templates/paperFonts/nanum-gothic.js'
import nanumMyeongjo from '../src/editor/templates/paperFonts/nanum-myeongjo.js'
import gowunBatang from '../src/editor/templates/paperFonts/gowun-batang.js'
import gowunDodum from '../src/editor/templates/paperFonts/gowun-dodum.js'
import nanumPen from '../src/editor/templates/paperFonts/nanum-pen.js'
import poorStory from '../src/editor/templates/paperFonts/poor-story.js'
import { datedSvg } from '../src/editor/templates/dated.js'
import { plannerBaseSvg } from '../src/editor/templates/studyPlanner.js'
import { dayPlannerBaseSvg } from '../src/editor/templates/dayPlanner.js'

const TABLES = { 'nanum-gothic': nanumGothic, 'nanum-myeongjo': nanumMyeongjo, 'gowun-batang': gowunBatang, 'gowun-dodum': gowunDodum, 'nanum-pen': nanumPen, 'poor-story': poorStory }
const ALT = Object.keys(TABLES)
const read = file => readFileSync(new URL(`../assets/templates/${file}`, import.meta.url), 'utf8')
const SAMPLES = {
  monthly: read('undated/undated-monthly-portrait.svg'), weekly: read('undated/undated-weekly-blocks-landscape.svg'), cover: read('undated/undated-cover-portrait.svg'),
  daily: read('2026/SVG/2026-reusable-daily-portrait.svg'), diary: read('2026/SVG/2026-reusable-diary-landscape.svg'), scrap: read('2026/SVG/2026-reusable-scrap-portrait.svg'),
}

// 글자 묶음 읽기: 이름표, 속성, 글자마다 윤곽(d) · 자리(x, y) · 배율(s)
function groups(xml) {
  return [...xml.matchAll(/<g\b([^>]*aria-label="([^"]*)"[^>]*)>((?:\s*<path\b[^>]*\/>)+)\s*<\/g>/g)].map(match => ({
    label: match[2].replace(/&amp;/g, '&'), attrs: match[1],
    paths: [...match[3].matchAll(/<path d="([^"]*)" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.e]+)/g)].map(m => ({ d: m[1], x: Number(m[2]), y: Number(m[3]), s: Number(m[4]) })),
  }))
}
const chars = label => [...label].filter(ch => ch !== ' ')
// 묶음이 차지한 끝 자리(마지막 글자 시작 + 그 글자 폭). widthOf: 글자 → 폭(1000 단위). 묶음의 scale 이 이미 글꼴 배율을 포함한다.
const endOf = (group, widthOf, scale = 1) => group.paths[group.paths.length - 1].x + widthOf(chars(group.label).pop()) * group.paths[0].s * scale
const maruWidth = weight => ch => MARU[ch][weight === 'B' ? 3 : 0]

test('속지 글꼴 설정은 고른 때만 저장되고 기존 설정의 모양은 그대로다', () => {
  assert.deepEqual(normalizePaperAppearance(undefined), { backgroundColor: '#FFFFFF', layoutColor: '#292929' })
  assert.deepEqual(normalizePaperAppearance({ backgroundColor: '#fff8e7', layoutColor: '#33476B' }), { backgroundColor: '#FFF8E7', layoutColor: '#33476B' })
  assert.equal(normalizePaperAppearance({ font: 'gowun-dodum' }).font, 'gowun-dodum')
  // 원본(마루부리) · 모르는 글꼴 · 엉뚱한 값은 저장하지 않는다
  for (const font of ['maruburi', 'comic-sans', '', null, 3, {}]) assert.equal('font' in normalizePaperAppearance({ font }), false, String(font))
  assert.deepEqual(PAPER_FONTS.map(font => font.id), ['maruburi', ...ALT])
  assert.equal(DEFAULT_PAPER_FONT, 'maruburi')
  assert.equal(isPaperFontId('maruburi'), false)
  assert.equal(isPaperFontId('nanum-pen'), true)
})

test('원본 글꼴이거나 모르는 글꼴이면 SVG 를 그대로 돌려준다', () => {
  for (const font of [undefined, null, 'maruburi', 'nope']) assert.equal(swapPaperFont(SAMPLES.daily, font), SAMPLES.daily)
  assert.equal(swapPaperFont('<svg></svg>', 'gowun-batang'), '<svg></svg>')
})

test('인쇄 글자가 있는 모든 속지가 글꼴마다 묶음 수 · 글자 · 기준선 · 색을 지키며 바뀐다', () => {
  for (const [name, xml] of Object.entries(SAMPLES)) {
    const before = groups(xml)
    assert.ok(before.length > 0, name)
    for (const font of ALT) {
      const after = groups(swapPaperFont(xml, font))
      assert.equal(after.length, before.length, `${name} ${font} 묶음 수`)
      before.forEach((group, i) => {
        const next = after[i]
        assert.equal(next.label, group.label)
        assert.equal(next.paths.length, group.paths.length)
        assert.notEqual(next.paths[0].d, group.paths[0].d, `${name} ${font} "${group.label}" 글자 윤곽이 그대로`)
        for (const path of next.paths) assert.ok(Math.abs(path.y - group.paths[0].y) < 0.001, `${name} ${font} 기준선`)
        assert.ok(next.attrs.includes(group.attrs.match(/fill="[^"]*"/)[0]), '색 유지')
      })
    }
  }
})

test('글자의 기준점(시작 · 가운데 · 끝)을 지킨다', () => {
  const near = (a, b, message) => assert.ok(Math.abs(a - b) < 0.1, `${message}: ${a} ≠ ${b}`)
  const daily = groups(SAMPLES.daily), weekly = groups(read('undated/undated-weekly-blocks-portrait.svg'))
  const title = daily.find(group => group.label === '데일리 플래너'), hour = daily.find(group => group.label === '15'), mon = weekly.find(group => group.label === 'MON')
  const weight = group => (group.attrs.includes('#292929') ? 'B' : 'R') // 이 표본에서 진한 글씨(#292929)가 Bold
  for (const font of ALT) {
    const table = TABLES[font]
    const afterDaily = groups(swapPaperFont(SAMPLES.daily, font)), afterWeekly = groups(swapPaperFont(read('undated/undated-weekly-blocks-portrait.svg'), font))
    // 시작: 왼쪽 정렬 제목은 시작 자리가 그대로
    near(afterDaily.find(group => group.label === title.label).paths[0].x, title.paths[0].x, `${font} 시작`)
    // 가운데: 시간 숫자(Regular)는 가운데가 그대로
    const hourNow = afterDaily.find(group => group.label === '15')
    near((hourNow.paths[0].x + endOf(hourNow, ch => table.R[ch][0])) / 2, (hour.paths[0].x + endOf(hour, maruWidth('R'))) / 2, `${font} 가운데`)
    // 끝: 요일 이름(MON)은 오른쪽 끝이 그대로
    const monNow = afterWeekly.find(group => group.label === 'MON')
    near(endOf(monNow, ch => table.R[ch][0]), endOf(mon, maruWidth('R')), `${font} 끝`)
    void weight
  }
})

test('이어 붙은 묶음(큰 숫자 + 작은 단위)은 한 줄로 이어서 다시 놓는다', () => {
  const [one] = groups(SAMPLES.daily).filter(group => group.label === '15')
  const [d1, d5] = one.paths.map(path => path.d)
  const run = (x, s, fill) => `<g fill="${fill}" aria-label="15"><path d="${d1}" transform="translate(${x} 100) scale(${s} ${-s})"/><path d="${d5}" transform="translate(${x + MARU['1'][0] * s} 100) scale(${s} ${-s})"/></g>`
  const endFirst = 40 + (MARU['1'][0] + MARU['5'][0]) * 0.014
  const xml = `<svg>${run(40, 0.014, '#292929')}${run(endFirst, 0.0115, '#666666')}</svg>`
  for (const font of ALT) {
    const table = TABLES[font], out = groups(swapPaperFont(xml, font))
    assert.equal(out.length, 2)
    // 처음 시작 자리는 그대로, 둘째 묶음은 첫 묶음이 끝난 자리에서 이어진다
    assert.equal(out[0].paths[0].x, 40)
    const firstEnd = out[0].paths[0].x + (table.R['1'][0] + table.R['5'][0]) * 0.014 * table.size
    assert.ok(Math.abs(out[1].paths[0].x - firstEnd) < 0.01, `${font} 이어 붙임 ${out[1].paths[0].x} ≠ ${firstEnd}`)
  }
})

test('Bold 가 없는 글꼴은 덧선으로 굵게 만들고 Bold 가 있는 글꼴은 그대로 쓴다', () => {
  const xml = SAMPLES.daily
  assert.ok(groups(xml).some(group => group.label === 'TO DO LIST'))
  const synthetic = groups(swapPaperFont(xml, 'gowun-dodum'))
  assert.match(synthetic.find(group => group.label === 'TO DO LIST').attrs, /stroke="#292929"/)
  assert.match(synthetic.find(group => group.label === 'TO DO LIST').attrs, /stroke-linejoin="round"/)
  assert.doesNotMatch(groups(swapPaperFont(xml, 'gowun-batang')).find(group => group.label === 'TO DO LIST').attrs, /stroke=/)
  // Regular 묶음에는 덧선이 없다
  assert.doesNotMatch(synthetic.find(group => group.label === '날짜').attrs, /stroke=/)
})

test('날짜 속지 · 스터디 플래너 · 데일리 플래너의 만든 글자도 같은 방식으로 바뀐다', () => {
  const samples = { dated: datedSvg('dated-monthly-2027-03-portrait', SAMPLES.monthly), study: plannerBaseSvg('portrait'), day: dayPlannerBaseSvg('landscape') }
  for (const [name, xml] of Object.entries(samples)) {
    const before = groups(xml)
    assert.ok(before.length > 5, name)
    for (const font of ALT) {
      const after = groups(swapPaperFont(xml, font))
      assert.equal(after.length, before.length, `${name} ${font}`)
      const changed = after.filter((group, i) => group.paths[0].d !== before[i].paths[0].d).length
      assert.equal(changed, before.length, `${name} ${font} 안 바뀐 묶음 ${before.length - changed}`)
    }
  }
})

test('내보내기용 colorTemplateXml 은 글꼴을 먼저 바꾸고 배색을 입힌다', () => {
  const colors = { backgroundColor: '#FFF8E7', layoutColor: '#33476B' }
  const out = colorTemplateXml(SAMPLES.weekly, { ...colors, font: 'poor-story' }), plain = colorTemplateXml(SAMPLES.weekly, colors)
  assert.notEqual(out, plain)
  assert.deepEqual(groups(out).map(group => group.label), groups(plain).map(group => group.label))
  assert.ok(groups(out).every((group, i) => group.paths[0].d !== groups(plain)[i].paths[0].d))
  assert.match(out, /fill="#FFF8E7"/)
})

test('글자가 인쇄되는 속지에만 글꼴을 고른다', () => {
  assert.equal(paperPrintsText(null), false)
  assert.equal(paperPrintsText('2026-reusable-note-grid-portrait'), false)
  assert.equal(paperPrintsText('2026-reusable-daily-portrait'), true)
  assert.equal(paperPrintsText('dated-monthly-2027-03-portrait'), true)
  assert.equal(paperPrintsText('study-planner-landscape'), true)
  assert.equal(paperPrintsText('day-planner-portrait'), true)
  assert.equal(paperPrintsText('없는-속지'), false)
})
