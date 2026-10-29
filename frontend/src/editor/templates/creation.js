import { annualPageIds, REUSABLE_TEMPLATES, getTemplate, normalizeOrientation, reusableTemplates, templateIdForOrientation } from './catalog.js'
import { isUndated, monthCount, undatedTemplateId, UNDATED_WEEK_COUNT } from './undated.js'
import { DATED_YEAR_RANGE, datedCalendar, datedCoverId, datedMonthId, datedMonths, datedWeekId } from './dated.js'
import { catalog } from './data.js'

const catalogYear = catalog.year

export const WEEKLY_CHOICES = [
  { id: 'blocks', name: '4열 블록형', assetId: '2026-weekly-blocks-2026-01-05-landscape' },
  { id: 'journal', name: '저널형', assetId: '2026-weekly-journal-2026-01-05-landscape' },
]
// 하루 기록 묶음. 스터디 플래너도 장수로 넣는 속지라 여기에 둔다.
const DAILY_TYPES = ['daily', 'study', 'diary', 'scrap']
export const DAILY_TEMPLATES = REUSABLE_TEMPLATES.filter(item => DAILY_TYPES.includes(item.type))
export const EXTRA_TEMPLATES = REUSABLE_TEMPLATES.filter(item => item.type === 'note')
export const DAILY_ASSET_ID = DAILY_TEMPLATES[0].assetId
export function creationTemplates(orientation = 'landscape', dateMode = 'dated') {
  const templates = reusableTemplates(orientation)
  return {
    weekly: WEEKLY_CHOICES.map(item => ({ ...item, assetId: dateMode === 'undated' ? undatedTemplateId('weekly-' + item.id, normalizeOrientation(orientation)) : templateIdForOrientation(item.assetId, orientation) })),
    daily: templates.filter(item => DAILY_TYPES.includes(item.type)),
    extra: templates.filter(item => item.type === 'note'),
    legacy: templates.filter(item => item.type !== 'daily'),
  }
}
const defaultChoices = templates => templates.map(item => ({ assetId: item.assetId, enabled: false, count: 1 }))

export function defaultTemplateConfig(orientation = 'landscape', dateMode = 'dated') {
  const { daily, extra } = creationTemplates(orientation)
  return { version: 2, dateMode, orientation: normalizeOrientation(orientation), cover: true, dividers: true, monthly: true, weekly: true, weeklyStyle: 'blocks',
    daily: false, dailyTemplates: daily.map(item => ({ assetId: item.assetId, enabled: item.type === 'daily', count: 1 })),
    reusable: defaultChoices(extra), legacyEndPages: [] }
}

function positiveCount(value, label) {
  const text = String(value ?? '')
  const count = Number(text)
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(count)) throw new Error(label + ' 장수는 1 이상의 정수로 입력해 주세요.')
  return count
}

function normalizeChoices(templates, choices, label, active = true) {
  return templates.map(item => {
    const choice = choices?.find(entry => typeof entry?.assetId === 'string' && templateIdForOrientation(entry.assetId, getTemplate(item.assetId).orientation) === item.assetId)
    return { assetId: item.assetId, enabled: choice?.enabled === true,
      count: choice?.enabled === true && active ? positiveCount(choice.count, label + item.name) : 1 }
  })
}

export function normalizeTemplateConfig(input, orientation = input?.orientation) {
  const direction = normalizeOrientation(orientation)
  const templates = creationTemplates(direction)
  const source = input ?? defaultTemplateConfig(direction)
  const dateMode = source.dateMode ?? 'dated'
  if (!['dated', 'undated'].includes(dateMode)) throw new Error('날짜형 또는 만년형을 다시 골라 주세요.')
  const weeklyStyle = source.weeklyStyle ?? 'blocks'
  if (!WEEKLY_CHOICES.some(item => item.id === weeklyStyle)) throw new Error('주간 계획 양식을 다시 골라 주세요.')
  const legacy = source.version !== 2
  const { year, startMonth, months } = normalizePeriod(source)
  const config = {
    version: 2, dateMode, orientation: direction, ...(year != null ? { year } : {}), startMonth, months,
    // 새 다이어리 화면에서 고른 속지(이름·장수 요약용). 페이지 배치는 아래 값만으로 정해진다.
    ...(source.paper && (typeof source.paper.id === 'string' || Array.isArray(source.paper.sections)) ? { paper: { ...source.paper } } : {}),
    cover: source.cover === true, dividers: source.dividers === true,
    monthly: source.monthly === true, weekly: source.weekly === true, weeklyStyle,
    daily: source.daily === true,
    dailyTemplates: normalizeChoices(templates.daily, legacy
      ? [{ assetId: DAILY_ASSET_ID, enabled: true, count: source.dailyCount }]
      : source.dailyTemplates, '매월 ', source.daily === true),
    reusable: normalizeChoices(templates.extra, legacy ? [] : source.reusable, '매월 '),
    // 이전 설정의 맨 뒤 공용 속지를 매월 12번 복제하지 않고 종전 배치를 보존한다.
    legacyEndPages: normalizeChoices(templates.legacy, legacy ? source.reusable : source.legacyEndPages, ''),
  }
  // 묶음 구성이 있으면 페이지 순서는 묶음만으로 정한다 (위 값은 예전 화면 · 요약과의 호환용)
  if (Array.isArray(source.sections)) {
    // 묶음이 없으면 속지 없이 빈 페이지 한 장으로 시작한다 (diaryCreateInput · createDefaultDoc 이 채운다)
    config.sections = source.sections.slice(0, SECTION_LIMITS.sections).map(item => normalizeSection(item, direction)).filter(Boolean)
    expandSections(config)
  }
  if (!Number.isSafeInteger(countConfiguredPages(config))) throw new Error('총 페이지 수가 너무 커요. 장수를 줄여 주세요.')
  return config
}

