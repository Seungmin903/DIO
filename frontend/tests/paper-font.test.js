// 속지 글꼴. 원본(마루부리)은 글자 윤곽(path) 그대로 두고, 다른 글꼴을 고르면 **진짜 글꼴로 쓴 <text>** 가 된다.
// 자리가 깨지지 않는 근거는 textLength: 원본 묶음이 차지한 폭을 그대로 넘기므로 글꼴마다 글자 폭이
// 달라도 차지하는 자리가 같다(S15P31F106-848).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { colorTemplateXml, normalizePaperAppearance } from '../src/editor/templates/appearance.js'
import { PAPER_FONTS, DEFAULT_PAPER_FONT, isPaperFontId, paperPrintsText, swapPaperFont, readGroup, paperFontIdsToLoad } from '../src/editor/templates/paperFont.js'
import { paperFontFamily, textFromGroup } from '../src/editor/templates/paperTextFont.js'
import { TEXT_FONTS } from '../src/editor/utils/text.js'
import MARU from '../src/editor/templates/paperFonts/maruburi.js'
import { datedSvg } from '../src/editor/templates/dated.js'
import { plannerBaseSvg } from '../src/editor/templates/studyPlanner.js'
import { dayPlannerBaseSvg } from '../src/editor/templates/dayPlanner.js'
import { paperDeviceFontIds } from '../src/editor/templates/planners.js'

const ALT = PAPER_FONTS.map(font => font.id).filter(id => id !== DEFAULT_PAPER_FONT)
const read = file => readFileSync(new URL(`../assets/templates/${file}`, import.meta.url), 'utf8')
const SAMPLES = {
  monthly: read('undated/undated-monthly-portrait.svg'), weekly: read('undated/undated-weekly-blocks-landscape.svg'), cover: read('undated/undated-cover-portrait.svg'),
  daily: read('2026/SVG/2026-reusable-daily-portrait.svg'), diary: read('2026/SVG/2026-reusable-diary-landscape.svg'), scrap: read('2026/SVG/2026-reusable-scrap-portrait.svg'),
  inkRecord: read('2026/SVG/2026-reusable-ink-record-round-portrait.svg'),
}

/** 원본 글자 묶음(<g aria-label> + path) */
const GROUP = /<g\b([^>]*)>((?:\s*<path\b[^>]*\/>)+)\s*<\/g>/g
const outlineGroups = xml => [...xml.matchAll(GROUP)].map(readGroup).filter(Boolean)
/** 바뀐 뒤의 <text> 들. 글자와 폭은 안쪽 <tspan> 에 있다(react-native-svg 가 거기서만 읽는다). */
const texts = xml => [...xml.matchAll(/<text\b([^>]*)>\s*<tspan\b([^>]*)>([^<]*)<\/tspan>\s*<\/text>/g)].map(match => ({
  attrs: match[1], span: match[2], body: match[3],
  label: match[1].match(/aria-label="([^"]*)"/)?.[1].replace(/&amp;/g, '&') ?? null,
  x: Number(match[1].match(/\sx="([-\d.]+)"/)[1]), y: Number(match[1].match(/\sy="([-\d.]+)"/)[1]),
  size: Number(match[1].match(/font-size="([\d.]+)"/)[1]),
  length: Number(match[2].match(/textLength="([\d.]+)"/)[1]),
  family: match[1].match(/font-family="([^",]+)/)[1],
}))

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

test('글꼴 이름은 앱 글꼴 목록에서 온다 — 글꼴을 더하면 속지도 저절로 따라온다', () => {
  // 속지용으로 이름을 따로 적어 두면 글꼴을 더할 때 한 곳을 빠뜨린다. 한 곳만 본다.
  for (const font of PAPER_FONTS) {
    const app = TEXT_FONTS.find(one => one.id === font.id)
    assert.ok(app, `앱 글꼴 목록에 없다: ${font.id}`)
    assert.equal(paperFontFamily(font.id).family, app.family)
    assert.equal(paperFontFamily(font.id, 'B').family, app.boldFamily ?? app.family)
    assert.equal(paperFontFamily(font.id, 'B').bold, Boolean(app.boldFamily))
  }
  assert.equal(paperFontFamily('없는-글꼴'), null)
})

