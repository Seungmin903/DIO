import { defaultTemplateConfig } from '../../editor/templates/creation.js'
import { normalizeOrientation, templateIdForOrientation } from '../../editor/templates/catalog.js'
import { presetTemplateConfig } from '../../editor/templates/presets.js'

export function initialCreationFlow(orientation) {
  const direction = normalizeOrientation(orientation)
  return { step: 'cover', orientation: direction, dateMode: 'dated', preset: 'schedule', custom: defaultTemplateConfig(direction),
    customStarted: false, colorReturn: 'recommend' }
}

export function activeCreationConfig(state) {
  return state.step === 'custom' || state.step === 'colors' && state.colorReturn === 'custom'
    ? state.custom : presetTemplateConfig(state.preset, state.orientation, state.dateMode)
}

export function creationFlowReducer(state, action) {
  switch (action.type) {
    case 'next': return { ...state, step: 'recommend' }
    case 'preset': return { ...state, preset: action.id }
    case 'custom': return { ...state, step: 'custom', customStarted: true,
      custom: state.customStarted ? state.custom : presetTemplateConfig(state.preset, state.orientation, state.dateMode) }
    case 'dateMode': return { ...state, dateMode: action.value, custom: { ...state.custom, dateMode: action.value } }
    case 'configure': return { ...state, custom: action.value }
    case 'colors': return { ...state, colorReturn: state.step, step: 'colors' }
    case 'back': return { ...state, step: state.step === 'colors' ? state.colorReturn : state.step === 'custom' ? 'recommend' : 'cover' }
    case 'orientation': {
      const orientation = normalizeOrientation(action.value)
      const custom = { ...state.custom, orientation }
      for (const key of ['dailyTemplates', 'reusable', 'legacyEndPages']) custom[key] = custom[key].map(item => ({ ...item, assetId: templateIdForOrientation(item.assetId, orientation) }))
      return { ...state, orientation, custom }
    }
    default: return state
  }
}
