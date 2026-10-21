import { annualPageIds, REUSABLE_TEMPLATES, getTemplate, normalizeOrientation, reusableTemplates, templateIdForOrientation } from './catalog.js'

export const WEEKLY_CHOICES = [
  { id: 'blocks', name: '4열 블록형', assetId: '2026-weekly-blocks-2026-01-05-landscape' },
  { id: 'journal', name: '저널형', assetId: '2026-weekly-journal-2026-01-05-landscape' },
]
export const DAILY_TEMPLATES = REUSABLE_TEMPLATES.filter(item => ['daily', 'diary', 'scrap'].includes(item.type))
export const EXTRA_TEMPLATES = REUSABLE_TEMPLATES.filter(item => item.type === 'note')
export const DAILY_ASSET_ID = DAILY_TEMPLATES[0].assetId
export function creationTemplates(orientation = 'landscape') {
  const templates = reusableTemplates(orientation)
  return {
    weekly: WEEKLY_CHOICES.map(item => ({ ...item, assetId: templateIdForOrientation(item.assetId, orientation) })),
    daily: templates.filter(item => ['daily', 'diary', 'scrap'].includes(item.type)),
    extra: templates.filter(item => item.type === 'note'),
    legacy: templates.filter(item => item.type !== 'daily'),
  }
}
const defaultChoices = templates => templates.map(item => ({ assetId: item.assetId, enabled: false, count: 1 }))

export function defaultTemplateConfig(orientation = 'landscape') {
  const { daily, extra } = creationTemplates(orientation)
  return { version: 2, orientation: normalizeOrientation(orientation), cover: true, dividers: true, monthly: true, weekly: true, weeklyStyle: 'blocks',
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
  const weeklyStyle = source.weeklyStyle ?? 'blocks'
  if (!WEEKLY_CHOICES.some(item => item.id === weeklyStyle)) throw new Error('위클리 양식을 다시 골라 주세요.')
  const legacy = source.version !== 2
  const config = {
    version: 2, orientation: direction,
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
  if (!Number.isSafeInteger(countConfiguredPages(config))) throw new Error('총 페이지 수가 너무 커요. 장수를 줄여 주세요.')
  return config
}

function annualIds(config) {
  return annualPageIds(config.orientation).filter(id => {
    const type = getTemplate(id).type
    return type === 'cover' ? config.cover : type === 'divider' ? config.dividers : type === 'monthly' ? config.monthly : config.weekly
  }).map(id => getTemplate(id).type === 'weekly' ? id.replace('weekly-blocks-', 'weekly-' + config.weeklyStyle + '-') : id)
}

const choiceCount = choices => choices.reduce((sum, item) => sum + (item.enabled ? item.count : 0), 0)
function countConfiguredPages(config) {
  const perMonth = (config.daily ? choiceCount(config.dailyTemplates) : 0) + choiceCount(config.reusable)
  return Math.max(1, annualIds(config).length + 12 * perMonth + choiceCount(config.legacyEndPages))
}

export function templatePageCount(input) { return countConfiguredPages(normalizeTemplateConfig(input)) }

// 주간 페이지의 월 배정은 제공된 연간 순서를 유지하고 중복하지 않는다.
export function configuredPageIds(input) {
  const config = normalizeTemplateConfig(input)
  const ids = []
  let month = null
  const appendChoices = choices => {
    for (const item of choices) if (item.enabled) for (let i = 0; i < item.count; i++) ids.push(item.assetId)
  }
  const appendMonthPages = () => {
    if (month == null) return
    if (config.daily) appendChoices(config.dailyTemplates)
    appendChoices(config.reusable)
  }
  for (const id of annualPageIds(config.orientation)) {
    const asset = getTemplate(id)
    if (asset.type === 'divider') { appendMonthPages(); month = asset.month }
    if (asset.type === 'cover' && config.cover || asset.type === 'divider' && config.dividers || asset.type === 'monthly' && config.monthly) ids.push(id)
    if (asset.type === 'weekly' && config.weekly) ids.push(id.replace('weekly-blocks-', 'weekly-' + config.weeklyStyle + '-'))
  }
  appendMonthPages()
  appendChoices(config.legacyEndPages)
  ids.forEach(id => getTemplate(id))
  return ids
}
