// 날짜가 적힌 플래너 속지(표지 연도 · 월 구분지 · 먼슬리 · 위클리)를 파일 없이 만든다.
// 연도마다 SVG 를 쌓아 두지 않고, 같은 양식의 만년형 속지(assets/templates/undated) 위에 날짜 글자를 얹는다.
// 글자 윤곽과 자리는 2026 원본에서 뽑은 표(datedGlyphs.js, scripts/generate-dated-glyphs.py)를 쓴다.
// 페이지에는 날짜가 든 ID(dated-monthly-2027-03-portrait 등)만 저장하고, 그릴 때 ID 로 다시 만든다.
// 예전 다이어리가 가리키는 2026 SVG 파일은 그대로 둔다.
import { catalog } from './data.js'
import { DATED_GLYPHS, DATED_KERNING, DATED_LAYOUTS } from './datedGlyphs.js'
import { undatedTemplateId } from './undated.js'

export const DATED_YEAR_RANGE = { min: 1900, max: 2199 }
const KINDS = ['cover', 'divider', 'monthly', 'weekly-blocks', 'weekly-journal']
const pad = value => String(value).padStart(2, '0')
// 위클리 끝의 -g{앞}{뒤}: 기간 밖이라 흐리게 그리는 앞쪽 · 뒤쪽 날 수 (기간 첫 주 · 마지막 주만)
const PATTERN = /^dated-(cover|divider|monthly|weekly-blocks|weekly-journal)-(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?:-(\d{4}))?(?:-g([0-6])([0-6]))?-(portrait|landscape)$/
const FAINT = '#bfc1c4'
const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// ---------- 날짜 계산 (UTC 로만 셈해 시간대와 무관하게) ----------
const day = (year, month, date) => new Date(Date.UTC(year, month - 1, date))
const addDays = (value, days) => new Date(value.getTime() + days * 86400000)
const parts = value => ({ year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, date: value.getUTCDate() })
const daysIn = (year, month) => day(year, month + 1, 0).getUTCDate()
// 그 주의 월요일
const mondayOf = value => addDays(value, -((value.getUTCDay() + 6) % 7))
// 그 달 몇째 주인지: 1일이 든 주(월요일 시작)가 1주차
const weekOfMonth = value => {
  const { year, month, date } = parts(value)
  const offset = (day(year, month, 1).getUTCDay() + 6) % 7
  return Math.floor((date - 1 + offset) / 7) + 1
}

// ---------- ID ----------
export const datedCoverId = (year, endYear, orientation) => `dated-cover-${year}${endYear !== year ? `-${endYear}` : ''}-${orientation}`
export const datedMonthId = (kind, year, month, orientation) => `dated-${kind}-${year}-${pad(month)}-${orientation}`
export const datedWeekId = (style, monday, orientation, before = 0, after = 0) => {
  const { year, month, date } = parts(monday)
  return `dated-weekly-${style}-${year}-${pad(month)}-${pad(date)}${before || after ? `-g${before}${after}` : ''}-${orientation}`
}
export const isDatedId = id => typeof id === 'string' && PATTERN.test(id)

/** 날짜 속지 ID → 카탈로그 항목 (catalog.getTemplate 이 쓴다). 맞지 않으면 null */
export function datedTemplate(id) {
  const match = typeof id === 'string' && id.match(PATTERN)
  if (!match) return null
  const [, kind, y, a, b, endYear, before, after, orientation] = match
  const year = Number(y)
  if (year < DATED_YEAR_RANGE.min || year > DATED_YEAR_RANGE.max) return null
  const base = { id, orientation, templateVersion: catalog.templateVersion, year, dateMode: 'dated', generated: true }
  if (kind !== 'weekly-blocks' && kind !== 'weekly-journal' && before != null) return null
  if (kind === 'cover') {
    if (a || b || endYear && (Number(endYear) < year || Number(endYear) > year + 1)) return null
    return { ...base, type: 'cover', endYear: endYear ? Number(endYear) : year, name: '첫 장 표지' }
  }
  const month = Number(a)
  if (!a || month < 1 || month > 12 || endYear) return null
  if (kind === 'divider' || kind === 'monthly') {
    if (b) return null
    return { ...base, type: kind, month, name: kind === 'divider' ? `월별 구분 페이지 · ${month}월` : `월간 달력 · ${month}월` }
  }
  const date = Number(b)
  if (!b || date < 1 || date > daysIn(year, month) || day(year, month, date).getUTCDay() !== 1) return null
  const faint = { before: Number(before ?? 0), after: Number(after ?? 0) }
  if (faint.before + faint.after > 6) return null
  return { ...base, type: 'weekly', style: kind.slice('weekly-'.length), month, date, faint, name: `주간 계획 · ${month}월 ${weekOfMonth(day(year, month, date))}주차` }
}

