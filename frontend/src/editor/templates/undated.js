export const UNDATED_WEEK_COUNT = 6
export const isUndated = config => config?.dateMode === 'undated'
export const monthCount = config => isUndated(config) ? 1 : 12
export const undatedTemplateId = (kind, orientation = 'landscape') => `undated-${kind}-${orientation}`

const kinds = [
  ['cover', 'cover', '만년형 첫 장 표지'],
  ['divider', 'divider', '만년형 월별 구분 페이지'],
  ['monthly', 'monthly', '만년형 월간 달력'],
  ['weekly-blocks', 'weekly', '만년형 주간 계획 · 4열 블록형'],
  ['weekly-journal', 'weekly', '만년형 주간 계획 · 저널형'],
]
export const UNDATED_TEMPLATES = ['landscape', 'portrait'].flatMap(orientation => kinds.map(([kind, type, name]) => ({
  id: undatedTemplateId(kind, orientation), orientation, type, name, templateVersion: '1.0.0', dateMode: 'undated',
})))
