import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { pageSize } from '../../utils/pageGeometry.js'
import PageBackground from '../PageBackground'
import ObjectContent, { objectOpacity } from './ObjectView'

/**
 * 페이지 그림. 편집 화면(Canvas 의 그림 층)과 페이지 썸네일이 이 컴포넌트 하나를 같이 써서
 * 썸네일이 편집 화면을 그대로 비춘다. (같은 문서 상태를 같은 방식으로, 배율만 달리 그린다)
 * - still: GIF 를 첫 장면으로 그린다. (지금 편집 중이 아닌 페이지 썸네일)
 * - cropId: 자르는 중인 사진. 나머지 요소는 흐리게, 자르는 사진에는 테두리를 둘러 편집 화면과 똑같이 보여 준다.
 * - background: 편집 화면은 페이지 바탕을 Canvas 가 따로 그려서 투명으로 둔다.
 */
const StaticPage = memo(function StaticPage({ page, zoom, still = false, cropId = null, background = '#FFFFFF', showBackground = true }) {
  const { width, height } = pageSize(page)
  return (
    <View
      style={[styles.page, { width: width * zoom, height: height * zoom, backgroundColor: background }]}
      pointerEvents="none"
    >
      {showBackground && <PageBackground page={page} zoom={zoom} compact />}
      {page.objects
        .filter((object) => !object.hidden)
        .map((object) => {
          const opacity = objectOpacity(object) * (cropId && object.id !== cropId ? 0.45 : 1)
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
            <ObjectContent object={object} zoom={zoom} still={still} />
            {object.id === cropId && <View style={[styles.cropRing, { margin: -Math.min(6, Math.max(1, 12 * zoom)) }]} />}
          </View>
          )
        })}
    </View>
  )
}, (previous, next) => (
  previous.page === next.page
  && previous.zoom === next.zoom
  && previous.still === next.still
  && previous.cropId === next.cropId
  && previous.background === next.background
  && previous.showBackground === next.showBackground
))

export default StaticPage

const styles = StyleSheet.create({
  page: { overflow: 'hidden' },
  cropRing: { ...StyleSheet.absoluteFillObject, borderWidth: 3, borderColor: colors.primary, borderRadius: 6 },
})
