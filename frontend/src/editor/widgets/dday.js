// 디데이 카운터 위젯: 날짜만 넣어 두면 열 때마다 남은 날을 다시 계산한다. 값은 오브젝트의 widget 에 둔다.
// object.widget = { kind: 'dday', style: 'label' | 'ticket' | 'stamp', title: string, date: 'YYYY-MM-DD' }

export const DDAY_STYLES = [
  { id: 'label', name: '라벨', w: 210, h: 78 },
  { id: 'ticket', name: '티켓', w: 280, h: 129 },
  { id: 'stamp', name: '도장', w: 168, h: 168 },
]
export const DDAY_TITLE_MAX = 14
// 저장 형식(YYYY-MM-DD)이 4자리 연도만 받고, Date.UTC 가 0~99년을 1900년대로 읽으므로 연도는 이 범위만 쓴다
export const DDAY_YEAR_MIN = 1000
export const DDAY_YEAR_MAX = 9999
export const DDAY_DEFAULT_OFFSET = 30
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export const ddayStyleOf = (id) => DDAY_STYLES.find((style) => style.id === id) ?? DDAY_STYLES[0]

const pad = (value) => String(value).padStart(2, '0')
export const dateKey = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`
export const todayParts = (now = new Date()) => ({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })

/** 'YYYY-MM-DD' → { y, m, d }. 없는 날짜(2월 30일 등)나 형식이 다르면 null */
export function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const [y, m, d] = match.slice(1).map(Number)
  if (y < DDAY_YEAR_MIN) return null
  const check = new Date(Date.UTC(y, m - 1, d))
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? { y, m, d } : null
}

/** 오늘부터 일 수만큼 지난 날의 { y, m, d } (달력 날짜 기준이라 서머타임에 흔들리지 않는다) */
export function addDays(parts, days) {
  const next = new Date(Date.UTC(parts.y, parts.m - 1, parts.d) + days * DAY_MS)
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() }
}

/** 월 단위로 옮긴다. 31일에서 짧은 달로 가면 그 달 마지막 날로 맞춘다. */
export function monthShift(parts, months) {
  const index = parts.y * 12 + (parts.m - 1) + months
  const y = Math.floor(index / 12)
  const m = (index % 12) + 1
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { y, m, d: Math.min(parts.d, last) }
}

/**
 * 옵션의 년·월·일 스테퍼: unit('y'|'m'|'d')을 step(±1)만큼 옮긴다.
 * 결과 연도가 범위(1000~9999)를 벗어나면 null — 호출한 쪽은 그 이동을 무시한다.
 */
export function shiftDate(parts, unit, step) {
  const next = unit === 'd' ? addDays(parts, step) : monthShift(parts, unit === 'm' ? step : step * 12)
  return next.y < DDAY_YEAR_MIN || next.y > DDAY_YEAR_MAX ? null : next
}

/** 오늘에서 목표 날짜까지 남은 날 (지났으면 음수). 날짜가 올바르지 않으면 null */
export function daysUntil(date, today = todayParts()) {
  const target = parseDateKey(date)
  if (!target) return null
  return Math.round((Date.UTC(target.y, target.m - 1, target.d) - Date.UTC(today.y, today.m - 1, today.d)) / DAY_MS)
}

/** 34 → 'D-34', 0 → 'D-DAY', -3 → 'D+3', 날짜 없음 → 'D-?' */
export function ddayText(count) {
  if (count == null) return 'D-?'
  if (count === 0) return 'D-DAY'
  return count > 0 ? `D-${count}` : `D+${-count}`
}

/** 티켓 아랫줄: '콘서트 · 11.1 SUN' (제목이 없으면 날짜만) */
export function ddayCaption(widget) {
  const target = parseDateKey(widget.date)
  if (!target) return widget.title ?? ''
  const weekday = WEEKDAYS[new Date(Date.UTC(target.y, target.m - 1, target.d)).getUTCDay()]
  const when = `${target.m}.${target.d} ${weekday}`
  return widget.title ? `${widget.title} · ${when}` : when
}

/** 도장 아랫줄: '2026.11.29' (날짜가 올바르지 않으면 빈 글자) */
export function ddayDateText(date) {
  const target = parseDateKey(date)
  return target ? `${target.y}.${pad(target.m)}.${pad(target.d)}` : ''
}

/** 알림을 줄 날: 일주일 전 · 하루 전 · 당일 */
export const isDdayAlertDay = (count) => count === 7 || count === 1 || count === 0

/** 보관함에서 고른 항목 → 캔버스에 붙일 widget 값 */
export function createDdayWidget(style = 'label', today = todayParts()) {
  return { kind: 'dday', style: ddayStyleOf(style).id, title: '', date: dateKey(addDays(today, DDAY_DEFAULT_OFFSET)) }
}

/** 한 칸에 쓸 보관함 항목 (스티커 보관함의 '위젯' 분류) */
export const WIDGET_ITEMS = DDAY_STYLES.map((style) => ({ widget: 'dday', style: style.id, name: `디데이 ${style.name}` }))

/** 저장된 widget 을 읽는다. 종류·모양이 알 수 없으면 null (그리지 않는다) */
export function normalizeWidget(widget) {
  if (widget?.kind !== 'dday') return null
  return {
    kind: 'dday',
    style: ddayStyleOf(widget.style).id,
    title: typeof widget.title === 'string' ? widget.title.slice(0, DDAY_TITLE_MAX) : '',
    date: widget.date,
  }
}