// 기간: year 가 있으면 날짜 속지를 앱에서 만들어(dated.js) 아무 해 · 아무 달에서 시작해 12개월까지 해를 넘겨 이어 간다.
// year 가 없는 예전 설정은 2026 SVG 파일 한 해 안에서 시작 달과 개월 수만 고른다.
function normalizePeriod(source) {
  const whole = (value, fallback) => Number.isInteger(value) ? value : fallback
  const year = Number.isInteger(source.year) && source.year >= DATED_YEAR_RANGE.min && source.year <= DATED_YEAR_RANGE.max ? source.year : null
  const startMonth = Math.min(12, Math.max(1, whole(source.startMonth, 1)))
  const limit = year != null ? 12 : 13 - startMonth
  const months = Math.min(limit, Math.max(1, whole(source.months, limit)))
  return { year, startMonth, months }
}
const inPeriod = (config, month) => month >= config.startMonth && month < config.startMonth + config.months

function undatedBaseIds(config) {
  const id = kind => undatedTemplateId(kind, config.orientation)
  return [
    ...(config.cover ? [id('cover')] : []),
    ...(config.dividers ? [id('divider')] : []),
    ...(config.monthly ? [id('monthly')] : []),
    ...(config.weekly ? Array(UNDATED_WEEK_COUNT).fill(id('weekly-' + config.weeklyStyle)) : []),
  ]
}

const choiceCount = choices => choices.reduce((sum, item) => sum + (item.enabled ? item.count : 0), 0)
function countConfiguredPages(config) {
  if (config.sections) return Math.max(1, expandSections(config).length)
  const perMonth = (config.daily ? choiceCount(config.dailyTemplates) : 0) + choiceCount(config.reusable)
  const base = isUndated(config) ? undatedBaseIds(config).length : collectConfiguredPages(config, null, false).length
  return Math.max(1, base + monthCount(config) * perMonth + choiceCount(config.legacyEndPages))
}

export function templatePageCount(input) { return countConfiguredPages(normalizeTemplateConfig(input)) }

// 주간 페이지의 월 배정은 제공된 연간 순서를 유지하고 중복하지 않는다.
export function configuredPageIds(input) {
  return collectConfiguredPages(normalizeTemplateConfig(input))
}

// 연간 생성과 같은 배치 규칙으로 한 달만 읽는다. 첫 장 표지와 맨 뒤 구형 추가 내지는 제외한다.
export function configuredMonthPageIds(input, month = 1) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('미리 볼 월을 1~12월 중에서 골라 주세요.')
  return collectConfiguredPages(normalizeTemplateConfig(input), month)
}