/** 바탕으로 쓰는 만년형 속지 ID */
export function datedBaseId(id) {
  const asset = datedTemplate(id)
  const kind = asset.type === 'weekly' ? `weekly-${asset.style}` : asset.type
  return undatedTemplateId(kind, asset.orientation)
}

/**
 * 기간 안의 날짜 속지 순서. 한 달 묶음 = 구분지 · 먼슬리 · 그 달에 월요일이 있는 주(위클리).
 * 첫 달은 1일이 든 주가 앞달에서 시작해도 넣어 첫 며칠이 빠지지 않게 한다. 기간 밖의 날은 흐리게(-g) 그린다.
 * → [{ month: { year, month }, ids }] (달마다 하루 기록 · 노트를 뒤에 붙이도록 묶어서 돌려준다)
 */
/**
 * 기간의 달력: 달마다 날 수와 그 달에 넣는 주(월요일 · 기간 밖이라 흐리게 그리는 앞뒤 날 수).
 * 주는 월요일이 있는 달에 넣고, 첫 달은 1일이 든 주부터 넣는다.
 */
export function datedCalendar({ year, startMonth, months }) {
  const out = []
  const periodStart = day(year, startMonth, 1), periodEnd = day(year, startMonth + months, 0)
  const faint = monday => ({ before: Math.max(0, Math.round((periodStart - monday) / 86400000)), after: Math.max(0, Math.round((addDays(monday, 6) - periodEnd) / 86400000)) })
  for (let i = 0; i < months; i++) {
    const first = day(year, startMonth + i, 1)
    const { year: y, month: m } = parts(first)
    const weeks = []
    let monday = mondayOf(first)
    if (i > 0 && parts(monday).month !== m) monday = addDays(monday, 7)
    for (; parts(monday).month === m || monday < first; monday = addDays(monday, 7)) weeks.push({ monday, ...faint(monday) })
    out.push({ month: { year: y, month: m }, days: daysIn(y, m), weeks })
  }
  return out
}

export function datedMonths({ orientation, year, startMonth, months, dividers, monthly, weekly, weeklyStyle }) {
  return datedCalendar({ year, startMonth, months }).map(({ month, weeks }) => {
    const ids = []
    if (dividers) ids.push(datedMonthId('divider', month.year, month.month, orientation))
    if (monthly) ids.push(datedMonthId('monthly', month.year, month.month, orientation))
    if (weekly) for (const week of weeks) ids.push(datedWeekId(weeklyStyle, week.monday, orientation, week.before, week.after))
    return { month, ids }
  })
}

// ---------- 그리기 ----------
function text(value, slot, extra = '') {
  const table = DATED_GLYPHS[slot.weight]
  const scale = slot.size / 1000
  const kern = DATED_KERNING[slot.weight] ?? {}
  const chars = [...value]
  // 글자마다 다음 글자까지의 거리 = 폭 + 다음 글자와의 커닝
  const steps = chars.map((ch, i) => {
    if (!table[ch]) throw new Error(`날짜 속지에 없는 글자예요: ${ch}`)
    return table[ch][0] + (i < chars.length - 1 ? kern[ch + chars[i + 1]] ?? 0 : 0)
  })
  const total = steps.reduce((sum, step) => sum + step, 0) * scale
  let x = slot.anchor === 'middle' ? slot.x - total / 2 : slot.anchor === 'end' ? slot.x - total : slot.x
  const paths = chars.map((ch, i) => {
    const d = table[ch][1]
    const path = d ? `<path d="${d}" transform="translate(${x.toFixed(6)} ${slot.y.toFixed(6)}) scale(${scale.toFixed(9)} -${scale.toFixed(9)})" />` : ''
    x += steps[i] * scale
    return path
  }).join('')
  return `<g fill="${slot.fill}" aria-label="${value.replace(/&/g, '&amp;')}"${extra}>${paths}</g>`
}

