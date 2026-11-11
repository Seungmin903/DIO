// 속지 글꼴. 원본(마루부리)은 글자 윤곽(path) 그대로 두고, 다른 글꼴을 고르면 **진짜 글꼴로 쓴 <text>** 가 된다.
// 자리가 깨지지 않는 근거: 고른 글꼴이 그 자리(오른쪽으로 쓸 수 있는 폭)보다 넓어질 때만 글자 크기를
// 줄인다. 좁은 것은 그대로 둔다(사용자 2026-11-11 "좁은 건 괜찮아"). textLength 는 react-native-svg 가
// 아직 적용하지 않아 쓰지 않는다 — 2026-11-11 실기 측정으로 확인했다(S15P31F106-848).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { colorTemplateXml, normalizePaperAppearance } from '../src/editor/templates/appearance.js'
import { PAPER_FONTS, DEFAULT_PAPER_FONT, isPaperFontId, paperPrintsText, swapPaperFont, readGroup, paperFontIdsToLoad } from '../src/editor/templates/paperFont.js'
import { paperFontFamily, textFromGroup, naturalWidth } from '../src/editor/templates/paperTextFont.js'
import { TEXT_FONTS } from '../src/editor/utils/text.js'
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
/** 바뀐 뒤의 <text> 들 */
const texts = xml => [...xml.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(match => ({
  attrs: match[1], body: match[2],
  label: match[1].match(/aria-label="([^"]*)"/)?.[1].replace(/&amp;/g, '&') ?? null,
  x: Number(match[1].match(/\sx="([-\d.]+)"/)[1]), y: Number(match[1].match(/\sy="([-\d.]+)"/)[1]),
  size: Number(match[1].match(/font-size="([\d.]+)"/)[1]),
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

test('자리에 들어가면 글자 크기를 건드리지 않는다 — 좁은 것은 그대로 둔다', () => {
  for (const [name, xml] of Object.entries(SAMPLES)) {
    const before = outlineGroups(xml)
    for (const font of ALT) {
      texts(swapPaperFont(xml, font)).forEach((next, i) => {
        assert.ok(next.size <= before[i].s * 1000 + 0.002, `${name} ${font} "${next.label}" 는 커지면 안 된다`)
      })
    }
  }
})

test('자리보다 넓어질 때만, 딱 들어갈 만큼 줄인다', () => {
  const base = outlineGroups(SAMPLES.daily).find(group => group.text.join('') === '데일리 플래너')
  const full = base.s * 1000
  const size = (group, font) => Number(textFromGroup(group, font).match(/font-size="([\d.]+)"/)[1])
  // 자리가 넉넉하면(지금 속지가 다 그렇다) 그대로
  assert.equal(size(base, 'nanum-gothic'), full)
  // 자리를 좁히면 줄어든다. 줄인 크기로 쓴 폭이 그 자리에 딱 맞는다
  for (const room of [40, 90, 150]) {
    const shrunk = size({ ...base, fit: room }, 'nanum-gothic')
    assert.ok(shrunk < full, `자리 ${room} 이면 줄어야 한다`)
    const used = naturalWidth('nanum-gothic', base.weight, '데일리 플래너') * shrunk / 1000
    assert.ok(Math.abs(used - room) < 0.05, `자리 ${room} 에 딱 맞아야 한다(쓴 폭 ${used})`)
  }
  // 폭을 모르는 글자가 섞이면 줄이지 않는다(그 글꼴 자연 폭 그대로)
  assert.equal(naturalWidth('nanum-gothic', 'R', '데일리 플래너✪'), null)
  assert.equal(size({ ...base, fit: 40, text: [...'데일리 플래너✪'] }, 'nanum-gothic'), full)
})

test('줄어드는 묶음은 드물고, 줄어들어도 조금만 줄어든다', () => {
  // 넘치는 것은 거의 없다. 마루부리 숫자 "1" 이 좁아서 나눔고딕 "11" 정도가 시간 칸을 살짝 넘는다.
  // 크게 줄어들면 옆 글자와 크기가 달라져 눈에 띄므로, 비율에 바닥을 둔다.
  const FLOOR = 0.85
  let shrunk = 0, total = 0, worst = 1, worstAt = ''
  for (const [name, xml] of Object.entries(SAMPLES)) for (const font of ALT) {
    for (const group of outlineGroups(xml)) {
      total++
      const ratio = Number(textFromGroup(group, font).match(/font-size="([\d.]+)"/)[1]) / (group.s * 1000)
      if (ratio >= 0.999) continue
      shrunk++
      if (ratio < worst) { worst = ratio; worstAt = `${name} ${font} "${group.text.join('')}"` }
    }
  }
  assert.ok(total > 500, `묶음을 못 읽었다(${total}) — 검사가 헛돌고 있다`)
  assert.ok(shrunk / total < 0.02, `${shrunk}/${total} 묶음이 줄어든다 — 속지가 빡빡해졌거나 더 넓은 글꼴이 들어왔다`)
  assert.ok(worst >= FLOOR, `${worstAt} 가 ${Math.round(worst * 100)}% 로 줄어든다 — 바닥 ${FLOOR * 100}% 아래다`)
})

test('앞뒤에 붙은 공백은 쓰지 않는다', () => {
  const base = outlineGroups(SAMPLES.daily)[0]
  for (const label of [' 가운데 ', '가운데 ', ' 가운데']) {
    const out = textFromGroup({ ...base, text: [...label] }, 'gowun-dodum')
    assert.equal(out.match(/>([^<]*)<\/text>/)[1], '가운데', label)
  }
  // 공백뿐인 묶음은 그릴 것이 없다
  assert.equal(textFromGroup({ ...base, text: [' ', ' '] }, 'gowun-dodum'), null)
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

test('폭을 맞추는 속성(textLength)은 쓰지 않는다 — react-native-svg 가 아직 적용하지 않는다', () => {
  // android TextLayoutAlgorithm.java 에 "TODO Apply 'textLength' attribute" 가 그대로 있고,
  // 2026-11-11 실기 측정에서 다섯 라벨 모두 자연 폭으로 그려졌다. 나중에 지원되면 조용히 모양이
  // 바뀌므로 아예 쓰지 않고, 넘치는 묶음만 글자 크기로 맞춘다.
  const out = swapPaperFont(SAMPLES.daily, 'nanum-pen')
  assert.doesNotMatch(out, /textLength=/)
  assert.doesNotMatch(out, /lengthAdjust=/)
  assert.doesNotMatch(out, /<tspan\b/)
  // 치수는 윤곽 묶음의 것이라 <text> 로 딸려 가지 않는다
  assert.doesNotMatch(out, /<text[^>]*data-(adv|fit|w)=/)
})

test('내보내기도 고른 속지 글꼴을 기다린다 — 스냅샷이 그 값을 들고 간다', async () => {
  // 코드리뷰 2026-11-11: ensureExportFonts 가 snapshot.paperAppearance?.font 를 읽는데,
  // 그 값이 스냅샷에 실제로 담기는지 확인이 없었다. 없으면 대체 글꼴로 내보내진다.
  const { createExportSnapshot } = await import('../src/editor/utils/pageExport.js')
  const page = {
    id: 'p1', backgroundAssetId: '2026-reusable-daily-portrait', templateVersion: '1.0.0',
    objects: [], paperAppearance: { font: 'poor-story' },
  }
  const snapshot = createExportSnapshot(page)
  assert.equal(snapshot.paperAppearance.font, 'poor-story', '스냅샷에 고른 글꼴이 담겨야 한다')
  assert.deepEqual(paperDeviceFontIds(snapshot.template.backgroundAssetId, snapshot.paperAppearance.font), ['poor-story'])
  // 원본 글꼴이면 윤곽이라 기다릴 것이 없다
  const plain = createExportSnapshot({ ...page, paperAppearance: {} })
  assert.equal('font' in plain.paperAppearance, false)
  assert.deepEqual(paperDeviceFontIds(plain.template.backgroundAssetId, plain.paperAppearance.font), [])
})