// withChoices = false 면 매월 넣는 하루 기록·자유 노트 없이 연간 속지만 모은다. (장수 계산용)
function collectConfiguredPages(config, previewMonth = null, withChoices = true) {
  if (config.sections) return expandSections(config)
  const ids = []
  let month = null
  const appendChoices = choices => {
    for (const item of choices) if (item.enabled) for (let i = 0; i < item.count; i++) ids.push(item.assetId)
  }
  const appendMonthPages = () => {
    if (!withChoices || month == null || previewMonth != null && month !== previewMonth) return
    if (config.daily) appendChoices(config.dailyTemplates)
    appendChoices(config.reusable)
  }
  if (isUndated(config)) {
    ids.push(...undatedBaseIds(config).filter(id => previewMonth == null || getTemplate(id).type !== 'cover'))
    month = previewMonth ?? 1
    appendMonthPages()
    if (previewMonth == null) appendChoices(config.legacyEndPages)
    ids.forEach(id => getTemplate(id))
    return ids
  }
  if (config.year != null) {
    const blocks = datedMonths(config)
    const endYear = blocks[blocks.length - 1].month.year
    if (config.cover && previewMonth == null) ids.push(datedCoverId(config.year, endYear, config.orientation))
    for (const block of blocks) {
      if (previewMonth != null && block.month.month !== previewMonth) continue
      ids.push(...block.ids)
      month = block.month.month
      appendMonthPages()
    }
    if (previewMonth == null && withChoices) appendChoices(config.legacyEndPages)
    ids.forEach(id => getTemplate(id))
    return ids
  }
  for (const id of annualPageIds(config.orientation)) {
    const asset = getTemplate(id)
    if (asset.type === 'divider') { if (inPeriod(config, month)) appendMonthPages(); month = asset.month }
    if (previewMonth != null && month !== previewMonth) continue
    if (month != null && !inPeriod(config, month)) continue
    if (asset.type === 'cover' && config.cover || asset.type === 'divider' && config.dividers || asset.type === 'monthly' && config.monthly) ids.push(id)
    if (asset.type === 'weekly' && config.weekly) ids.push(id.replace('weekly-blocks-', 'weekly-' + config.weeklyStyle + '-'))
  }
  if (inPeriod(config, month)) appendMonthPages()
  if (previewMonth == null && withChoices) appendChoices(config.legacyEndPages)
  ids.forEach(id => getTemplate(id))
  return ids
}

// ---------- 묶음 구성 (sections) ----------
// 새 다이어리 속지를 여러 묶음으로 쌓는다. 묶음은 순서대로 이어 붙인다.
//   planner: 기간(날짜 있음 · 없음, 개월)을 두고 속지 줄(rows)을 달마다 위에서부터 차례로 넣는다.
//            줄은 날짜 속지 { piece: 'cover' | 'divider' | 'monthly' | 'weekly-blocks' | 'weekly-journal' } 이거나
//            장수 속지 { assetId, count, every: 'start' | 'month' | 'week' | 'day' } 다.
//            표지 · '처음' 줄은 기간 앞에 한 번, 주 단위 줄(주간 · 매주 · 주간이 있을 때 매일)이 이어지면 주마다 번갈아 넣는다.
//   pages:   여러 속지를 순서대로 몇 장씩(items) 넣고, 그 순서를 repeat 번 되풀이한다 (예: 일기 1 → 사진 1, 30번).
export const SECTION_LIMITS = { sections: 12, items: 8, count: 400, repeat: 200, insert: 10, total: 2000 }
export const PLANNER_PIECES = ['cover', 'divider', 'monthly', 'weekly-blocks', 'weekly-journal']
const INSERT_EVERY = ['start', 'month', 'week', 'day']
// 날짜 없는 플래너의 한 달 주 수 (월요일이 든 달로 나누면 한 달은 4~5주)
const UNDATED_MONTH_WEEKS = 5

function sectionItem(item, orientation, max) {
  if (typeof item?.assetId !== 'string') return null
  let asset
  try { asset = getTemplate(templateIdForOrientation(item.assetId, orientation)) } catch { return null }
  const count = Number.isInteger(item.count) ? Math.min(max, Math.max(1, item.count)) : 1
  return { assetId: asset.id, count }
}
const sectionItems = (items, orientation, max) => Array.isArray(items) ? items.slice(0, SECTION_LIMITS.items).map(item => sectionItem(item, orientation, max)).filter(Boolean) : []

// 예전 플래너 묶음(표지 · 구분지 · 월간 · 주간을 켜고 끄는 값 + 사이에 넣기 하나)을 줄로 읽는다
function legacyPlannerRows(source, orientation) {
  const weekly = source.weekly === true
  const rows = [
    ...(source.cover !== false ? [{ piece: 'cover' }] : []),
    ...(source.dividers !== false ? [{ piece: 'divider' }] : []),
    ...(source.monthly !== false ? [{ piece: 'monthly' }] : []),
    ...(weekly ? [{ piece: 'weekly-' + (WEEKLY_CHOICES.some(item => item.id === source.weeklyStyle) ? source.weeklyStyle : 'blocks') }] : []),
  ]
  let every = ['month', 'week', 'day'].includes(source.insert?.every) ? source.insert.every : 'month'
  if (every === 'week' && !weekly) every = 'month'
  for (const item of sectionItems(source.insert?.items, orientation, SECTION_LIMITS.insert)) rows.push({ ...item, every })
  return rows
}

