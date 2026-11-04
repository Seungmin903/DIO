import { memo, useContext, useLayoutEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { pageSize } from '../../utils/pageGeometry.js'
import PageBackground from '../PageBackground'
import { objectDrawOpacity, TextMeasure, TextMeasureReady } from './ObjectView'
import PageObject from './PageObject'
import CompletedStrokeLayer from './CompletedStrokeLayer'
import WebStrokeCache from './WebStrokeCache'
import { WebStrokeCacheEnabled } from './WebStrokeCacheContext'
import { ViewportMotion } from './viewportMotion'

const DRAG_OPACITY = 0.5

/**
 * 편집 화면이 페이지 그림에 알려 GIF 를 멈출지 정하는 값. (EditorScreen 이 Viewport 안쪽에 준다)
 * - moving: 확대·축소·이동 중 (transform 으로 늘이는 동안은 GIF 를 첫 장면으로 멈춘다)
 * - visible: 지금 화면에 보이는 페이지 범위 (논리 좌표). 범위 밖 GIF 는 멈춘다.
 * 페이지 목록 썸네일 등에서는 기본값이라 아무것도 바뀌지 않는다.
 */
export { ViewportMotion }

/**
 * 페이지 그림. 편집 화면(Canvas 의 그림 층)과 페이지 썸네일이 이 컴포넌트 하나를 같이 써서
 * 썸네일이 편집 화면을 그대로 비춘다. (같은 문서 상태를 같은 방식으로, 배율만 달리 그린다)
 * - still: GIF 를 첫 장면으로 그린다. (지금 편집 중이 아닌 페이지 썸네일)
 * - cropId: 자르는 중인 사진. 나머지 요소는 흐리게, 자르는 사진에는 테두리를 둘러 편집 화면과 똑같이 보여 준다.
 * - background: 편집 화면은 페이지 바탕을 Canvas 가 따로 그려서 투명으로 둔다.
 * - fadeIds: 끌어서 옮기는 중인 요소. 놓기 전까지 반투명하게 그린다.
 * - stillIds: 크기 조절·회전 중인 요소. GIF 를 첫 장면으로 멈춘다.
 * - onTextMeasure(id, h): 편집 화면에서 실제 텍스트 높이를 받아 상자 최소 높이를 정한다.
 * 편집 화면에서는 확대·이동하는 동안과 화면 밖에 있는 GIF 도 멈춘다 (ViewportMotion).
 * 편집 화면의 GIF 는 움직여야 하므로, 손대지 않고 보이는 것만 재생한다.
 */
const StaticPage = memo(function StaticPage({ qaPageMeasurement = null, page, zoom, still = false, cropId = null, background = '#FFFFFF', showBackground = true, fadeIds = null, stillIds = null, onTextMeasure = null, textMeasureReady = false, cacheStrokes = false, areaPreviewObjects = null, areaErasing = false, deferredAreaObjects = null, uncachedObjects = null }) {
  const { width, height } = pageSize(page)
  useLayoutEffect(() => { qaPageMeasurement?.emit('drawing-layout') }, [page.id, qaPageMeasurement])
  const motion = useContext(ViewportMotion)
  const cacheOverride = useContext(WebStrokeCacheEnabled)
  // Only the live web writing/eraser layer opts in. Thumbnails/export stay vector.
  const webCache = Platform.OS === 'web' && (cacheOverride ?? cacheStrokes)
  // Only transformed ink invalidates ink batches. Sticker/photo interaction
  // changes their own PageObject, not the mounted completed stroke layer.
  const transformsInk = Boolean(fadeIds?.length || stillIds?.length) && page.objects.some(object =>
    object.type === 'stroke' && (fadeIds?.includes(object.id) || stillIds?.includes(object.id)))
  const cacheAllowed = !cropId && !transformsInk
  const renderObject = object => <PageObject key={object.id} object={object} zoom={zoom} areaPreview={areaErasing && Boolean(areaPreviewObjects?.has(object))}
    opacity={objectDrawOpacity(object) * (cropId && object.id !== cropId ? 0.45 : 1) * (fadeIds?.includes(object.id) ? DRAG_OPACITY : 1)}
    still={still || motion.moving || Boolean(fadeIds?.includes(object.id) || stillIds?.includes(object.id)) || offscreen(object, motion.visible)}
    crop={object.id === cropId} />
  return (
    <View
      style={[styles.page, { width: width * zoom, height: height * zoom, backgroundColor: background }]}
      pointerEvents="none"
    >
      {showBackground && <PageBackground page={page} zoom={zoom} compact />}
      <TextMeasure.Provider value={onTextMeasure}>
      <TextMeasureReady.Provider value={textMeasureReady}>
      {webCache && cacheAllowed
        ? <WebStrokeCache objects={page.objects} width={width} height={height} zoom={zoom} renderObject={renderObject} areaPreviewObjects={areaPreviewObjects} deferredAreaObjects={deferredAreaObjects} areaErasing={areaErasing} />
        // 앱(Skia)은 끌어 옮기거나 크기를 바꾸는 중에도 같은 획 층에 그린다(SVG 로 바뀌면 연필 결이 달라진다)
        : cacheStrokes && !cropId && (Platform.OS !== 'web' || !transformsInk)
        ? <CompletedStrokeLayer objects={page.objects} width={width} height={height} zoom={zoom} renderObject={renderObject} uncachedObjects={uncachedObjects} fadeIds={fadeIds} />
        : page.objects.filter(object => !object.hidden).map(renderObject)}
      </TextMeasureReady.Provider>
      </TextMeasure.Provider>
    </View>
  )
}, (previous, next) => (
  previous.qaPageMeasurement === next.qaPageMeasurement
  && previous.deferredAreaObjects === next.deferredAreaObjects
  && previous.areaErasing === next.areaErasing
  && previous.areaPreviewObjects === next.areaPreviewObjects
  && previous.uncachedObjects === next.uncachedObjects
  && previous.page === next.page
  && previous.zoom === next.zoom
  && previous.still === next.still
  && previous.cropId === next.cropId
  && previous.background === next.background
  && previous.showBackground === next.showBackground
  && previous.fadeIds === next.fadeIds
  && previous.stillIds === next.stillIds
  && previous.cacheStrokes === next.cacheStrokes
  && previous.textMeasureReady === next.textMeasureReady
  // 높이를 받는 함수는 페이지가 바뀔 때 함께 바뀌므로 있고 없음만 비교한다
  && Boolean(previous.onTextMeasure) === Boolean(next.onTextMeasure)
))

export default StaticPage

// 회전해도 벗어나지 않게 긴 변만큼 넉넉히 잡은 요소 범위가 보이는 범위와 겹치지 않으면 화면 밖
function offscreen(object, visible) {
  if (!visible) return false
  const reach = Math.max(object.w, object.h)
  const cx = object.x + object.w / 2
  const cy = object.y + object.h / 2
  return cx + reach < visible.x || cx - reach > visible.x + visible.width || cy + reach < visible.y || cy - reach > visible.y + visible.height
}

const styles = StyleSheet.create({
  page: { overflow: 'hidden' },
})