test('원본 글꼴이거나 모르는 글꼴이면 SVG 를 그대로 돌려준다', () => {
  for (const font of [undefined, null, 'maruburi', 'nope']) assert.equal(swapPaperFont(SAMPLES.daily, font), SAMPLES.daily)
  assert.equal(swapPaperFont('<svg></svg>', 'gowun-batang'), '<svg></svg>')
})

test('인쇄 글자가 있는 모든 속지가 글꼴마다 글자 · 자리 · 크기 · 색을 지키며 <text> 로 바뀐다', () => {
  for (const [name, xml] of Object.entries(SAMPLES)) {
    const before = outlineGroups(xml)
    assert.ok(before.length > 0, name)
    for (const font of ALT) {
      const out = swapPaperFont(xml, font)
      const after = texts(out)
      assert.equal(after.length, before.length, `${name} ${font} 묶음 수`)
      assert.equal((out.match(/<g[^>]*aria-label/g) ?? []).length, 0, `${name} ${font} 안 바뀐 묶음이 남았다`)
      before.forEach((group, i) => {
        const next = after[i]
        assert.equal(next.label, group.text.join(''), `${name} ${font} 글자`)
        assert.equal(next.body, group.text.join('').trim(), `${name} ${font} 쓰는 글자(앞뒤 공백은 뺀다)`)
        assert.ok(Math.abs(next.x - group.x) < 0.002, `${name} ${font} 시작 자리`)
        assert.ok(Math.abs(next.y - group.y) < 0.002, `${name} ${font} 기준선`)
        assert.ok(Math.abs(next.size - group.s * 1000) < 0.002, `${name} ${font} 글자 크기`)
        const fill = group.attrs.match(/fill="[^"]*"/)
        if (fill) assert.ok(next.attrs.includes(fill[0]), `${name} ${font} 색 유지`)
      })
    }
  }
})

test('차지하는 폭(textLength)이 원본과 같다 — 글꼴이 달라도 줄바꿈 · 넘침이 없다', () => {
  for (const [name, xml] of Object.entries(SAMPLES)) {
    const before = outlineGroups(xml)
    for (const font of ALT) {
      texts(swapPaperFont(xml, font)).forEach((next, i) => {
        assert.ok(Math.abs(next.length - (before[i].end - before[i].x)) < 0.002, `${name} ${font} "${next.label}" 폭`)
      })
      // 폭을 글자까지 늘려 맞춘다 — 글자 사이만 늘리면 폭이 많이 다를 때 글자가 겹친다
      assert.match(swapPaperFont(xml, font), /lengthAdjust="spacingAndGlyphs"/)
    }
  }
})

test('뒤에 붙은 공백은 폭에 넣지 않는다 — textLength 는 보이는 글자의 폭이다', () => {
  const [d] = SAMPLES.daily.match(/<path d="([^"]*)"/)[1] ? [SAMPLES.daily.match(/<path d="([^"]*)"/)[1]] : []
  const group = outlineGroups(SAMPLES.daily)[0]
  const s = group.s, x = 40
  const path = (ch, at) => `<path d="${MARU[ch] ? 'M0 0L1 1' : ''}" transform="translate(${at} 100) scale(${s} ${-s})"/>`
  void d; void path
  // 실제 묶음으로 본다: 뒤 공백이 있는 묶음과 없는 묶음의 폭이 글자 폭만으로 결정된다
  for (const one of outlineGroups(SAMPLES.monthly)) {
    const label = one.text.join('')
    if (!/ $/.test(label)) continue
    const out = textFromGroup(one, 'gowun-dodum')
    assert.equal(out.match(/>([^<]*)<\/tspan>/)[1], label.trim(), '뒤 공백은 쓰지 않는다')
    assert.ok(Number(out.match(/textLength="([\d.]+)"/)[1]) <= one.end - one.x + 0.001)
  }
  void x
})

