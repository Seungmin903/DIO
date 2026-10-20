import { Image, StyleSheet, Text, View } from 'react-native'
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg'
import { FRAME_COLORS, TAPE_DEFAULT_OPACITY } from '../../constants'
import { stickerSource } from '../../stickerAssets'
import { boxShadowStyle, outlineOf, shadowOf, shadowOffset } from '../../utils/effects'
import { reportMediaDisplayError, mediaRegistry } from '../../services/mediaStore'
import { colors } from '../../../shared/theme'
import { mediaId } from '../../utils/mediaReferences.js'
import { useMediaUri } from '../../hooks/useMediaUri'
import { coverLayout, photoInnerBox, tapeSizeOf } from '../../utils/objects'
import { shapePath } from '../../utils/shapes'
import { useSvgId } from '../../utils/svgId'
import TapeView from './TapeView'
import StrokeContent from '../StrokeContent'

/**
 * 오브젝트 하나의 생김새. 위치·회전·불투명도는 바깥에서 잡고, 여기서는 zoom 배율로 내용만 그린다.
 * 편집 화면, 페이지 썸네일에서 함께 쓴다.
 */
export default function ObjectContent({ object, zoom, still = false, onAssetLoad, onAssetError }) {
  const width = object.w * zoom
  const height = object.h * zoom
  const uri = useMediaUri(object, { still })
  const failed = mediaRegistry.get(mediaId(object))?.status === 'error'
  if (mediaId(object) && !uri) return (
    <View style={{ width, height, backgroundColor: failed ? colors.surfaceSoft : colors.surface, borderWidth: failed ? 1 : 0, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.max(8, 12 * zoom), color: failed ? colors.text : colors.textMuted }}>{failed ? '이미지 확인 필요' : '이미지 불러오는 중…'}</Text>
    </View>
  )
  switch (object.type) {
    case 'stroke':
      return <StrokeContent object={object} zoom={zoom} transform={flipTransform(object)} />
    case 'sticker':
      return <StickerContent object={object} width={width} height={height} zoom={zoom} still={still} onAssetLoad={onAssetLoad} onAssetError={onAssetError} />
    case 'tape':
      return (
        <View style={{ transform: flipTransform(object) }}>
          <TapeView
            pattern={object.pattern}
            palette={object.palette}
            segmentRatio={object.segmentW ? object.segmentW / object.h : undefined}
            src={object.src}
            mediaFileId={object.mediaFileId}
            crop={object.crop}
            imageWidth={object.imageWidth}
            imageHeight={object.imageHeight}
            edge={object.edge}
            width={width}
            height={height}
            // 테이프를 키우면 무늬도 같은 배율로 커지게 (규격 기본 높이 대비)
            scale={(zoom * object.h) / tapeSizeOf(object).h}
            onAssetLoad={onAssetLoad}
          />
        </View>
      )
    case 'photo':
      return <PhotoContent photo={object} zoom={zoom} still={still} onAssetLoad={onAssetLoad} onAssetError={onAssetError} />
    default:
      return null
  }
}

/* ---------- 꾸미기 옵션 (값이 없으면 기본값) ---------- */

// 테두리·그림자: 기본은 둘 다 꺼짐. 색·두께·위치 등은 utils/effects 의 outlineOf·shadowOf
export const outlineOn = (object) => outlineOf(object).on
export const shadowOn = (object) => shadowOf(object).on
// 테이프는 기본 80% (살짝 비치는 마스킹테이프). 100% 면 완전히 불투명하다.
export const objectOpacity = (object) => object.opacity ?? (object.type === 'tape' ? TAPE_DEFAULT_OPACITY : 1)
// 사진 그림자는 View 로 그리는 틀(폴라로이드·사각·라운드·원형)에서만 지원
export const photoSupportsShadow = (photo) => photo.frame === 'polaroid' || VIEW_CLIP_SHAPES[photo.shape] != null
export const frameColorOf = (photo) => FRAME_COLORS.find((c) => c.id === photo.frameColor)?.value ?? '#FFFFFF'

export function flipTransform(object) {
  const transform = []
  if (object.flipX) transform.push({ scaleX: -1 })
  if (object.flipY) transform.push({ scaleY: -1 })
  return transform.length ? transform : undefined
}