function normalizeSection(source, orientation) {
  if (source?.kind === 'pages') {
    const items = sectionItems(source.items, orientation, SECTION_LIMITS.count)
    if (!items.length) return null
    const repeat = Number.isInteger(source.repeat) ? Math.min(SECTION_LIMITS.repeat, Math.max(1, source.repeat)) : 1
    return { kind: 'pages', items, repeat }
  }
  if (source?.kind !== 'planner') return null
  const dated = source.dateMode !== 'undated'
  const legacy = !Array.isArray(source.rows)
  const rows = legacy ? legacyPlannerRows(source, orientation) : source.rows.slice(0, SECTION_LIMITS.items).flatMap(row => {
    if (PLANNER_PIECES.includes(row?.piece)) return [{ piece: row.piece }]
    const item = sectionItem(row, orientation, SECTION_LIMITS.insert)
    return item ? [{ ...item, every: INSERT_EVERY.includes(row.every) ? row.every : 'month' }] : []
  })
  if (!rows.length) return null
  const year = Number.isInteger(source.year) && source.year >= DATED_YEAR_RANGE.min && source.year <= DATED_YEAR_RANGE.max ? source.year : catalogYear
  const startMonth = Number.isInteger(source.startMonth) ? Math.min(12, Math.max(1, source.startMonth)) : 1
  // 예전 날짜 없는 플래너는 한 달 치(주간 UNDATED_WEEK_COUNT 장)였다
  const months = Number.isInteger(source.months) && !(legacy && !dated) ? Math.min(12, Math.max(1, source.months)) : dated ? 12 : 1
  return {
    kind: 'planner', dateMode: dated ? 'dated' : 'undated', months, rows,
    ...(dated ? { year, startMonth } : { weeks: legacy ? UNDATED_WEEK_COUNT : source.weeks === UNDATED_WEEK_COUNT ? UNDATED_WEEK_COUNT : UNDATED_MONTH_WEEKS }),
  }
}

const isStart = row => row.piece === 'cover' || row.every === 'start'

function expandPlanner(section, orientation, push) {
  const dated = section.dateMode === 'dated'
  const calendar = dated
    ? datedCalendar({ year: section.year, startMonth: section.startMonth, months: section.months })
    : Array.from({ length: section.months }, () => ({ days: 31, weeks: Array.from({ length: section.weeks }, () => ({ before: 0, after: 0 })) }))
  const hasWeekly = section.rows.some(row => row.piece?.startsWith('weekly-'))
  // 주마다 넣는 줄: 주간 · 매주, 주간이 있으면 매일도 (그 주의 날만큼)
  const weekLevel = row => row.piece?.startsWith('weekly-') || row.every === 'week' || (row.every === 'day' && hasWeekly)
  const put = (row, times) => { for (let i = 0; i < times * row.count; i++) push(row.assetId) }
  for (const row of section.rows) {
    if (row.piece === 'cover') push(dated ? datedCoverId(section.year, calendar[calendar.length - 1].month.year, orientation) : undatedTemplateId('cover', orientation))
    else if (row.every === 'start') put(row, 1)
  }
  for (const month of calendar) {
    const pieceId = piece => dated ? datedMonthId(piece, month.month.year, month.month.month, orientation) : undatedTemplateId(piece, orientation)
    for (let i = 0; i < section.rows.length;) {
      const row = section.rows[i]
      if (isStart(row)) { i++; continue }
      if (!weekLevel(row)) {
        if (row.piece) push(pieceId(row.piece))
        else put(row, row.every === 'day' ? month.days : 1)
        i++
        continue
      }
      // 이어진 주 단위 줄은 주마다 위에서부터 번갈아 넣는다
      let end = i
      while (end < section.rows.length && (weekLevel(section.rows[end]) || isStart(section.rows[end]))) end++
      const run = section.rows.slice(i, end).filter(weekLevel)
      for (const week of month.weeks) for (const item of run) {
        if (item.piece) push(dated ? datedWeekId(item.piece.slice('weekly-'.length), week.monday, orientation, week.before, week.after) : undatedTemplateId(item.piece, orientation))
        // 매일: 그 주에서 기간 안의 날만큼 (기간 밖이라 흐리게 그린 날은 빼고)
        else put(item, item.every === 'day' ? 7 - week.before - week.after : 1)
      }
      i = end
    }
  }
}

/** 묶음 구성 → 페이지 속지 ID 순서. 전체가 SECTION_LIMITS.total 을 넘으면 오류 */
function expandSections(config) {
  const ids = []
  const push = id => {
    if (ids.length >= SECTION_LIMITS.total) throw new Error(`속지는 모두 ${SECTION_LIMITS.total}장까지 만들 수 있어요. 장수나 기간을 줄여 주세요.`)
    ids.push(id)
  }
  for (const section of config.sections) {
    if (section.kind === 'planner') expandPlanner(section, config.orientation, push)
    else for (let r = 0; r < section.repeat; r++) for (const item of section.items) for (let i = 0; i < item.count; i++) push(item.assetId)
  }
  return ids
}
