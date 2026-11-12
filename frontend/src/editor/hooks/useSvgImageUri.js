import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { mediaService } from '../services/mediaStore'
import { exportImage, readLegacyExportImage } from '../utils/exportImage'
import { mediaId } from '../utils/mediaReferences.js'
import { useMediaEntry } from './useMediaUri'
import { isGifUri } from '../utils/svgImageSource.js'

// 첫 장면 PNG 는 긴 변을 이 크기까지만 만든다 (테이프·모양 틀 사진은 화면에서 이보다 크게 그릴 일이 거의 없다)
const STILL_SIZE = { width: 2048, height: 2048 }
const stills = new Map() // 원본 키 → 첫 장면 PNG 주소 (앱이 도는 동안 한 번만 만든다)
const pending = new Map()

function makeStill(key, id, uri) {
  if (!pending.has(key)) {
    const task = (async () => {
      if (id) {
        const { blob, media } = await mediaService.get(id)
        return (await exportImage({ blob, media, size: STILL_SIZE })).uri
      }
      const input = await readLegacyExportImage(uri)
      try { return (await exportImage({ blob: input.blob, size: STILL_SIZE })).uri } finally { input.dispose?.() }
    })()
    pending.set(key, task.then((still) => { stills.set(key, still); return still }).finally(() => pending.delete(key)))
  }
  return pending.get(key)
}

/**
 * react-native-svg 의 <Image> 에 넘길 주소. 기기(Android)의 SVG 이미지는 움직이는 GIF 를 받으면 비트맵이 비어(null)
 * 앱이 그대로 죽는다(com.horcrux.svg.ImageView NullPointerException). 그래서 기기에서는 GIF 대신 첫 장면 PNG 를 만들어 넘기고,
 * 만드는 동안이나 실패하면 아무것도 넘기지 않는다(안 보이는 편이 앱이 죽는 것보다 낫다). SVG 이미지는 원래 움직이지 않아
 * 보이는 모습은 같다. 웹 브라우저는 GIF 를 잘 그려서 그대로 둔다.
 * item: 주소를 얻은 요소(또는 poster), uri: useMediaUri 로 얻은 주소
 */
export function useSvgImageUri(item, uri) {
  const id = mediaId(item)
  const entry = useMediaEntry(id)
  const gif = Platform.OS !== 'web' && Boolean(uri) && (id ? entry?.media?.extension === 'gif' : isGifUri(uri))
  const key = gif ? (id ? `media:${id}` : uri) : null
  const [made, setMade] = useState(null)
  useEffect(() => {
    if (!key || stills.has(key)) return undefined
    let alive = true
    makeStill(key, id, uri).then((still) => { if (alive) setMade({ key, still }) }).catch(() => {})
    return () => { alive = false }
  }, [key, id, uri])
  if (!gif) return uri
  return stills.get(key) ?? (made?.key === key ? made.still : null)
}