/* ---------- 스티커 ---------- */

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.71, 0.71],
  [-0.71, 0.71],
  [0.71, -0.71],
  [-0.71, -0.71],
  [0.92, 0.38],
  [-0.92, 0.38],
  [0.92, -0.38],
  [-0.92, -0.38],
  [0.38, 0.92],
  [-0.38, 0.92],
  [0.38, -0.92],
  [-0.38, -0.92],
]

/**
 * RN 에는 모양을 따라가는 외곽선·그림자 필터가 (iOS 에) 없어서, 같은 모양의 단색 실루엣을 여러 장 겹쳐 그린다.
 * - 테두리: 테두리 색 실루엣 16장을 두께만큼 사방으로 민다.
 * - 그림자: 그림자 색 실루엣을 방향·거리만큼 옮기고, 흐림만큼 둥글게 퍼뜨려 옅게 겹친다.
 *   테두리가 있으면 테두리 바깥 끝을 기준으로 그린다. (사진은 테두리가 상자 안쪽에 그려져 boxShadow 가 원래 테두리 끝 기준)
 */
function StickerContent({ object, width, height, zoom, still, onAssetLoad, onAssetError }) {
  const outline = outlineOf(object)
  const shadow = shadowOf(object)
  const stroke = outline.on ? Math.max(0.75, outline.width * zoom) : 0
  const offset = shadowOffset(shadow)
  const blurSpread = shadow.blur * zoom * 0.45
  const box = { width, height }
  const uri = useMediaUri(object, { still })
  const source = stickerSource(object, still, uri)

  const silhouette = source
    ? (key, color, dx, dy, opacity = 1) => (
        <Image
          key={key}
          source={source}
          style={[
            styles.layer,
            box,
            {
              tintColor: color,
              opacity,
              transform: [{ translateX: dx }, { translateY: dy }],
            },
          ]}
          resizeMode="contain"
        />
      )
    : (key, color, dx, dy, opacity = 1, radius = 1) => (
        // 투명한 글자에 그림자만 남기면 이모지가 단색 실루엣이 된다.
        <Text
          key={key}
          style={[
            styles.emoji,
            emojiText(height),
            {
              color: 'transparent',
              opacity,
              textShadowColor: color,
              textShadowOffset: { width: dx, height: dy },
              textShadowRadius: radius,
            },
          ]}
        >
          {object.emoji}
        </Text>
      )

  const sx = offset.x * zoom
  const sy = offset.y * zoom
  // 겹친 장수만큼 진해지므로 한 장의 진하기를 나눈다. 테두리 바깥 가장자리는 서너 장만 겹치므로
  // 그 정도가 겹쳤을 때 정한 진하기가 되게 맞춘다. (16장 기준으로 나누면 가장자리 그림자가 안 보였다)
  const perLayer = (opacity, n) => 1 - Math.pow(1 - opacity, 1 / n)
  const EDGE_OVERLAP = 4
  // 그림자 몸통: 테두리가 있으면 테두리 바깥 끝(스티커를 테두리 두께만큼 키운 모양)에서 시작한다.
  const body = stroke > 0
    ? DIRECTIONS.map(([dx, dy], i) => silhouette(`sb${i}`, shadow.color, sx + dx * stroke, sy + dy * stroke, perLayer(shadow.opacity, EDGE_OVERLAP)))
    : [silhouette('sb', shadow.color, sx, sy, shadow.opacity)]
  // 흐림: 몸통 바깥으로 둥글게 더 옅은 그림자를 퍼뜨린다.
  const blurRing = blurSpread > 0.5
    ? DIRECTIONS.map(([dx, dy], i) =>
        silhouette(`sr${i}`, shadow.color, sx + dx * (stroke + blurSpread), sy + dy * (stroke + blurSpread), perLayer(shadow.opacity * 0.5, EDGE_OVERLAP)),
      )
    : []
  const shadowLayers = !shadow.on
    ? null
    : !source
      ? silhouette('s', shadow.color, sx, sy, Math.min(1, shadow.opacity * 2), Math.max(1, stroke + shadow.blur * zoom))
      : [...blurRing, ...body]

  return (
    <View style={[styles.center, box, { transform: flipTransform(object) }]}>
      {shadowLayers}
      {outline.on && DIRECTIONS.map(([dx, dy], i) => silhouette(`o${i}`, outline.color, dx * stroke, dy * stroke))}
      {source ? (
        <Image onLoad={onAssetLoad} onError={() => { reportMediaDisplayError(object); onAssetError?.() }} source={source} style={box} resizeMode="contain" />
      ) : (
        <Text style={[styles.emoji, emojiText(height)]}>{object.emoji}</Text>
      )}
    </View>
  )
}

