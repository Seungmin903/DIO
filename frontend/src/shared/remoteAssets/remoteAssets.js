import { REMOTE_ASSET_MANIFEST } from './manifest.js'
import { isSecureApiBaseUrl } from '../apiBaseUrlPolicy.js'

// 앱 번들에서 뺀 에셋(글꼴 일부 · 2026 속지)은 에셋 저장소(S3 + CloudFront)에서 처음 쓸 때 내려받는다.
// 목록과 해시는 scripts/build-remote-assets.mjs 가 만든 manifest.js 에 있고, 앱과 함께 배포된다.
// 객체 키에 내용 해시가 들어 있어 한 번 받은 파일은 다시 확인하지 않고 계속 쓴다.

export class RemoteAssetError extends Error {
  constructor(message, cause) { super(message); this.name = 'RemoteAssetError'; this.code = 'REMOTE_ASSET_UNAVAILABLE'; this.cause = cause }
}

/** assets/ 기준 경로의 원격 에셋 표시. require() 대신 이 값을 쓰면 번들에 들어가지 않는다 */
export function remoteAsset(path) {
  const entry = REMOTE_ASSET_MANIFEST[path]
  if (!entry) throw new Error(`원격 에셋 매니페스트에 없는 파일: ${path} (pnpm assets:remote 로 다시 만드세요)`)
  return { remote: true, path, ...entry }
}

export const isRemoteAsset = value => value?.remote === true && typeof value.key === 'string'

/**
 * 에셋 저장소 주소. 출시 빌드·웹 배포본은 EXPO_PUBLIC_ASSET_BASE_URL 에 HTTPS 주소(CloudFront)를 넣는다.
 * 개발 중에 비어 있으면 pnpm assets:serve 로 띄운 로컬 서버(8090)를 쓴다. Android 에뮬레이터는 10.0.2.2 로 PC 에 닿는다.
 */
export function assetBaseUrl({ configured = process.env.EXPO_PUBLIC_ASSET_BASE_URL, dev = globalThis.__DEV__ === true, os, hostname = globalThis.location?.hostname } = {}) {
  const value = typeof configured === 'string' ? configured.trim() : ''
  if (value) {
    if (!dev && !isSecureApiBaseUrl(value)) return null
    return value.replace(/\/+$/, '')
  }
  if (!dev) return null
  return `http://${os === 'android' ? '10.0.2.2' : (hostname || 'localhost')}:8090`
}

export function remoteAssetUrl(asset, baseUrl) {
  if (!baseUrl) throw new RemoteAssetError('에셋 저장소 주소가 설정되지 않았어요.')
  return `${baseUrl}/${asset.key.split('/').map(encodeURIComponent).join('/')}`
}
