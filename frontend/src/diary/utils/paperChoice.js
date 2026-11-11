import { configuredPageIds, defaultTemplateConfig, normalizeTemplateConfig, templatePageCount } from '../../editor/templates/creation.js'
import { everyReusableTemplate, normalizeOrientation } from '../../editor/templates/catalog.js'
import { ROUTE_TEMPLATE_SELECTION_ENABLED, INK_RECORD_TEMPLATE_SELECTION_ENABLED } from '../../editor/templates/serverCatalog.js'
import { datedCalendar, datedCoverId, datedMonthId, datedWeekId } from '../../editor/templates/dated.js'
import { undatedTemplateId } from '../../editor/templates/undated.js'
import { remoteTemplateAssetId, remoteTemplateGroups, remoteTemplateList, remoteTemplateOf } from '../../editor/templates/remoteTemplates.js'

// 새 다이어리의 속지: 가로 분류 탭(노트 · 플래너 · 일기) 안에서 속지를 한 장 종류씩 고른다.
// 미리 섞인 세트(예: 표지 + 구분지 + 월간 + 주간)는 두지 않고, 한 묶음에 속지를 여러 줄로 넣어 직접 섞는다.
export const PAPER_GROUPS = [
  { id: 'note', name: '노트' },
  { id: 'planner', name: '플래너' },
  { id: 'diary', name: '일기' },
]

// kind: 'period' 는 기간으로 장수가 정해지는 날짜 속지(every 마다 한 장), 'cover' 는 묶음 앞 한 장,
//       'count' 는 장수를 직접 고르는 속지. type: 장수형의 공용 속지 종류 (catalog 의 reusable type · note background)
export const PAPERS = [
  { id: 'plain', group: 'note', name: '무지', kind: 'count', type: 'note', background: 'plain' },
  { id: 'ruled', group: 'note', name: '줄', kind: 'count', type: 'note', background: 'ruled' },
  { id: 'grid', group: 'note', name: '모눈', kind: 'count', type: 'note', background: 'grid' },
  { id: 'dots', group: 'note', name: '도트', kind: 'count', type: 'note', background: 'dots' },
  { id: 'cover', group: 'planner', name: '표지', kind: 'cover' },
  { id: 'divider', group: 'planner', name: '구분지', kind: 'period', every: 'month' },
  { id: 'monthly', group: 'planner', name: '월간 달력', kind: 'period', every: 'month' },
  { id: 'weekly-blocks', group: 'planner', name: '주간 · 블록', kind: 'period', every: 'week' },
  { id: 'weekly-journal', group: 'planner', name: '주간 · 저널', kind: 'period', every: 'week' },
  { id: 'day', group: 'planner', name: '데일리 플래너', kind: 'count', type: 'day' },
  { id: 'study', group: 'planner', name: '스터디 플래너', kind: 'count', type: 'study' },
  // 여행 노선은 장수를 여행 기간으로 고른다(실기 피드백 2026-11-09). 기본 2박 3일
  { id: 'route', group: 'planner', name: '여행 노선', kind: 'count', type: 'route', defaultCount: 3, countSteps: [[2, '1박 2일'], [3, '2박 3일'], [4, '3박 4일'], [5, '4박 5일'], [7, '1주'], [14, '2주'], [30, '한 달']] },
  { id: 'diary', group: 'diary', name: '하루 일기', kind: 'count', type: 'diary' },
  { id: 'scrap', group: 'diary', name: '사진 · 스크랩', kind: 'count', type: 'scrap' },
  // 발색 기록: 잉크병 모양만 다른 두 벌. 병을 칠하면 색 값이 저절로 찬다(editor/templates/inkRecord.js)
  { id: 'ink-record-round', group: 'diary', name: '발색 기록 · 둥근 병', kind: 'count', type: 'inkRecord', bottle: 'round' },
  { id: 'ink-record-square', group: 'diary', name: '발색 기록 · 각진 병', kind: 'count', type: 'inkRecord', bottle: 'square' },
]
// 예전에 저장한 다이어리 요약에만 쓰는 이름
const LEGACY_NAMES = { year: '1년 플래너' }
// 없어진 속지 ID → 대신 쓰는 속지 (하루 계획 → 데일리 플래너). 예전에 저장한 다이어리 설정을 읽을 때만 쓴다.
const REPLACED_PAPERS = { daily: 'day' }

