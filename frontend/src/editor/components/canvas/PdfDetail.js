import { memo, useContext, useEffect, useRef, useState } from 'react'
import { PixelRatio } from 'react-native'
import MediaImage from './MediaImage'
import { ViewportMotion } from './viewportMotion'
import { DETAIL_SETTLE_MS, normalizePdfSource, planPdfDetail } from '../../../diary/utils/pdfSource.js'
import { canFetchPdfSource, fetchPdfSource } from '../../services/pdfSourceRemote.js'
import { releasePdfRegion, renderPdfRegion } from '../../../diary/utils/pdfRegion'

/**
 * PDF 쪽을 크게 확대했을 때, 지금 보이는 영역만 보관한 원본 PDF 에서 다시 그려 기본 그림 위에 얹는다.
 * - 기본 그림(3000px)은 그대로 두고, 선명한 조각은 그 위에 별도 층으로 얹는다. 로딩 표시 · 페이드는 없다.
 * - 확대 · 이동하는 동안에는 그리지 않고, 멈추고 DETAIL_SETTLE_MS 뒤에 그린다. 새 조각이 다 뜬 뒤에야 이전 조각을 치운다.
 * - 보이는 곳이 조각 가장자리에 다가오거나 더 확대하면 새로 그린다. 기본 그림을 많이 줄여 보는 화면(쪽 전체 보기)에서도
 *   얇은 선이 뭉개지지 않게 그 화면 해상도로 그린다. 기본 그림으로 충분한 배율에서는 조각을 비운다.
 * - 편집 화면에서만 ViewportMotion.visible 이 있어서, 썸네일 · 내보내기에서는 아무것도 그리지 않는다.
 * 원본이 없거나 이 빌드에 영역 그리기가 없으면(옛 개발 빌드) 조용히 기본 그림만 쓴다.
 * 공유 다이어리에서 이 기기에 원본이 없고 서버에 올라와 있으면(pdfSource.mediaFileId) 한 번 받아 둔 뒤 다시 그린다.
 */
function PdfDetail({ object, zoom }) {
  const { moving, visible } = useContext(ViewportMotion)
  const [layers, setLayers] = useState([])
  const layersRef = useRef(layers)
  layersRef.current = layers
  const job = useRef(0)
  const unavailable = useRef(false)
  const alive = useRef(true)
  const [fetched, setFetched] = useState(0)
  // 서버에서 온 값이므로 파일 이름으로 쓰는 sourceId 는 모양을 확인한 값만 쓴다.
  const source = normalizePdfSource(object.pdfSource)
  const remoteId = object.pdfSource?.mediaFileId
  const key = visible ? [visible.x, visible.y, visible.width, visible.height].map(value => Math.round(value * 2)).join(',') : ''

  const drop = uris => uris.forEach(uri => releasePdfRegion(uri))
  useEffect(() => () => { alive.current = false; job.current += 1; drop(layersRef.current.map(layer => layer.uri)) }, [])

  useEffect(() => {
    if (moving || !visible || unavailable.current) return undefined
    const latest = layersRef.current[layersRef.current.length - 1]
    const plan = planPdfDetail({ object, visible, zoom, pixelRatio: PixelRatio.get(), current: latest?.loaded ? latest : null })
    if (!plan) {
      job.current += 1
      if (layersRef.current.length) { drop(layersRef.current.map(layer => layer.uri)); setLayers([]) }
      return undefined
    }
    if (plan.keep) return undefined
    // 처음 그릴 때는 바로, 이미 얹은 조각을 바꿀 때는 움직임이 멈추고 잠깐 뒤에 그린다.
    const timer = setTimeout(() => {
      const id = job.current += 1
      renderPdfRegion({ sourceId: source.sourceId, pageIndex: source.pageIndex, rect: plan.rect, outWidth: plan.outWidth, outHeight: plan.outHeight })
        .then(({ uri }) => {
          if (id !== job.current) { releasePdfRegion(uri); return }
          setLayers(prev => [...prev, { uri, rect: plan.rect, density: plan.density, loaded: false }])
        })
        .catch(error => {
          if (id !== job.current) return
          unavailable.current = true
          if (error?.message !== 'PDF_SOURCE_MISSING') return
          const remote = { sourceId: source.sourceId, mediaFileId: remoteId }
          if (!canFetchPdfSource(remote)) return
          fetchPdfSource(remote).then(() => { if (alive.current) { unavailable.current = false; setFetched(count => count + 1) } }).catch(() => {})
        })
    }, layersRef.current.length ? DETAIL_SETTLE_MS : 0)
    return () => clearTimeout(timer)
    // visible 은 key 로 반올림해 비교한다(픽셀 단위 흔들림으로 다시 그리지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, key, zoom, object.x, object.y, object.w, object.h, source?.sourceId, source?.pageIndex, fetched])

  // 새 조각이 다 뜨면 그 아래 이전 조각을 치운다.
  const loaded = uri => setLayers(prev => {
    const index = prev.findIndex(layer => layer.uri === uri)
    if (index < 0) return prev
    drop(prev.slice(0, index).map(layer => layer.uri))
    return [{ ...prev[index], loaded: true }, ...prev.slice(index + 1)]
  })

  if (!visible || !layers.length) return null
  return layers.map(layer => (
    <MediaImage key={layer.uri} source={{ uri: layer.uri }} resizeMode="stretch" resizeMethod="scale" onLoad={() => loaded(layer.uri)}
      style={{ position: 'absolute', left: layer.rect.x * object.w * zoom, top: layer.rect.y * object.h * zoom,
        width: layer.rect.width * object.w * zoom, height: layer.rect.height * object.h * zoom }} />
  ))
}

export default memo(PdfDetail)
