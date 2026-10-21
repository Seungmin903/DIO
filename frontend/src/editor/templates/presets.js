import { annualPageIds, getTemplate, templateIdForOrientation } from './catalog.js'
import { defaultTemplateConfig, normalizeTemplateConfig, templatePageCount } from './creation.js'

export const DIARY_PRESETS = [
  { id: 'schedule', name: '일정 관리용', description: '한 달의 일정과 이번 주 할 일을 정리해요.', recommended: true,
    previewId: '2026-monthly-01-landscape' },
  { id: 'journal', name: '일기용', description: '일정과 하루의 이야기를 함께 기록해요.',
    previewId: '2026-reusable-diary-landscape' },
  { id: 'free', name: '자유 기록용', description: '메모와 아이디어를 자유롭게 남겨요.',
    previewId: '2026-reusable-note-ruled-landscape' },
]

// 기존 기본 장수(매월 각 1장)와 연간 생성기를 그대로 사용한다.
export function presetTemplateConfig(id, orientation = 'landscape') {
  if (!DIARY_PRESETS.some(preset => preset.id === id)) throw new Error('추천 내지 구성을 다시 골라 주세요.')
  const config = defaultTemplateConfig(orientation)
  return { ...config, monthly: id !== 'free', weekly: id === 'schedule', daily: id === 'journal',
    dailyTemplates: config.dailyTemplates.map(item => ({ ...item, enabled: id === 'journal' ? getTemplate(item.assetId).type === 'diary' : item.enabled })),
    reusable: config.reusable.map(item => ({ ...item, enabled: id === 'free' && ['ruled', 'grid', 'plain'].some(kind => item.assetId.includes(`note-${kind}-`)) })),
  }
}

export const presetPreviewId = (preset, orientation) => templateIdForOrientation(preset.previewId, orientation)

// 요약과 실제 문서는 같은 정규화·연간 목록·장수 규칙을 따른다.
export function templateComposition(input) {
  const config = normalizeTemplateConfig(input)
  const annual = annualPageIds(config.orientation).map(id => getTemplate(id))
  const sections = []
  const addAnnual = (enabled, type, label) => {
    if (enabled) sections.push({ label, count: annual.filter(asset => asset.type === type).length, perMonth: null })
  }
  addAnnual(config.cover, 'cover', '첫 장 표지')
  addAnnual(config.dividers, 'divider', '월별 구분 페이지')
  addAnnual(config.monthly, 'monthly', '월간 달력')
  addAnnual(config.weekly, 'weekly', '주간 계획')
  const addChoices = (choices, monthly) => {
    for (const choice of choices) if (choice.enabled) sections.push({ label: getTemplate(choice.assetId).name,
      count: choice.count * (monthly ? 12 : 1), perMonth: monthly ? choice.count : null })
  }
  if (config.daily) addChoices(config.dailyTemplates, true)
  addChoices(config.reusable, true)
  addChoices(config.legacyEndPages, false)
  if (!sections.length) sections.push({ label: '빈 페이지', count: 1, perMonth: null })
  return { sections, total: templatePageCount(config), perMonth: sections.reduce((sum, item) => sum + (item.perMonth ?? 0), 0) }
}