const emojiText = (height) => ({ fontSize: height * 0.72, lineHeight: height })

/* ---------- 사진 ---------- */

// still: 페이지 썸네일처럼 움직일 필요 없는 곳에서는 GIF 대신 첫 장면을 그린다.
export function PhotoContent({ photo, zoom, still = false, onAssetLoad, onAssetError }) {
  const uri = useMediaUri(photo, { still })
  const clipId = useSvgId('photo-clip')
  const inner = photoInnerBox(photo)
  const box = { width: inner.width * zoom, height: inner.height * zoom }
  const layout = coverLayout(photo, box.width, box.height)
  const flip = flipTransform(photo)
  const outline = outlineOf(photo)
  const shadow = { ...shadowOf(photo), on: shadowOf(photo).on && photoSupportsShadow(photo) }
  const border = outline.on ? Math.max(0.75, outline.width * zoom) : 0

  // 사각·라운드·원형은 View 로 잘라 그린다. RN Image 라서 GIF 도 움직인다. (SVG 이미지는 첫 장면만 나옴)
  if (photo.frame === 'shape' && VIEW_CLIP_SHAPES[photo.shape] != null) {
    const shapeStyle = {
      width: box.width,
      height: box.height,
      borderRadius: photo.shape === 'circle' ? '50%' : Math.min(box.width, box.height) * VIEW_CLIP_SHAPES[photo.shape],
    }
    return (
      // 그림자는 잘라 내지 않는 바깥 View 에, 사진은 안쪽 View 에서 자른다.
      <View style={[shapeStyle, boxShadowStyle(shadow, zoom)]}>
        <View style={[styles.shapeClip, shapeStyle, { borderWidth: border, borderColor: outline.color, transform: flip }]}>
          <Image onLoad={onAssetLoad} onError={() => { reportMediaDisplayError(photo); onAssetError?.() }} source={uri ? { uri } : null} style={[styles.photoImage, shiftForBorder(layout, border)]} resizeMode="stretch" />
        </View>
      </View>
    )
  }

  if (photo.frame === 'shape') {
    const d = shapePath(photo.shape, box.width, box.height)
    return (
      <Svg width={box.width} height={box.height} style={{ transform: flip }}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={d} />
          </ClipPath>
        </Defs>
        <SvgImage
          onLoad={onAssetLoad} onError={() => { reportMediaDisplayError(photo); onAssetError?.() }}
          href={uri ? { uri } : undefined}
          x={layout.left}
          y={layout.top}
          width={layout.width}
          height={layout.height}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
        />
        {border > 0 && <Path d={d} fill="none" stroke={outline.color} strokeWidth={border * 2} />}
      </Svg>
    )
  }

  return (
    <View
      style={[
        {
          width: photo.w * zoom,
          height: photo.h * zoom,
          backgroundColor: frameColorOf(photo),
        },
        boxShadowStyle(shadow, zoom),
      ]}
    >
      <View
        style={[
          styles.photoInner,
          {
            left: inner.left * zoom,
            top: inner.top * zoom,
            width: box.width,
            height: box.height,
            transform: flip,
          },
        ]}
      >
        <Image onLoad={onAssetLoad} onError={() => { reportMediaDisplayError(photo); onAssetError?.() }} source={uri ? { uri } : null} style={[styles.photoImage, layout]} resizeMode="stretch" />
      </View>
    </View>
  )
}

// 모서리 반경 = 짧은 변 × 비율 (shapes.js 의 round 반경과 같게). 원형은 늘려도 타원이 되도록 50%
const VIEW_CLIP_SHAPES = { rect: 0, round: 0.14, circle: 0.5 }

// 테두리 안쪽이 기준점이 되므로 이미지를 테두리 두께만큼 당겨 SVG 버전과 같은 위치에 둔다.
function shiftForBorder(layout, border) {
  return { ...layout, left: layout.left - border, top: layout.top - border }
}

const styles = StyleSheet.create({
  // 배경색 없음: 투명 PNG 의 빈 곳이 그대로 비쳐 보이게 한다.
  shapeClip: {
    overflow: 'hidden',
    borderColor: '#FFFFFF',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  emoji: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    textAlign: 'center',
    includeFontPadding: false,
  },
  layer: { position: 'absolute', left: 0, top: 0 },
  photoInner: {
    position: 'absolute',
    overflow: 'hidden',
  },
  photoImage: { position: 'absolute' },
})