test('Bold 가 없는 글꼴은 덧선으로 굵게 만들고, 있는 글꼴은 Bold 글꼴 이름을 쓴다', () => {
  const find = (xml, label) => texts(xml).find(one => one.label === label)
  assert.ok(outlineGroups(SAMPLES.daily).some(group => group.text.join('') === 'TO DO LIST'))
  // 고운돋움: Bold 글꼴이 없다 → 덧선
  const synthetic = swapPaperFont(SAMPLES.daily, 'gowun-dodum')
  assert.match(find(synthetic, 'TO DO LIST').attrs, /stroke="#292929"/)
  assert.match(find(synthetic, 'TO DO LIST').attrs, /stroke-linejoin="round"/)
  assert.equal(find(synthetic, 'TO DO LIST').family, 'GowunDodum')
  // 고운바탕: Bold 글꼴이 있다 → 덧선 없이 Bold 이름
  const real = swapPaperFont(SAMPLES.daily, 'gowun-batang')
  assert.doesNotMatch(find(real, 'TO DO LIST').attrs, /stroke=/)
  assert.equal(find(real, 'TO DO LIST').family, 'GowunBatangBold')
  assert.equal(find(real, '날짜').family, 'GowunBatang')
  // Regular 묶음에는 덧선이 없다
  assert.doesNotMatch(find(synthetic, '날짜').attrs, /stroke=/)
  // 굵기는 글꼴 이름으로만 정한다 — font-weight 에 맡기면 기기가 굵게 흉내 내어 진짜 Bold 와 겹친다
  for (const font of ALT) assert.doesNotMatch(swapPaperFont(SAMPLES.daily, font), /font-weight="(bold|[5-9]\d\d)"/)
})

test('날짜 속지 · 스터디 플래너 · 데일리 플래너의 만든 글자도 빠짐없이 바뀐다', () => {
  const samples = { dated: datedSvg('dated-monthly-2027-03-portrait', SAMPLES.monthly), study: plannerBaseSvg('portrait'), day: dayPlannerBaseSvg('landscape') }
  for (const [name, xml] of Object.entries(samples)) {
    const before = outlineGroups(xml)
    assert.ok(before.length > 5, name)
    for (const font of ALT) {
      const out = swapPaperFont(xml, font)
      assert.equal(texts(out).length - (xml.match(/<text\b/g) ?? []).length, before.length, `${name} ${font}`)
      assert.equal((out.match(/<g[^>]*aria-label/g) ?? []).length, 0, `${name} ${font} 안 바뀐 묶음`)
    }
  }
})

test('속지 전부가 어느 글꼴에서도 묶음을 하나도 남기지 않는다 — 예전 표 방식이 글자를 빠뜨리던 자리다', () => {
  const dir = new URL('../assets/templates/2026/SVG/', import.meta.url)
  let groups = 0
  for (const name of readdirSync(dir)) {
    const xml = readFileSync(new URL(name, dir), 'utf8')
    const before = (xml.match(/<g[^>]*aria-label/g) ?? []).length
    if (!before) continue
    groups += before
    for (const font of ALT) {
      assert.equal((swapPaperFont(xml, font).match(/<g[^>]*aria-label/g) ?? []).length, 0, `${name} ${font}`)
    }
  }
  assert.ok(groups > 1000, `묶음을 못 읽었다(${groups}) — 검사가 헛돌고 있다`)
})

