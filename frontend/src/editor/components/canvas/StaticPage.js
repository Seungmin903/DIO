import { memo, useContext, useLayoutEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { pageSize } from '../../utils/pageGeometry.js'
import { fitBackdropToPage } from '../../utils/backdrop.js'
import PageBackground from '../PageBackground'
import { objectDrawOpacity, TextMeasure, TextMeasureReady } from './ObjectView'
import PageObject from './PageObject'
import CompletedStrokeLayer from './CompletedStrokeLayer'
import WebStrokeCache from './WebStrokeCache'
import { WebStrokeCacheEnabled } from './WebStrokeCacheContext'
import { ViewportMotion } from './viewportMotion'
import { PackingColorLayer, PackingFrontLayer } from './PackingColorLayer'
import { InkRecordFrontLayer } from './InkRecordFrontLayer'
import { inkRecordLayout } from '../../templates/inkRecordLayout.js'
import { memoArtOf } from '../../utils/editorShapes'
import { packingLayout } from '../../templates/packingLayout.js'

const DRAG_OPACITY = 0.5
// 발색 기록 속지의 병 윤곽이 들어갈 자리표. 요소가 아니라 **차례를 잡는 표식**이라
// type · x · w 가 없다. 획 묶음을 가르는 쪽(CompletedStrokeLayer · WebStrokeCache)은
// type !== 'stroke' 를 비(非)획으로 보고 renderObject 에 넘기므로 그대로 동작한다.
const INK_RECORD_FRONT = { id: 'ink-record-front', inkRecordFront: true }
// 잉크병 메모 덧그림의 자리표도 같은 이유로 **요소마다 하나씩** 만들어 둔다
// (렌더마다 새 객체면 획 묶음 캐시가 참조로 견주는 자리에서 괜히 달라 보인다).
const overTopMarks = new WeakMap()
const overTopMark = object => {
  let mark = overTopMarks.get(object)
  if (!mark) overTopMarks.set(object, (mark = { id: `over-${object.id}`, overTopOf: object }))
  return mark
}

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
  const packing = packingLayout(page.backgroundAssetId)
  const packed = packing ? page.objects.filter(o => !o.hidden && (o.packingSlot === 0 || o.packingSlot === 1)) : []
  const renderableObjects = packing ? page.objects.filter(o => !o.packingColorRegion && o.packingSlot !== 0 && o.packingSlot !== 1) : page.objects
  const renderObject = stored => {
    if (stored.inkRecordFront) return <InkRecordFrontLayer key="ink-record-front" page={page} zoom={zoom} />
    if (stored.overTopOf) return renderOverTop(stored.overTopOf)
    const object = fitBackdropToPage(stored, width, height)
    return <PageObject key={object.id} object={object} zoom={zoom} areaPreview={areaErasing && Boolean(areaPreviewObjects?.has(stored))}
      opacity={objectDrawOpacity(object) * (cropId && object.id !== cropId ? 0.45 : 1) * (fadeIds?.includes(object.id) ? DRAG_OPACITY : 1)}
      still={still || motion.moving || Boolean(fadeIds?.includes(object.id) || stillIds?.includes(object.id)) || offscreen(object, motion.visible)}
      crop={object.id === cropId} />
  }
  // 잉크병 메모(art.overTop)는 **선만** 한 겹 더 맨 위에 올린다 — 그래야 그 위에 쓴 펜 색이 병 선을 덮지 않고
  // 잉크가 병 안으로 들어간 것처럼 보인다(사용자 2026-11-10). 종이 · 글은 제자리(아래)에 그대로 있고,
  // 덧그림은 손가락을 안 받는다(PageObject 의 pointerEvents none).
  // 덧그림은 **그 뒤에 그은 획 위**까지만 올라간다. 맨 뒤에 몰아 그리면 나중에 붙인 메모 · 사진까지
  // 덮어 버린다(사용자 2026-11-12: "그 위에 다른 메모지가 붙으면 공병 윤곽도 가려져야 한다").
  // 그래서 **다음 비(非)획 요소 바로 앞**에 끼운다 — 사이의 획은 덮고, 뒤에 붙인 것에는 덮인다.
  // 목록은 렌더마다 새 배열이지만 useMemo 로 감싸지 않는다 — 캐시 층(CompletedStrokeLayer)은
  // 배열이 아니라 **요소 참조**로 견주고(같은 내용이면 지난 묶음을 그대로 쓴다), 자리표는 둘 다
  // 한 번만 만들어 둔 것을 쓰므로 요소가 새로 생기지 않는다(코드리뷰 2026-11-13, 검사로 못 박음).
  const ordered = []
  // 발색 기록 속지의 병 윤곽도 **같은 규칙**을 탄다(사용자 2026-11-13: "발색 기록 속지들도
  // 메모지랑 같은 버그"). 맨 뒤에 그리고 있어서 나중에 붙인 메모 · 사진까지 덮었다.
  // 속지는 모든 요소보다 아래(배경)에 있으므로 **처음 만나는 비(非)획 요소 바로 앞**이 제자리다 —
  // 그때까지 그은 획은 덮어 잉크가 병 안에 든 것처럼 보이고, 뒤에 붙인 것에는 덮인다.
  // 자리표는 **한 번만** 만들어 둔 것을 쓴다 — 렌더마다 새 객체면 획 묶음 캐시가 참조로
  // 견주는 자리에서 괜히 달라 보인다(코드리뷰 2026-11-13).
  const pending = inkRecordLayout(page.backgroundAssetId) ? [INK_RECORD_FRONT] : []
  for (const object of renderableObjects) {
    // **숨긴 요소는 차례를 가르지 않는다.** 그리는 쪽은 숨긴 것을 빼고 그리므로, 숨긴 스티커 ·
    // 사진이 획 앞에 있다고 윤곽을 거기서 끊으면 **화면에는 아무것도 없는데** 그 뒤에 그은 획이
    // 윤곽 위로 올라와 병 선을 덮는다(코드리뷰 2026-11-13).
    if (!object.hidden && object.type !== 'stroke' && pending.length) ordered.push(...pending.splice(0))
    ordered.push(object)
    if (!object.hidden && memoArtOf(object.art)?.overTop) pending.push(overTopMark(object))
  }
  ordered.push(...pending)
  const renderOverTop = stored => {
    const object = fitBackdropToPage(stored, width, height)
    return <PageObject key={`over-${object.id}`} object={object} zoom={zoom} linesOnly
      opacity={objectDrawOpacity(object) * (cropId && object.id !== cropId ? 0.45 : 1) * (fadeIds?.includes(object.id) ? DRAG_OPACITY : 1)}
      still={still || motion.moving} />
  }
  return (
    <View
      style={[styles.page, { width: width * zoom, height: height * zoom, backgroundColor: background }]}
      pointerEvents="none"
    >
      {showBackground && <PageBackground page={page} zoom={zoom} compact />}
      <PackingColorLayer page={page} zoom={zoom} />
      {packed.length > 0 && packing.interiors.map((box, slot) => {
        const sx = packing.scaleX ?? 1, sy = packing.scaleY ?? 1
        const x = packing.origin.x + box.x * sx, y = packing.origin.y + box.y * sy
        return <View key={slot} style={{ position: 'absolute', left: x * zoom, top: y * zoom, width: box.width * sx * zoom, height: box.height * sy * zoom, borderRadius: box.rx * Math.min(sx, sy) * zoom, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: -x * zoom, top: -y * zoom, width: width * zoom, height: height * zoom }}>{packed.filter(o => o.packingSlot === slot).map(renderObject)}</View>
        </View>
      })}
      {packing && <PackingFrontLayer page={page} zoom={zoom} />}
      <TextMeasure.Provider value={onTextMeasure}>
      <TextMeasureReady.Provider value={textMeasureReady}>
      {webCache && cacheAllowed
        ? <WebStrokeCache objects={ordered} width={width} height={height} zoom={zoom} renderObject={renderObject} areaPreviewObjects={areaPreviewObjects} deferredAreaObjects={deferredAreaObjects} areaErasing={areaErasing} />
        // 앱(Skia)은 끌어 옮기거나 크기를 바꾸는 중에도 같은 획 층에 그린다(SVG 로 바뀌면 연필 결이 달라진다)
        : cacheStrokes && !cropId && (Platform.OS !== 'web' || !transformsInk)
        ? <CompletedStrokeLayer objects={ordered} width={width} height={height} zoom={zoom} renderObject={renderObject} uncachedObjects={uncachedObjects} fadeIds={fadeIds} />
        : ordered.filter(object => !object.hidden).map(renderObject)}
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
