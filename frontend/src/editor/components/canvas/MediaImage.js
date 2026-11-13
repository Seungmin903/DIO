import { useContext, useEffect, useRef, useState } from 'react'
import { Image, Platform, StyleSheet, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { ViewportMotion } from './viewportMotion'
import { createPhotoDecodeQueue } from '../../utils/photoDecodeQueue.js'

const CONTENT_FIT = { contain: 'contain', stretch: 'fill', cover: 'cover' }
const ZOOM_SETTLE_MS = 160
const DECODE_TIMEOUT_MS = 10000
const enqueuePhotoDecode = createPhotoDecodeQueue()

function ZoomPhoto({ decodeZoom, decodeDistance, style, onLoad, onError, ...props }) {
  const { moving, fitZoom } = useContext(ViewportMotion)
  const distance = useRef(decodeDistance)
  distance.current = decodeDistance
  // Fresco의 다운샘플링은 요청 크기보다 낮은 해상도를 고를 수 있다.
  // 확대 상태에서만 여유를 줘 실제 표시 크기에 필요한 픽셀을 확보한다.
  const zoomed = fitZoom > 0 && decodeZoom > fitZoom * 1.1
  const sizeKey = `${zoomed ? 'detail' : 'fit'}:${Math.round(Math.log(decodeZoom) / Math.log(1.2))}`
  const [shown, setShown] = useState(sizeKey)
  const [pending, setPending] = useState(null)
  const [failed, setFailed] = useState(null)

  // 같은 상태에서 무한 재시도하지 않고, 새 이동·확대 조작 뒤 다시 선명하게 읽을 기회를 준다.
  useEffect(() => { setFailed(null) }, [moving, sizeKey])

  useEffect(() => {
    if (moving || shown === sizeKey || failed === sizeKey) return
    let cancelQueued, timeout
    const timer = setTimeout(() => {
      cancelQueued = enqueuePhotoDecode(() => {
        setPending(sizeKey)
        timeout = setTimeout(() => {
          setPending(null)
          setFailed(sizeKey)
        }, DECODE_TIMEOUT_MS)
      }, distance.current)
    }, ZOOM_SETTLE_MS)
    return () => {
      clearTimeout(timer)
      clearTimeout(timeout)
      cancelQueued?.()
      if (cancelQueued) setPending(current => current === sizeKey ? null : current)
    }
  }, [moving, shown, sizeKey, failed])

  const keys = !moving && pending !== null && pending !== shown && pending === sizeKey ? [shown, pending] : [shown]
  return <View style={style}>
    {keys.map(key => {
      const loading = key !== shown
      return <Image key={key} {...props} fadeDuration={0} resizeMethod="resize"
        resizeMultiplier={key.startsWith('detail:') ? 1.5 : 1}
        style={[StyleSheet.absoluteFill, loading && { opacity: 0 }]}
        onLoad={event => {
          if (loading) {
            setShown(key)
            setPending(null)
          }
          onLoad?.(event)
        }}
        onError={event => {
          if (loading) {
            setPending(null)
            setFailed(key)
          }
          else onError?.(event)
        }} />
    })}
  </View>
}

/**
 * 캔버스의 사진·스티커 그림. 움직이는 GIF(animated)만 expo-image 로 그린다.
 * RN Image(Android Fresco)는 GIF 장면을 원본 크기 그대로 풀어 큰 GIF 하나에 수백 MB 를 쓰는데,
 * expo-image 는 화면에 그려지는 크기로 줄여 풀어 메모리와 장면마다 그리는 일이 크게 준다.
 * 정지 사진은 RN Image 그대로 둔다 (resizeMethod="scale" 로 확대해도 선명하게 그리는 설정을 쓴다).
 * 받는 값은 RN Image 와 같다: source, style(tintColor 포함), resizeMode, onLoad, onError
 * Android RN Image 는 불러온 뒤 0.3초 동안 서서히 나타나서(fadeDuration), 다 불러오자마자 찍는 내보내기에
 * 반투명하게 찍혔다. 페이드는 끈다 (iOS·웹은 원래 페이드가 없다).
 */
export default function MediaImage({ animated = false, resizeMode = 'cover', resizeMethod, thumbnail = false, decodeZoom, decodeDistance, style, ...props }) {
  const resizeThumbnail = thumbnail && !animated
  if (resizeThumbnail && Platform.OS === 'ios') {
    return <ExpoImage contentFit={CONTENT_FIT[resizeMode] ?? 'cover'} enforceEarlyResizing cachePolicy="disk" transition={0} style={style} {...props} />
  }
  if (!animated) {
    const method = resizeThumbnail && Platform.OS === 'android' ? 'resize' : resizeMethod
    // Android의 단일 URI 이미지는 뷰 크기만 바뀌면 다시 읽지 않는다.
    // 배율이 충분히 달라지면 현재 표시 크기로 새 디코딩을 요청한다.
    if (method === 'resize' && decodeZoom > 0 && props.source?.uri) {
      return <ZoomPhoto key={props.source.uri} decodeZoom={decodeZoom} decodeDistance={decodeDistance} resizeMode={resizeMode} style={style} {...props} />
    }
    return <Image fadeDuration={0} resizeMode={resizeMode} resizeMethod={method} style={style} {...props} />
  }
  const { tintColor, ...rest } = StyleSheet.flatten(style) ?? {}
  return <ExpoImage contentFit={CONTENT_FIT[resizeMode] ?? 'cover'} tintColor={tintColor} transition={0} autoplay style={rest} {...props} />
}