test('고른 글꼴은 기기에 불러와야 한다 — 원본이면 윤곽이라 필요 없다', () => {
  assert.deepEqual(paperFontIdsToLoad('nanum-pen'), ['nanum-pen'])
  assert.deepEqual(paperFontIdsToLoad('maruburi'), [])
  assert.deepEqual(paperFontIdsToLoad(null), [])
  assert.deepEqual(paperDeviceFontIds('2026-reusable-daily-portrait'), [])
  assert.deepEqual(paperDeviceFontIds('2026-reusable-daily-portrait', 'poor-story'), ['poor-story'])
  // 데일리 플래너는 비추는 글(마루부리)이 늘 필요하고, 속지 글꼴을 고르면 둘 다 필요하다
  assert.deepEqual(paperDeviceFontIds('day-planner-portrait'), ['maruburi'])
  assert.deepEqual(paperDeviceFontIds('day-planner-portrait', 'maruburi'), ['maruburi'])
  assert.deepEqual(paperDeviceFontIds('day-planner-portrait', 'nanum-pen'), ['maruburi', 'nanum-pen'])
})

test('내보내기용 colorTemplateXml 은 글꼴을 먼저 바꾸고 배색을 입힌다', () => {
  const colors = { backgroundColor: '#FFF8E7', layoutColor: '#33476B' }
  const out = colorTemplateXml(SAMPLES.weekly, { ...colors, font: 'poor-story' }), plain = colorTemplateXml(SAMPLES.weekly, colors)
  assert.notEqual(out, plain)
  assert.deepEqual(texts(out).map(one => one.label), outlineGroups(SAMPLES.weekly).map(group => group.text.join('')))
  assert.equal((plain.match(/<text\b/g) ?? []).length, 0, '원본 글꼴이면 윤곽 그대로다')
  assert.match(out, /fill="#FFF8E7"/)
  assert.match(out, /font-family="PoorStory/)
  // 글자 색도 배색을 따른다(바탕색 · 글자색 설정이 <text> 에도 먹는다)
  const fills = xml => texts(xml).map(one => one.attrs.match(/fill="([^"]*)"/)[1])
  assert.notDeepEqual(fills(out), fills(swapPaperFont(SAMPLES.weekly, 'poor-story')))
})

test('글자가 인쇄되는 속지에만 글꼴을 고른다', () => {
  assert.equal(paperPrintsText(null), false)
  assert.equal(paperPrintsText('2026-reusable-note-grid-portrait'), false)
  assert.equal(paperPrintsText('2026-reusable-daily-portrait'), true)
  assert.equal(paperPrintsText('2026-reusable-ink-record-round-portrait'), true)
  assert.equal(paperPrintsText('dated-monthly-2027-03-portrait'), true)
  assert.equal(paperPrintsText('study-planner-landscape'), true)
  assert.equal(paperPrintsText('day-planner-portrait'), true)
  assert.equal(paperPrintsText('없는-속지'), false)
})

test('폭을 맞추는 속성은 <text> 가 아니라 <tspan> 에 있다 — react-native-svg 가 거기서만 읽는다', () => {
  // 글자를 그리는 것은 TSpan 이고 textLength 를 **자기 것에서만** 읽는다
  // (android TSpanView.drawWrappedText). <text> 에 두면 조용히 무시되어 자리가 깨진다.
  const out = swapPaperFont(SAMPLES.daily, 'nanum-pen')
  assert.ok(out.includes('<tspan textLength='), '<tspan> 에 폭이 있어야 한다')
  for (const open of out.match(/<text\b[^>]*>/g)) {
    assert.doesNotMatch(open, /textLength=/, '<text> 에 두면 무시된다')
    assert.doesNotMatch(open, /lengthAdjust=/, '<text> 에 두면 무시된다')
  }
  // <text> 하나에 <tspan> 하나 — 여러 개로 쪼개면 폭이 묶음마다 다시 계산된다
  assert.equal((out.match(/<tspan\b/g) ?? []).length, (out.match(/<text\b/g) ?? []).length)
})