export const COUNT_STEPS = [10, 30, 50, 100]
/** 장수 빠른 선택: 속지가 정한 값이 있으면 우선한다. */
export const countStepsOf = paper => paper?.countSteps ?? COUNT_STEPS
export const MONTH_STEPS = [3, 6, 12]
export const COUNT_LIMIT = { min: 1, max: 400 }
// 날짜 속지는 앱이 만들어(editor/templates/dated.js) 어느 해든 고를 수 있다. 고르는 칸은 올해 앞뒤로 둔다.
const THIS_YEAR = new Date().getFullYear()
export const PAPER_YEARS = Array.from({ length: 7 }, (_, i) => THIS_YEAR - 1 + i)
export const MONTH_LIMIT = 12

// 원격 속지(앱 배포 없이 catalog.json 으로 추가, editor/templates/remoteTemplates.js): 장수를 고르는 한 장짜리 속지로, 목록에 적힌 탭 끝에 붙는다.
// 고른 속지 id 는 'remote:<id>'. 목록을 아직 못 받았거나 숨긴 속지도 이미 고른 줄에서는 그대로 쓴다(이름만 '추가 속지').
// 목록은 새 탭(templateGroups)도 더할 수 있다. 숨긴 탭의 속지는 고르기에 보이지 않는다.
const REMOTE_PAPER = /^remote:([a-z0-9][a-z0-9-]{0,39})$/
const remotePaper = (id, item) => ({ id: `remote:${id}`, group: item?.group ?? 'note', name: item?.name ?? '추가 속지', kind: 'count', remoteTemplate: id, ...(item?.portraitOnly ? { portraitOnly: true } : {}), ...(/^packing-list(?:-v[2-8])?$/.test(id) ? { defaultCount: 1, countSteps: [1, 2, 3] } : {}) })
const hiddenGroups = () => new Set(remoteTemplateGroups().filter(group => group.hidden).map(group => group.id))
const remotePapers = () => {
  const hidden = hiddenGroups()
  return remoteTemplateList().filter(item => !item.hidden && !hidden.has(item.group)).map(item => remotePaper(item.id, item))
}

/** 속지 고르기 탭: 앱 탭(노트 · 플래너 · 일기) + 목록이 더한 탭(숨긴 것 빼고). 원격 목록이 바뀌면 다시 불러야 한다(useRemoteTemplates) */
export const paperGroups = () => [...PAPER_GROUPS, ...remoteTemplateGroups().filter(group => !group.hidden).map(({ id, name }) => ({ id, name, remote: true }))]

export const paperById = id => {
  const remote = typeof id === 'string' ? REMOTE_PAPER.exec(id) : null
  if (remote) return remotePaper(remote[1], remoteTemplateOf(remote[1]))
  return PAPERS.find(paper => paper.id === (REPLACED_PAPERS[id] ?? id)) ?? (LEGACY_NAMES[id] ? { id, name: LEGACY_NAMES[id], kind: 'period' } : PAPERS[0])
}
// 여행 노선(V36) · 발색 기록(V45)은 서버 행이 들어가기 전 빌드(플래그 0)에서는 고르지 못한다
// (catalog.js 의 페이지 추가 메뉴와 같은 기준). 이미 만든 다이어리는 paperById 로 그대로 읽는다.
const selectable = paper => (paper.type !== 'route' || ROUTE_TEMPLATE_SELECTION_ENABLED)
  && (paper.type !== 'inkRecord' || INK_RECORD_TEMPLATE_SELECTION_ENABLED)
/** 탭의 속지들: 앱 속지 + 원격 속지(숨긴 것 빼고). 원격 목록이 바뀌면 다시 불러야 한다(useRemoteTemplates) */
export const papersIn = group => [...PAPERS, ...remotePapers()].filter(paper => paper.group === group && selectable(paper))

/** 장수형 속지(표지 포함) → 그 방향의 속지 ID. 날짜 없는 표지를 쓴다. */
export function countAssetId(paperId, orientation) {
  const paper = paperById(paperId)
  const direction = normalizeOrientation(orientation)
  if (paper.kind === 'cover') return undatedTemplateId('cover', direction)
  if (paper.remoteTemplate) return remoteTemplateAssetId(paper.remoteTemplate, direction)
  // 같은 종류 안에서 갈래가 더 있는 속지(노트의 바탕, 발색 기록의 병 모양)는 그 값까지 맞춘다.
  // **고르기 목록이 아니라 전체**에서 찾는다 — 배포 플래그로 가린 속지도 이미 만든 페이지는 열려야 한다.
  return everyReusableTemplate(direction).find(item => item.type === paper.type
    && (paper.background == null || item.background === paper.background)
    && (paper.bottle == null || item.bottle === paper.bottle)).assetId
}

