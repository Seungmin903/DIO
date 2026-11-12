import { useEffect, useState } from 'react'
import { fetchRemoteAsset } from './remoteAssetFile'

// 원격 파일(원격 PNG 스티커 등)의 그릴 주소. 네이티브는 기기에 받은 file://, 웹은 CloudFront 주소.
// 한 번 얻은 주소는 기억해 두어 다시 그릴 때 바로 쓴다(깜빡이지 않게). 받지 못하면 null 이고 다음에 다시 그리면 다시 받는다.
const resolved = new Map()

export const peekRemoteAssetUri = asset => (asset?.key ? resolved.get(asset.key) ?? null : null)

export function resolveRemoteAssetUri(asset) {
  return fetchRemoteAsset(asset).then(uri => { resolved.set(asset.key, uri); return uri })
}

/**
 * asset: remoteCatalog.js 의 원격 파일({ key, size, sha256 }) 또는 null. 주소가 없으면 null.
 * onError: 받지 못했을 때 한 번 부른다(내보내기가 그림을 기다리다 멈추지 않게 오류로 알린다)
 */
export function useRemoteAssetUri(asset, onError) {
  const key = asset?.key ?? null
  const [uri, setUri] = useState(() => peekRemoteAssetUri(asset))
  useEffect(() => {
    if (!key) { setUri(null); return undefined }
    const known = resolved.get(key)
    if (known) { setUri(known); return undefined }
    let active = true
    resolveRemoteAssetUri(asset).then(value => { if (active) setUri(value) }, () => { if (active) { setUri(null); onError?.() } })
    return () => { active = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return key ? uri : null
}
