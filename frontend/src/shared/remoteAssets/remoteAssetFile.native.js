import { Platform } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import { assetBaseUrl, remoteAssetUrl, RemoteAssetError } from './remoteAssets.js'

// 받은 파일은 문서 폴더에 둔다. 캐시 폴더는 OS 가 저장 공간이 부족할 때 지울 수 있다.
// 객체 키(내용 해시 포함)를 그대로 파일 경로로 쓰므로, 에셋이 바뀌면 새 파일로 받고 옛 파일은 쓰지 않는다.
const root = () => new Directory(Paths.document, 'dio-remote-assets')
const target = asset => new File(root(), ...asset.key.split('/'))

const pending = new Map()

// 받는 중인 파일의 받은 바이트(객체 키 → 바이트). 글꼴 목록의 진행 막대가 읽는다. 1% 단위로 바뀔 때만 알린다
const progress = new Map()
const progressListeners = new Set()
/** 받는 중 진행 변화를 구독한다. 돌려준 함수로 끊는다 */
export const subscribeRemoteAssetProgress = listener => { progressListeners.add(listener); return () => progressListeners.delete(listener) }
/** 받는 중인 파일의 받은 바이트. 받는 중이 아니면 undefined */
export const remoteAssetProgress = asset => progress.get(asset.key)
function reportProgress(asset, written) {
  const step = Math.max(1, Math.floor(asset.size / 100))
  const before = progress.get(asset.key)
  if (before !== undefined && Math.floor(before / step) === Math.floor(written / step)) return
  progress.set(asset.key, written)
  progressListeners.forEach(listener => listener())
}

async function download(asset) {
  const file = target(asset)
  if (file.exists && file.size === asset.size) { savedCache.set(asset.key, true); return file.uri }
  const baseUrl = assetBaseUrl({ os: Platform.OS })
  const url = remoteAssetUrl(asset, baseUrl)
  // 받는 중에 앱이 꺼져도 반쪽 파일이 정상 파일로 남지 않게 임시 이름으로 받은 뒤 검사하고 옮긴다
  const temporary = new File(root(), 'partial', `${asset.sha256}.download`)
  try {
    temporary.parentDirectory.create({ intermediates: true, idempotent: true })
    file.parentDirectory.create({ intermediates: true, idempotent: true })
    reportProgress(asset, 0)
    const downloaded = await File.downloadFileAsync(url, temporary, { idempotent: true, onProgress: ({ bytesWritten }) => reportProgress(asset, Math.min(asset.size, bytesWritten)) })
    if (downloaded.size !== asset.size) throw new Error(`size ${downloaded.size} != ${asset.size}`)
    const digest = await downloaded.digest('SHA-256')
    if (digest.toLowerCase() !== asset.sha256) throw new Error('sha256 mismatch')
    if (file.exists) file.delete()
    await downloaded.move(file)
    savedCache.set(asset.key, true)
    return file.uri
  } catch (error) {
    try { if (temporary.exists) temporary.delete() } catch { /* 다음 시도가 덮어쓴다 */ }
    throw error instanceof RemoteAssetError ? error : new RemoteAssetError('파일을 내려받지 못했어요. 네트워크를 확인해 주세요.', error)
  } finally {
    if (progress.delete(asset.key)) progressListeners.forEach(listener => listener())
  }
}

// 받아 둔 파일인지 키별로 한 번만 파일 시스템에 묻는다. 글꼴 목록은 항목마다 · 진행이 바뀔 때마다 다시 그려져
// 그때마다 동기 파일 접근(exists · size)을 하면 받는 중 스크롤이 끊길 수 있다.
// 이 모듈만 파일을 받아 저장(download)하므로 받기를 마치면 여기서 true 로 바꾼다. 문서 폴더는 OS 가 지우지 않는다.
const savedCache = new Map()

/** 이미 기기에 받아 둔 파일인가(다시 받지 않고 바로 쓸 수 있다) */
export function isRemoteAssetSaved(asset) {
  if (!savedCache.has(asset.key)) {
    let saved = false
    try { const file = target(asset); saved = file.exists && file.size === asset.size } catch { /* 모르면 받지 않은 것으로 본다 */ }
    savedCache.set(asset.key, saved)
  }
  return savedCache.get(asset.key)
}

/** 원격 텍스트 파일(스티커 팩 JSON 등)을 기기에 받아(크기 · 해시 확인) 읽는다 */
export async function readRemoteText(asset) {
  return new File(await fetchRemoteAsset(asset)).text()
}

/** 네이티브는 받은 파일이 문서 폴더에 남으므로 따로 기억하지 않는다(웹과 같은 이름) */
export function markRemoteAssetSaved() {}

/** 웹 전용(받지 못한 @font-face 규칙 지우기). 네이티브는 다시 등록하면 새로 읽는다 */
export function discardFailedFontFace() {}

/** 불러오지 못한 파일: 받아 둔 파일인지 다음에 파일 시스템에 다시 묻는다(웹과 같은 이름) */
export function forgetRemoteAssetSaved(asset) { savedCache.delete(asset.key) }

/** 원격 에셋을 기기에 받아(이미 있으면 그대로) file:// 주소를 돌려준다. 같은 파일 동시 요청은 하나로 합친다 */
export function fetchRemoteAsset(asset) {
  if (!pending.has(asset.key)) pending.set(asset.key, download(asset).finally(() => pending.delete(asset.key)))
  return pending.get(asset.key)
}
