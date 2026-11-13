import { Fragment, memo, useLayoutEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import ObjectContent, { flipTransform } from './ObjectView'
import StrokeContent from '../StrokeContent'
import { acknowledgeStrokeDisplay } from '../../utils/strokeDisplayHandoff.js'
import { KeepFont } from '../../../shared/fontScope'

// 페이지 요소(사용자 글자 · 특수 속지 위젯 · 스티커)는 정해진 글꼴을 그대로 쓴다(앱 UI 글꼴 Pretendard 를 넣지 않는다). 가짜 모듈인 테스트에서는 Fragment
const Keep = KeepFont ?? Fragment

// 원본 좌표·회전·요소별 불투명도를 표시하는 공통 래퍼. 캐시는 이 결과만 재사용한다.
export default memo(function PageObject({ object, zoom, opacity, still, thumbnail = false, areaPreview = false, crop = false, originX = 0, originY = 0, linesOnly = false }) {
  useLayoutEffect(() => {
    if (object.type === 'stroke') acknowledgeStrokeDisplay(object.id)
  }, [object])
  return <View
    pointerEvents={linesOnly ? 'none' : undefined}
    dataSet={Platform.OS === 'web' && object.type === 'stroke' ? { completedStrokeId: object.id, inkQuality: areaPreview && ['fountain', 'brush'].includes(object.penKind) && [2, 3].includes(object.renderVersion) ? 'temporary' : 'precise' } : undefined}
    needsOffscreenAlphaCompositing={opacity < 1}
    renderToHardwareTextureAndroid={opacity < 1}
    style={{ position: 'absolute', left: (object.x - originX) * zoom, top: (object.y - originY) * zoom,
      width: object.w * zoom, height: object.h * zoom, transform: [{ rotate: `${object.rotation}deg` }], opacity }}>
    <Keep>{object.type === 'stroke'
      ? <StrokeContent areaPreview={areaPreview} object={object} zoom={zoom} transform={flipTransform(object)} />
      : <ObjectContent areaPreview={areaPreview} object={object} zoom={zoom} still={still} thumbnail={thumbnail} linesOnly={linesOnly} />}</Keep>
    {crop && <View style={[styles.cropRing, { margin: -Math.min(6, Math.max(1, 12 * zoom)) }]} />}
  </View>
})

const styles = StyleSheet.create({ cropRing: { ...StyleSheet.absoluteFill, borderWidth: 3, borderColor: colors.primary, borderRadius: 6 } })
