import { useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { mediaService } from '../services/mediaStore'
import { exportImage, readLegacyExportImage } from '../utils/exportImage'
import { mediaId } from '../utils/mediaReferences.js'
import { useMediaEntry } from './useMediaUri'
import { svgStillKey } from '../utils/svgImageSource.js'
import { createStillCache } from '../utils/svgStillCache.js'

// 첫 장면 PNG 의 긴 변 상한. 태블릿에서 모양 틀 사진을 화면 가득 키워도(약 2,000px) 흐려지지 않을 만큼
const STILL_SIZE = { width: 2048, height: 2048 }

const stills = createStillCache({
  async make({ id, uri }) {
    if (id) {
      const { blob, media } = await mediaService.get(id)
      return exportImage({ blob, media, size: STILL_SIZE })
    }
    const input = await readLegacyExportImage(uri)
    try { return await exportImage({ blob: input.blob, size: STILL_SIZE }) } finally { input.dispose?.() }
  },
  // exportImage 가 만든 캐시 PNG 파일을 지운다
  dispose: (resource) => resource.dispose?.(),
})

/**
 * react-native-svg 의 <Image> 에 넘길 주소. 기기(Android)의 SVG 이미지는 움직이는 GIF 를 받으면 비트맵이 비어(null)
 * 앱이 그대로 죽는다(com.horcrux.svg.ImageView NullPointerException). 그래서 기기에서는 GIF 대신 첫 장면 PNG 를 만들어 넘기고,
 * 만드는 동안이나 실패하면 주소를 넘기지 않는다(안 보이는 편이 앱이 죽는 것보다 낫다). SVG 이미지는 원래 움직이지 않아
 * 보이는 모습은 같다.
 * item: uri 를 얻은 항목(useMediaUri 에 넘긴 것과 같은 것: still 이면 poster), uri: useMediaUri 결과,
 * enabled: 실제로 SVG 이미지로 그릴 때만 true (아니면 변환하지 않는다)
 * 반환 { uri, failed }: 첫 장면을 만들지 못했으면 failed 는 그 항목의 키(문자열), 아니면 false.
 * 호출한 쪽은 failed 가 바뀔 때마다 오류를 알린다(실패한 A 에서 실패한 B 로 바뀌어도 B 를 따로 알릴 수 있게 키를 준다)
 */
export function useSvgImageUri(item, uri, { enabled = true } = {}) {
  const id = mediaId(item)
  const entry = useMediaEntry(id)
  const key = svgStillKey({ platform: Platform.OS, enabled, uri, id, extension: entry?.media?.extension })
  useEffect(() => (key ? stills.retain(key, { id, uri }) : undefined), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const snapshot = useSyncExternalStore(stills.subscribe, () => (key ? stills.get(key) : undefined), () => undefined)
  if (!key) return { uri, failed: false }
  return { uri: snapshot?.status === 'ready' ? snapshot.uri : null, failed: snapshot?.status === 'failed' ? key : false }
}
