import { memo, useLayoutEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import ObjectContent from './ObjectView'
import { acknowledgeStrokeDisplay } from '../../utils/strokeDisplayHandoff.js'

// 원본 좌표·회전·요소별 불투명도를 표시하는 공통 래퍼. 캐시는 이 결과만 재사용한다.
export default memo(function PageObject({ object, zoom, opacity, still, areaPreview = false, crop = false, originX = 0, originY = 0 }) {
  useLayoutEffect(() => {
    if (object.type === 'stroke') acknowledgeStrokeDisplay(object.id)
  }, [object])
  return <View
    dataSet={Platform.OS === 'web' && object.type === 'stroke' ? { completedStrokeId: object.id, inkQuality: areaPreview && ['fountain', 'brush'].includes(object.penKind) && [2, 3].includes(object.renderVersion) ? 'temporary' : 'precise' } : undefined}
    needsOffscreenAlphaCompositing={opacity < 1}
    renderToHardwareTextureAndroid={opacity < 1}
    style={{ position: 'absolute', left: (object.x - originX) * zoom, top: (object.y - originY) * zoom,
      width: object.w * zoom, height: object.h * zoom, transform: [{ rotate: `${object.rotation}deg` }], opacity }}>
    <ObjectContent areaPreview={areaPreview} object={object} zoom={zoom} still={still} />
    {crop && <View style={[styles.cropRing, { margin: -Math.min(6, Math.max(1, 12 * zoom)) }]} />}
  </View>
})

const styles = StyleSheet.create({ cropRing: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: colors.primary, borderRadius: 6 } })
