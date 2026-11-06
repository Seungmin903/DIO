import { AppState, Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import { digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto'
import { MODEL_VERSION, PREPROCESS_VERSION, PROMPTS, prepareSample, validateDraft } from './protocol.js'
import { saveLastJob } from './storage.js'

let module, lifecycle, activeId
export function nativeGenerator() {
  if (module === undefined) module = ['android', 'ios'].includes(Platform.OS) ? requireOptionalNativeModule('DioHandwriting') : null
  return module
}
export async function capabilities() {
  const native = nativeGenerator()
  const support = native && (!native.isBusy || !native.getJobDraft)
    ? { available: false, reason: '폰트 작업 관리를 사용하려면 최신 앱 빌드로 업데이트해 주세요.' }
    : native ? await native.capabilities() : { available: false, reason: '폰트 생성에는 모델이 포함된 Android 또는 iOS 앱 빌드가 필요해요.' }
  // Development-only diagnosis: versions/support only; never handwriting or user data.
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[DIO_FONT_SUPPORT]', JSON.stringify(support))
  return support
}

export async function createSnapshot(draft, onProgress = () => {}) {
  validateDraft(draft, true)
  const inputs = []
  for (const character of PROMPTS) {
    let prepared
    try { prepared = prepareSample(draft.samples[character]) }
    catch (error) { throw new Error(`${character} 글자: ${error.message}`) }
    inputs.push({ character, pixels: Array.from(prepared.pixels), metadata: prepared.metadata })
    onProgress(inputs.length)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  const body = { modelVersion: MODEL_VERSION, preprocessVersion: PREPROCESS_VERSION, draft: JSON.parse(JSON.stringify(draft)), inputs }
  const inputHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(body))
  return { ...body, inputHash }
}
function requireGenerator() { const native = nativeGenerator(); if (!native) throw new Error('폰트 생성에는 모델이 포함된 앱 빌드가 필요해요.'); return native }
export function initializeGeneratorLifecycle() {
  if (lifecycle) return
  lifecycle = AppState.addEventListener('change', next => { if (next !== 'active' && activeId) nativeGenerator()?.pauseJob(activeId).catch(() => {}) })
}
export async function startJob(snapshot) {
  const result = JSON.parse(await requireGenerator().createJob(JSON.stringify(snapshot)))
  activeId = result.id; await saveLastJob(result).catch(() => {}); return result
}
export async function latestJob() { const raw = await requireGenerator().latestJob(); return raw ? refreshJob(JSON.parse(raw).id) : null }
export async function refreshJob(id) { const job = JSON.parse(await requireGenerator().getJob(id)); activeId = job.state === 'processing' ? id : null; await saveLastJob(job).catch(() => {}); return job }
export async function controlJob(action, id) { const job = JSON.parse(await requireGenerator()[`${action}Job`](id)); if (action === 'resume') activeId = id; await saveLastJob(job); return job }
export async function generatePreview(snapshot, text) { return JSON.parse(await requireGenerator().preview(JSON.stringify(snapshot), text)) }
