import { Platform } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import { assetBaseUrl, remoteAssetUrl, RemoteAssetError } from './remoteAssets.js'

// 받은 파일은 문서 폴더에 둔다. 캐시 폴더는 OS 가 저장 공간이 부족할 때 지울 수 있다.
// 객체 키(내용 해시 포함)를 그대로 파일 경로로 쓰므로, 에셋이 바뀌면 새 파일로 받고 옛 파일은 쓰지 않는다.
const root = () => new Directory(Paths.document, 'dio-remote-assets')
const target = asset => new File(root(), ...asset.key.split('/'))

const pending = new Map()

async function download(asset) {
  const file = target(asset)
  if (file.exists && file.size === asset.size) return file.uri
  const baseUrl = assetBaseUrl({ os: Platform.OS })
  const url = remoteAssetUrl(asset, baseUrl)
  // 받는 중에 앱이 꺼져도 반쪽 파일이 정상 파일로 남지 않게 임시 이름으로 받은 뒤 검사하고 옮긴다
  const temporary = new File(root(), 'partial', `${asset.sha256}.download`)
  try {
    temporary.parentDirectory.create({ intermediates: true, idempotent: true })
    file.parentDirectory.create({ intermediates: true, idempotent: true })
    const downloaded = await File.downloadFileAsync(url, temporary, { idempotent: true })
    if (downloaded.size !== asset.size) throw new Error(`size ${downloaded.size} != ${asset.size}`)
    const digest = await downloaded.digest('SHA-256')
    if (digest.toLowerCase() !== asset.sha256) throw new Error('sha256 mismatch')
    if (file.exists) file.delete()
    await downloaded.move(file)
    return file.uri
  } catch (error) {
    try { if (temporary.exists) temporary.delete() } catch { /* 다음 시도가 덮어쓴다 */ }
    throw error instanceof RemoteAssetError ? error : new RemoteAssetError('파일을 내려받지 못했어요. 네트워크를 확인해 주세요.', error)
  }
}

/** 원격 텍스트 파일(스티커 팩 JSON 등)을 기기에 받아(크기 · 해시 확인) 읽는다 */
export async function readRemoteText(asset) {
  return new File(await fetchRemoteAsset(asset)).text()
}

/** 원격 에셋을 기기에 받아(이미 있으면 그대로) file:// 주소를 돌려준다. 같은 파일 동시 요청은 하나로 합친다 */
export function fetchRemoteAsset(asset) {
  if (!pending.has(asset.key)) pending.set(asset.key, download(asset).finally(() => pending.delete(asset.key)))
  return pending.get(asset.key)
}