// 원본과 같이 달력은 5줄까지. 여섯째 주 날짜는 다섯째 줄 같은 칸의 아래쪽 반에 짧은 선으로 나눠 넣는다.
// 앞달 날짜는 흐리게 채우고, 뒷달 날짜는 줄이 남을 때(여섯째 주가 없을 때)만 채운다.
function monthlyBody(layout, year, month) {
  const { calendar: cal, date, title } = layout
  const offset = day(year, month, 1).getUTCDay() // 일요일 시작 달력
  const weeks = Math.ceil((offset + daysIn(year, month)) / 7)
  const rows = Math.min(weeks, 5)
  const cellW = cal.width / 7, cellH = cal.height / rows
  const line = (x1, y, x2, extra = '') => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" fill="none" stroke="#d7d9dc" stroke-width="1"${extra} />`
  let body = text(`${month}월`, title)
  body += Array.from({ length: rows - 1 }, (_, i) => line(cal.x, cal.y + cellH * (i + 1), cal.x + cal.width)).join('')
  const start = addDays(day(year, month, 1), -offset)
  for (let i = 0; i < weeks * 7; i++) {
    const value = addDays(start, i), current = parts(value), inMonth = current.month === month
    const row = Math.floor(i / 7), col = i % 7
    if (!inMonth && (row > 0 && weeks > 5 || row >= rows)) continue
    const split = row >= rows
    const top = cal.y + cellH * Math.min(row, rows - 1) + (split ? cellH / 2 : 0)
    if (split) body += line(cal.x + cellW * col, cal.y + cellH * (rows - 1) + cellH / 2, cal.x + cellW * (col + 1), ` data-week-split="true" data-split-column="${col}"`)
    const style = inMonth ? date.in : date.out
    body += text(String(current.date), { ...style, size: date.size, anchor: 'start', x: cal.x + cellW * col + date.dx, y: top + date.dy },
      ` data-calendar-date="${current.year}-${pad(current.month)}-${pad(current.date)}" data-in-month="${inMonth}"`)
  }
  return { rows, body }
}

function weeklyBody(layout, year, month, date, faint) {
  const monday = day(year, month, date), sunday = addDays(monday, 6)
  const end = parts(sunday)
  const header = end.month === month ? `${month}월 ${weekOfMonth(monday)}주차` : `${month}월 ${weekOfMonth(monday)}주차 & ${end.month}월 1주차`
  const range = `${year}.${pad(month)}.${pad(date)} — ${end.year !== year ? `${end.year}.` : ''}${pad(end.month)}.${pad(end.date)}`
  const dim = i => i < faint.before || i >= 7 - faint.after
  const days = layout.days.map((slot, i) => text(String(parts(addDays(monday, i)).date), dim(i) ? { ...slot, fill: FAINT } : slot)).join('')
  return text(header, layout.header) + text(range, layout.range) + days
}

/**
 * 만년형 속지 XML + 날짜 → 날짜 속지 XML.
 * 만년형에만 있는 덧줄(날짜를 손으로 쓰는 밑줄 · 6줄 달력의 가로줄)은 만년형 생성 스크립트가 x1 x2 y1 y2 순서로 넣은 것이라 그 순서로 찾아 지운다.
 */
export function datedSvg(id, baseXml) {
  const asset = datedTemplate(id)
  if (!asset) throw new Error('날짜 속지 ID 가 올바르지 않아요.')
  const layouts = DATED_LAYOUTS[asset.orientation]
  let xml = baseXml.replace(/<line x1="[^"]*" x2="[^"]*" y1="[^"]*" y2="[^"]*"[^>]*\/>/g, '')
    .replace(/id="undated-[^"]*"/, `id="${id}"`)
  let body
  if (asset.type === 'cover') body = text(asset.endYear !== asset.year ? `${asset.year} — ${asset.endYear}` : String(asset.year), layouts.cover)
  else if (asset.type === 'divider') body = text(`${asset.month}월`, layouts.divider)
  else if (asset.type === 'monthly') {
    const { rows, body: monthBody } = monthlyBody(layouts.monthly, asset.year, asset.month)
    xml = xml.replace(/data-rows="\d+" data-weeks="\d+"/, `data-rows="${rows}" data-weeks="${rows}"`)
    body = monthBody
  } else {
    // 기간 밖 날은 요일 이름(만년형에 있는 글자)도 흐리게
    WEEKDAY_LABELS.forEach((label, i) => {
      if (i < asset.faint.before || i >= 7 - asset.faint.after) xml = xml.replace(`<g fill="#666666" aria-label="${label}">`, `<g fill="${FAINT}" aria-label="${label}">`)
    })
    body = weeklyBody(layouts[`weekly-${asset.style}`], asset.year, asset.month, asset.date, asset.faint)
  }
  return xml.replace(/<\/svg>\s*$/, `${body}</svg>`)
}

export const DATED_KINDS = KINDS
