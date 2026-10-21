import { Image, StyleSheet } from 'react-native'
import { Image as ExpoImage } from 'expo-image'

const CONTENT_FIT = { contain: 'contain', stretch: 'fill', cover: 'cover' }

/**
 * 캔버스의 사진·스티커 그림. 움직이는 GIF(animated)만 expo-image 로 그린다.
 * RN Image(Android Fresco)는 GIF 장면을 원본 크기 그대로 풀어 큰 GIF 하나에 수백 MB 를 쓰는데,
 * expo-image 는 화면에 그려지는 크기로 줄여 풀어 메모리와 장면마다 그리는 일이 크게 준다.
 * 정지 사진은 RN Image 그대로 둔다 (resizeMethod="scale" 로 확대해도 선명하게 그리는 설정을 쓴다).
 * 받는 값은 RN Image 와 같다: source, style(tintColor 포함), resizeMode, onLoad, onError
 */
export default function MediaImage({ animated = false, resizeMode = 'cover', resizeMethod, style, ...props }) {
  if (!animated) return <Image resizeMode={resizeMode} resizeMethod={resizeMethod} style={style} {...props} />
  const { tintColor, ...rest } = StyleSheet.flatten(style) ?? {}
  return <ExpoImage contentFit={CONTENT_FIT[resizeMode] ?? 'cover'} tintColor={tintColor} transition={0} autoplay style={rest} {...props} />
}
