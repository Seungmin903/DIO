import { AppState } from 'react-native'
import { randomUUID } from 'expo-crypto'
import { createFontWorkflow } from './workflow.js'
import { capabilities, controlJob, createSnapshot, generatePreview, latestJob, nativeGenerator, refreshJob, startJob } from './generator.js'
import { loadFontLibrary, loadWorkflow, newDraft, registerFontFile, renameFont, saveWorkflow } from './storage.js'
import { refreshPersonalFonts } from './library.js'
import { SAMPLE_TEXT } from './protocol.js'

export const fontWorkflow = createFontWorkflow({
  uuid: randomUUID,
  maxGeneratedFonts: 1,
  repository: {
    load: loadWorkflow, save: saveWorkflow, newDraft, register: registerFontFile, renameFont,
    fontForJob: async id => (await loadFontLibrary()).find(font => font.sourceJob === id),
  },
  engine: {
    capabilities, snapshot: createSnapshot, start: startJob, refresh: refreshJob,
    latest: latestJob, control: controlJob, preview: snapshot => generatePreview(snapshot, SAMPLE_TEXT),
    isBusy: async () => Boolean(await nativeGenerator()?.isBusy?.()),
    jobDraft: async id => {
      const native = nativeGenerator()
      if (!native?.getJobDraft) return null
      return JSON.parse(await native.getJobDraft(id))
    },
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
  },
  onFontsChanged: refreshPersonalFonts,
})

let stop
export function initializeFontWorkflow() {
  if (stop) return stop
  let tickPending = false
  const safely = task => task.catch(() => {}) // Error is exposed by the external store.
  safely(fontWorkflow.setForeground(AppState.currentState == null || AppState.currentState === 'active'))
  safely(fontWorkflow.init())
  const timer = setInterval(() => {
    if (AppState.currentState !== 'active' && AppState.currentState != null) return
    if (tickPending) return
    tickPending = true
    safely(fontWorkflow.tick()).finally(() => { tickPending = false })
  }, 1000)
  const listener = AppState.addEventListener('change', next => { safely(fontWorkflow.setForeground(next === 'active')) })
  stop = () => { clearInterval(timer); listener.remove(); stop = null }
  return stop
}