/** 속지 타일 미리보기 ID. 날짜 속지는 묶음의 기간(없으면 올해 1월) 첫 장으로 보인다. */
export function paperPreviewId(paperId, orientation, period = null) {
  const paper = paperById(paperId)
  const direction = normalizeOrientation(orientation)
  if (paper.kind === 'count') return countAssetId(paperId, direction)
  const { dated = true, year = THIS_YEAR, startMonth = 1 } = period ?? {}
  if (!dated) return undatedTemplateId(paper.id, direction)
  if (paper.kind === 'cover') return datedCoverId(year, year, direction)
  if (paper.every === 'month') return datedMonthId(paper.id, year, startMonth, direction)
  const [week] = datedCalendar({ year, startMonth, months: 1 })[0].weeks
  return datedWeekId(paper.id.slice('weekly-'.length), week.monday, direction, week.before, week.after)
}

export function periodLabel(period) {
  if (!period.dated) return `날짜 없이 · ${period.months ?? 1}개월`
  const year = period.year ?? THIS_YEAR
  const last = period.startMonth + period.months - 2 // 0 부터 센 마지막 달
  const endYear = year + Math.floor(last / 12), endMonth = last % 12 + 1
  const pad = value => String(value).padStart(2, '0')
  return `${year}.${pad(period.startMonth)} – ${endYear !== year ? `${endYear}.` : ''}${pad(endMonth)}`
}

