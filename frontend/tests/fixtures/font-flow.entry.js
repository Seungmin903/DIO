// Isolated UI fixture: deterministic inference lives only in this test entrypoint.
import { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StudioContent } from '../../src/handwriting/HandwritingStudio'
import { createFontWorkflow } from '../../src/handwriting/workflow.js'
import { MODEL_VERSION, PREPROCESS_VERSION, PROMPTS, SAMPLE_TEXT } from '../../src/handwriting/protocol.js'
import { newDraft } from '../../src/handwriting/storage.js'

let sequence = 0, active = null
const jobs = new Map(), fonts = new Map()
const sampleImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><path d="M24 24H90V94H24Z" fill="none" stroke="black" stroke-width="4"/></svg>')
const controller = createFontWorkflow({
  uuid: () => `test-${++sequence}`,
  repository: {
    load: async () => JSON.parse(localStorage.getItem('font-flow-fixture') || '[]'),
    save: async entries => localStorage.setItem('font-flow-fixture', JSON.stringify(entries)), newDraft,
    register: async (_uri, name, job) => { if (!fonts.has(job)) fonts.set(job, { id: `fixture-${job}`, label: name }); return fonts.get(job) },
    renameFont: async () => {}, fontForJob: async id => fonts.get(id),
  },
  engine: {
    capabilities: async () => ({ available: !location.search.includes('unsupported'), reason: 'Android 개발 빌드에서 생성할 수 있어요.', modelVersion: MODEL_VERSION }),
    snapshot: async draft => ({ draft, inputHash: JSON.stringify(draft) }),
    preview: async () => { if (active) throw Error('Inference overlap'); return Object.fromEntries([...SAMPLE_TEXT].filter(c => c !== ' ').map(c => [c, sampleImage])) },
    start: async snapshot => {
      if (active) throw Error('Inference overlap')
      const job = { id: `job-${++sequence}`, inputHash: snapshot.inputHash, draft: snapshot.draft, modelVersion: MODEL_VERSION, preprocessVersion: PREPROCESS_VERSION, state: 'processing', stage: 'generating', completed: 320, total: 11172 }
      active = job.id; jobs.set(job.id, job); return { ...job }
    },
    latest: async () => [...jobs.values()].at(-1) || null, jobDraft: async id => jobs.get(id).draft,
    refresh: async id => ({ ...jobs.get(id) }),
    control: async (action, id) => { const job = jobs.get(id); if (action === 'pause') { active = null; job.state = 'paused' } else if (action === 'cancel') { active = null; job.state = 'cancelled' } else { if (active) throw Error('Inference overlap'); active = id; job.state = 'processing' } return { ...job } },
    wait: async () => {},
  },
})
window.__fontQA = {
  controller,
  fill: async () => {
    const item = controller.getSnapshot().entries.at(-1)
    const sample = { coordinateSize: 1024, strokes: [{ width: 9, points: [{ x: 200, y: 200 }, { x: 700, y: 700 }] }] }
    await controller.saveDraft(item.id, { ...item.draft, samples: Object.fromEntries(PROMPTS.map(c => [c, sample])), updatedAt: 'filled' }, item.name)
  },
  complete: async id => { const item = controller.getSnapshot().entries.find(e => e.id === id); Object.assign(jobs.get(item.jobId), { state: 'ready', stage: 'ready', completed: 11172, fontUri: 'fixture-only.ttf' }); active = null; await controller.tick() },
}
function Fixture() {
  const [ready, setReady] = useState(false)
  useEffect(() => { controller.init().then(() => setReady(true)) }, [])
  return <SafeAreaProvider>{ready && <StudioContent controller={controller} />}</SafeAreaProvider>
}
registerRootComponent(Fixture)
