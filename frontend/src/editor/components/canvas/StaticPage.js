import { createContext, memo, useContext } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { pageSize } from '../../utils/pageGeometry.js'
import PageBackground from '../PageBackground'
import ObjectContent, { objectOpacity, TextMeasure } from './ObjectView'

const DRAG_OPACITY = 0.5

/**
 * 편집 화면이 페이지 그림에 알려 GIF 를 멈출지 정하는 값. (EditorScreen 이 Viewport 안쪽에 준다)
 * - moving: 확대·축소·이동 중 (transform 으로 늘이는 동안은 GIF 를 첫 장면으로 멈춘다)
 * - visible: 지금 화면에 보이는 페이지 범위 (논리 좌표). 범위 밖 GIF 는 멈춘다.
 * 페이지 목록 썸네일 등에서는 기본값이라 아무것도 바뀌지 않는다.
 */
export const ViewportMotion = createContext({ moving: false, visible: null })

/**
 * 페이지 그림. 편집 화면(Canvas 의 그림 층)과 페이지 썸네일이 이 컴포넌트 하나를 같이 써서
 * 썸네일이 편집 화면을 그대로 비춘다. (같은 문서 상태를 같은 방식으로, 배율만 달리 그린다)
 * - still: GIF 를 첫 장면으로 그린다. (지금 편집 중이 아닌 페이지 썸네일)
 * - cropId: 자르는 중인 사진. 나머지 요소는 흐리게, 자르는 사진에는 테두리를 둘러 편집 화면과 똑같이 보여 준다.
 * - background: 편집 화면은 페이지 바탕을 Canvas 가 따로 그려서 투명으로 둔다.
 * - fadeIds: 끌어서 옮기는 중인 요소. 놓기 전까지 반투명하게 그린다.
 * - stillIds: 크기 조절·회전 중인 요소. GIF 를 첫 장면으로 멈춘다.
 * - onTextMeasure(id, h): 편집 화면에서 텍스트가 실제로 그려진 높이를 받는다. (상자 높이를 줄 수에 맞춤)
 * 편집 화면에서는 확대·이동하는 동안과 화면 밖에 있는 GIF 도 멈춘다 (ViewportMotion).
 * 편집 화면의 GIF 는 움직여야 하므로, 손대지 않고 보이는 것만 재생한다.
 */
const StaticPage = memo(function StaticPage({ page, zoom, still = false, cropId = null, background = '#FFFFFF', showBackground = true, fadeIds = null, stillIds = null, onTextMeasure = null }) {
  const { width, height } = pageSize(page)
  const motion = useContext(ViewportMotion)
  return (
    <View
      style={[styles.page, { width: width * zoom, height: height * zoom, backgroundColor: background }]}
      pointerEvents="none"
    >
      {showBackground && <PageBackground page={page} zoom={zoom} compact />}
      <TextMeasure.Provider value={onTextMeasure}>
      {page.objects
        .filter((object) => !object.hidden)
        .map((object) => {
          const opacity = objectOpacity(object) * (cropId && object.id !== cropId ? 0.45 : 1) * (fadeIds?.includes(object.id) ? DRAG_OPACITY : 1)
          return (
          <View
            key={object.id}
            // Android: 투명도를 요소 하나로 합쳐서 적용한다. 그렇지 않으면 사진처럼 잘라 그리는(overflow hidden) 겹들이
            // 따로따로 비쳐서 투명도를 낮출수록 사진이 까맣게 보였다.
            needsOffscreenAlphaCompositing={opacity < 1}
            renderToHardwareTextureAndroid={opacity < 1}
            style={{
              position: 'absolute',
              left: object.x * zoom,
              top: object.y * zoom,
              width: object.w * zoom,
              height: object.h * zoom,
              transform: [{ rotate: `${object.rotation}deg` }],
              opacity,
            }}
          >
            {/* 끌어서 옮기는 동안(반투명)·크기 조절 중·확대 이동 중·화면 밖이면 GIF 를 첫 장면으로 멈춰 매 장면 다시 그리지 않는다 */}
            <ObjectContent
              object={object}
              zoom={zoom}
              still={still || motion.moving || Boolean(fadeIds?.includes(object.id) || stillIds?.includes(object.id)) || offscreen(object, motion.visible)}
            />
            {object.id === cropId && <View style={[styles.cropRing, { margin: -Math.min(6, Math.max(1, 12 * zoom)) }]} />}
          </View>
          )
        })}
      </TextMeasure.Provider>
    </View>
  )
}, (previous, next) => (
  previous.page === next.page
  && previous.zoom === next.zoom
  && previous.still === next.still
  && previous.cropId === next.cropId
  && previous.background === next.background
  && previous.showBackground === next.showBackground
  && previous.fadeIds === next.fadeIds
  && previous.stillIds === next.stillIds
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
  cropRing: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: colors.primary, borderRadius: 6 },
})