/** 숫자 칸 입력값을 범위 안의 정수로. 숫자가 아니면 null */
export function clampWhole(text, min, max) {
  const value = Number.parseInt(String(text).replace(/[^0-9]/g, ''), 10)
  if (!Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

// ---------- 묶음 구성 ----------
// 새 다이어리 속지를 여러 묶음으로 쌓는다 (editor/templates/creation.js 의 sections). 묶음은 차례로 이어 붙는다.
//   묶음 = { key, rows: [{ key, paper, count, every }], dated, year, startMonth, months, repeat }
//   - 줄에 날짜 속지(구분지 · 월간 · 주간)가 있으면 기간 묶음: 달마다 줄을 위에서부터 넣고,
//     장수 속지는 every(처음 · 매달 · 매주 · 매일)마다 count 장씩, 표지는 맨 앞 한 장.
//   - 없으면 장수 묶음: 줄을 위에서부터 count 장씩 넣고 그 순서를 repeat 번 되풀이한다.
// key 는 화면에서 줄을 구분하는 값이라 저장하지 않는다.
export const PAPER_EVERY = [{ id: 'start', label: '처음' }, { id: 'month', label: '매달' }, { id: 'week', label: '매주' }, { id: 'day', label: '매일' }]
export const INSERT_LIMIT = 10
export const REPEAT_LIMIT = 200
export const ROW_LIMIT = 8
let nextKey = 0
const newKey = () => `k${(nextKey += 1)}`

export const newRow = (paper, count = 1, every = 'month') => ({ key: newKey(), paper, count, every })
/** 빈 묶음. 속지는 사용자가 고른다 (미리 골라 두지 않는다). */
export const newSection = () => ({ key: newKey(), rows: [], dated: true, year: THIS_YEAR, startMonth: 1, months: 12, repeat: 1 })
// 새 다이어리는 속지 묶음 없이 시작한다 (빈 페이지 한 장)
export const defaultSections = () => []

export const isPeriodSection = section => section.rows.some(row => paperById(row.paper).kind === 'period')
const isStartRow = row => paperById(row.paper).kind === 'cover' || row.every === 'start'

/**
 * 묶음 값을 맞춘다: 기간 묶음은 표지 · '처음' 줄을 맨 위로 올리고(넣는 차례와 보이는 차례가 같게)
 * 장수 줄을 INSERT_LIMIT 안으로, 표지는 한 장으로 둔다. 장수 묶음이 되면 반복은 그대로 둔다.
 */
export function tidySection(section) {
  // 장수 묶음에 한 줄만 남으면 반복을 장수로 펼친다 (한 줄에는 반복 칸이 없다)
  if (!isPeriodSection(section)) return section.rows.length === 1 && section.repeat > 1
    ? { ...section, rows: [{ ...section.rows[0], count: Math.min(COUNT_LIMIT.max, section.rows[0].count * section.repeat) }], repeat: 1 } : section
  const rows = section.rows.map(row => {
    const kind = paperById(row.paper).kind
    if (kind === 'cover') return { ...row, count: 1 }
    if (kind === 'count') return { ...row, count: Math.min(INSERT_LIMIT, row.count), every: row.every ?? 'month' }
    return row
  })
  return { ...section, rows: [...rows.filter(isStartRow), ...rows.filter(row => !isStartRow(row))] }
}

// ---------- 속지 목록 (화면) ----------
// 화면은 묶음을 따로 보이지 않고 속지를 한 줄 목록으로 둔다. 이웃한 두 속지 사이마다 '이어서'(다음 묶음) · '섞어서'(같은 묶음)를 고른다.
// 아래 함수는 그 목록 조작을 묶음 배열(sections)에 옮긴다.

/** 목록 끝에 속지 한 종류를 이어서 더한다 (새 묶음). */
export function appendPaper(sections, paperId) {
  const paper = paperById(paperId)
  return [...sections, tidySection({ ...newSection(), rows: [newRow(paperId, paper.kind === 'count' ? paper.defaultCount ?? 10 : 1)] })]
}

const isCountOnly = section => section.rows.length === 1 && section.repeat === 1 && paperById(section.rows[0].paper).kind === 'count'

/**
 * index 번째 묶음과 다음 묶음을 섞는다 (한 묶음으로).
 * 장수 속지 둘(예: 일기 30 · 사진 10)은 적은 쪽 장수만큼 번갈아 반복한다 (일기 3 → 사진 1 을 10번).
 * 날짜 속지가 생기면 기간 묶음이 되고, 장수 묶음에서 온 속지는 '매달 1장' 으로 들어간다. 합친 줄이 ROW_LIMIT 를 넘으면 그대로 둔다.
 */
export function mergeSections(sections, index) {
  const a = sections[index], b = sections[index + 1]
  if (!a || !b || a.rows.length + b.rows.length > ROW_LIMIT) return sections
  let merged
  if (isCountOnly(a) && isCountOnly(b)) {
    const [x, y] = [a.rows[0].count, b.rows[0].count]
    const times = Math.min(REPEAT_LIMIT, x, y)
    merged = { ...a, rows: [{ ...a.rows[0], count: Math.max(1, Math.round(x / times)) }, { ...b.rows[0], count: Math.max(1, Math.round(y / times)) }], repeat: times }
  } else {
    const [periodA, periodB] = [isPeriodSection(a), isPeriodSection(b)]
    const period = periodA ? a : periodB ? b : null
    // 장수 묶음이 기간 묶음에 들어가면 그 속지는 매달 한 장부터
    const join = (section, isPeriod) => period && !isPeriod ? section.rows.map(row => paperById(row.paper).kind === 'count' ? { ...row, count: 1, every: 'month' } : row) : section.rows
    merged = { ...a, ...(period ? { dated: period.dated, year: period.year, startMonth: period.startMonth, months: period.months } : {}),
      rows: [...join(a, periodA), ...join(b, periodB)], repeat: period ? 1 : a.repeat }
  }
  return [...sections.slice(0, index), tidySection(merged), ...sections.slice(index + 2)]
}

/**
 * index 번째 묶음을 at 번째 줄 뒤에서 나눈다 (이어서).
 * 장수 묶음에서 혼자 남는 줄은 반복만큼 장수로 펼친다 (일기 1 → 사진 1 을 30번 → 일기 30장 · 사진 30장).
 */
export function splitSection(sections, index, at) {
  const section = sections[index]
  if (!section || at < 0 || at >= section.rows.length - 1) return sections
  const part = (rows, key) => {
    let next = { ...section, key, rows }
    if (!isPeriodSection(section) && rows.length === 1 && section.repeat > 1) next = { ...next, rows: [{ ...rows[0], count: Math.min(COUNT_LIMIT.max, rows[0].count * section.repeat) }], repeat: 1 }
    return tidySection(next)
  }
  return [...sections.slice(0, index), part(section.rows.slice(0, at + 1), section.key), part(section.rows.slice(at + 1), newKey()), ...sections.slice(index + 1)]
}

/** 목록의 속지 하나를 바로 위 속지와 자리를 바꾼다. 이어서 · 섞어서 자리는 그대로 두고 속지만 옮긴다. */
export function moveUp(sections, sectionIndex, rowIndex) {
  const spots = sections.flatMap((section, s) => section.rows.map((row, r) => [s, r]))
  const at = spots.findIndex(([s, r]) => s === sectionIndex && r === rowIndex)
  if (at <= 0) return sections
  const [[s1, r1], [s2, r2]] = [spots[at - 1], spots[at]]
  const next = sections.map(section => ({ ...section, rows: [...section.rows] }))
  ;[next[s1].rows[r1], next[s2].rows[r2]] = [sections[s2].rows[r2], sections[s1].rows[r1]]
  return next.map(tidySection)
}

/** 목록의 속지 하나를 바로 아래 속지와 자리를 바꾼다. */
export function moveDown(sections, sectionIndex, rowIndex) {
  const spots = sections.flatMap((section, s) => section.rows.map((row, r) => [s, r]))
  const at = spots.findIndex(([s, r]) => s === sectionIndex && r === rowIndex)
  return at < 0 || at >= spots.length - 1 ? sections : moveUp(sections, ...spots[at + 1])
}

/**
 * 끌어서 옮기기: 속지 하나를 빼서 목록의 to 번째(뺀 뒤 목록 기준) 자리에 넣는다.
 * 섞인 판 안(앞뒤가 같은 판)에 놓으면 그 판에 들어가고, 아니면 혼자 이어서 들어간다.
 * 장수 묶음에서 기간 판에 들어가면 매달 1장부터.
 */
export function movePaper(sections, sectionIndex, rowIndex, to) {
  const flat = sections.flatMap((section, s) => section.rows.map(row => ({ row, s })))
  const moving = sections[sectionIndex]?.rows[rowIndex]
  const from = flat.findIndex(item => item.row === moving)
  if (from < 0) return sections
  const [moved] = flat.splice(from, 1)
  const at = Math.max(0, Math.min(flat.length, to))
  const before = flat[at - 1], after = flat[at]
  const join = before && after && before.s === after.s ? before.s : null
  if (join == null && at === from && sections[sectionIndex].rows.length === 1) return sections
  let row = moved.row
  if (join != null && isPeriodSection(sections[join]) && !isPeriodSection(sections[moved.s]) && paperById(row.paper).kind === 'count') row = { ...row, count: 1, every: 'month' }
  flat.splice(at, 0, { row, s: join ?? 'new' })
  const next = []
  for (const item of flat) {
    const last = next[next.length - 1]
    if (last && last.s === item.s) { last.rows.push(item.row); continue }
    const base = item.s === 'new' ? { ...sections[moved.s], key: newKey(), repeat: 1 } : sections[item.s]
    next.push({ s: item.s, base, rows: [item.row] })
  }
  return next.map(({ base, rows }) => tidySection({ ...base, rows }))
}

/** 목록에서 속지 하나를 뺀다. 묶음이 비면 묶음도 뺀다. */
export function removePaper(sections, sectionIndex, key) {
  return sections.flatMap((section, s) => {
    if (s !== sectionIndex) return [section]
    const next = removeRow(section, key)
    return next.rows.length ? [next] : []
  })
}

export const changeRowPaper = (section, key, paperId) => tidySection({ ...section, rows: section.rows.map(row => row.key === key ? { ...row, paper: paperId } : row) })
export const changeRow = (section, key, patch) => tidySection({ ...section, rows: section.rows.map(row => row.key === key ? { ...row, ...patch } : row) })
export const removeRow = (section, key) => tidySection({ ...section, rows: section.rows.filter(row => row.key !== key) })

/** 섞은 묶음이 넣는 차례 (예: 하루 일기 1장 → 사진 · 스크랩 1장을 30번 반복). 끝 글자가 늘 '장'이라 조사는 '을'이다. */
export function mixOrder(section) {
  return `${section.rows.map(row => `${paperById(row.paper).name} ${row.count}장`).join(' → ')}을 ${section.repeat}번 반복`
}

/** 예전 화면 값(플래너 { paper, insert } · 페이지 { items })을 줄 묶음으로 읽는다 */
function readSection(section) {
  if (Array.isArray(section?.rows)) return section
  const base = { key: newKey(), dated: section?.dated !== false, year: section?.year ?? 2026, startMonth: section?.startMonth ?? 1, months: section?.months ?? 12, repeat: section?.repeat ?? 1 }
  if (section?.kind === 'pages') return { ...base, rows: (section.items ?? []).map(item => newRow(item.paper, item.count)) }
  const pieces = { year: ['cover', 'divider', 'monthly', 'weekly-blocks'] }[section?.paper] ?? ['cover', 'divider', section?.paper ?? 'monthly']
  return { ...base, rows: [...pieces.map(paper => newRow(paper)), ...(section?.insert?.paper ? [newRow(section.insert.paper, section.insert.count, section.insert.every)] : [])] }
}

function sectionSource(section, orientation) {
  if (!isPeriodSection(section)) return { kind: 'pages', repeat: section.repeat, items: section.rows.map(row => ({ assetId: countAssetId(row.paper, orientation), count: row.count })) }
  return {
    kind: 'planner', dateMode: section.dated ? 'dated' : 'undated', year: section.year, startMonth: section.startMonth, months: section.months,
    rows: section.rows.map(row => paperById(row.paper).kind === 'count' ? { assetId: countAssetId(row.paper, orientation), count: row.count, every: row.every } : { piece: row.paper }),
  }
}

const stripKeys = section => ({ rows: section.rows.map(({ key, ...row }) => row), dated: section.dated, year: section.year, startMonth: section.startMonth, months: section.months, repeat: section.repeat })

/** 묶음들 → 생성기 설정. 빈 묶음은 뺀다. paper.sections 에 화면 값을 남겨 요약 · 다시 열기에 쓴다. */
export function sectionsTemplateConfig(sections, orientation) {
  const direction = normalizeOrientation(orientation)
  const filled = sections.filter(section => section.rows.length)
  const dated = filled.some(section => isPeriodSection(section) && section.dated)
  return normalizeTemplateConfig({ ...defaultTemplateConfig(direction, dated ? 'dated' : 'undated'), cover: false, dividers: false, monthly: false, weekly: false,
    paper: { sections: filled.map(stripKeys) }, sections: filled.map(section => sectionSource(section, direction)) })
}

export const sectionPageIds = (section, orientation) => section.rows.length ? configuredPageIds(sectionsTemplateConfig([section], orientation)) : []

/** 묶음 이름: 속지를 넣는 차례 (예: 구분지 → 월간 달력 → 주간 · 블록) */
export function sectionTitle(section) {
  if (!section.rows.length) return '빈 묶음'
  return section.rows.map(row => paperById(row.paper).name).join(' → ')
}

/** 줄 하나의 넣는 양: 기간 묶음은 '매달 1장' · '처음 1장', 장수 묶음은 '10장' */
export function rowAmount(section, row) {
  const paper = paperById(row.paper)
  if (!isPeriodSection(section)) return `${row.count}장`
  if (paper.kind === 'cover') return '처음 1장'
  if (paper.kind === 'period') return `${paper.every === 'week' ? '매주' : '매달'} 1장`
  return `${PAPER_EVERY.find(item => item.id === row.every)?.label ?? '매달'} ${row.count}장`
}

/** 묶음 설명: 기간, 또는 장수 · 반복 */
export function sectionDetail(section) {
  if (!section.rows.length) return ''
  if (isPeriodSection(section)) return periodLabel(section)
  if (section.rows.length === 1) return `${section.rows[0].count}장`
  return `${section.rows.map(row => row.count).join(' + ')}장${section.repeat > 1 ? ` × ${section.repeat}번` : ''}`
}

function paperSummary(choice) {
  const name = paperById(choice.id).name
  if (choice.count != null && paperById(choice.id).kind === 'count') return `${name} · ${choice.count}장`
  return `${name} · ${choice.dated ? periodLabel({ year: 2026, startMonth: 1, months: 12, ...choice }) : '날짜 없음'}`
}

/** 저장된 다이어리 설정의 속지 요약. 예전 구성(여러 속지를 함께 고른 다이어리)은 페이지 수로 보여 준다. */
export function savedPaperSummary(config) {
  const saved = config?.paper?.sections
  if (Array.isArray(saved) && !saved.length) return '속지 없음'
  if (Array.isArray(saved)) {
    const [first, ...rest] = saved.map(readSection)
    let total = null
    try { total = templatePageCount(config) } catch { total = null }
    return `${sectionTitle(first)}${rest.length ? ` 외 ${rest.length}묶음` : ''}${total ? ` · ${total}페이지` : ''}`
  }
  // 연도 없이 저장된 예전 요약은 2026 SVG 로 만든 다이어리다
  if (config?.paper?.id) return paperSummary({ year: 2026, ...config.paper })
  try { return `직접 구성 · ${templatePageCount(config)}페이지` } catch { return '직접 구성' }
}
