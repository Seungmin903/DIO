import { Image, StyleSheet, Text, View } from 'react-native'
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg'
import { FRAME_COLORS } from '../constants'
import { stickerSource } from '../stickerAssets'
import { reportMediaDisplayError } from '../utils/mediaStore'
import { mediaRegistry } from '../utils/mediaStore'
import { colors } from '../../theme'
import { mediaId } from '../utils/mediaReferences.js'
import { useMediaUri } from '../hooks/useMediaUri'
import { coverLayout, photoInnerBox } from '../utils/objects'
import { shapePath } from '../utils/shapes'
import { useSvgId } from '../utils/svgId'
import TapeView from './TapeView'

/**
 * 오브젝트 하나의 생김새. 위치·회전·투명도는 바깥에서 잡고, 여기서는 zoom 배율로 내용만 그린다.
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
    case 'sticker':
      return <StickerContent object={object} width={width} height={height} still={still} onAssetLoad={onAssetLoad} onAssetError={onAssetError} />
    case 'tape':
      return (
        <View style={{ transform: flipTransform(object) }}>
          <TapeView
            pattern={object.pattern}
            src={object.src}
            mediaFileId={object.mediaFileId}
            crop={object.crop}
            imageWidth={object.imageWidth}
            imageHeight={object.imageHeight}
            edge={object.edge}
            width={width}
            height={height}
            scale={zoom}
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

// 흰 테두리: 스티커·도형 사진 기본 켬
export const outlineOn = (object) => object.outline !== false
// 그림자: 스티커 기본 끔, 사진 기본 켬
export const shadowOn = (object) => object.shadow ?? object.type === 'photo'
export const objectOpacity = (object) => object.opacity ?? 1
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
const EDGE_COLOR = '#0B1957'

/**
 * RN 에는 drop-shadow·외곽선 필터가 없어서, 같은 모양의 단색 실루엣을 여러 방향으로 밀어 겹쳐 그린다.
 * - 흰 테두리: 흰 실루엣 16장
 * - 그림자: 테두리(또는 스티커) 바깥을 감싸는 옅은 남색 가장자리. 살짝 아래로 내려 바닥에 뜬 느낌을 준다.
 */
function StickerContent({ object, width, height, still, onAssetLoad, onAssetError }) {
  const outline = outlineOn(object)
  const shadow = shadowOn(object)
  const stroke = outline ? Math.max(2, height * 0.05) : 0
  const edge = stroke + Math.max(1, height * 0.014)
  const drop = Math.max(0.8, height * 0.012)
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
    : (key, color, dx, dy, opacity = 1) => (
        // 투명한 글자에 반경 1짜리 그림자만 남기면 이모지가 단색 실루엣이 된다.
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
              textShadowRadius: 1,
            },
          ]}
        >
          {object.emoji}
        </Text>
      )

  return (
    <View style={[styles.center, box, { transform: flipTransform(object) }]}>
      {shadow && DIRECTIONS.map(([dx, dy], i) => silhouette(`s${i}`, EDGE_COLOR, dx * edge, dy * edge + drop, 0.1))}
      {outline && DIRECTIONS.map(([dx, dy], i) => silhouette(`o${i}`, '#FFFFFF', dx * stroke, dy * stroke))}
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
  const shadow = shadowOn(photo) && photoSupportsShadow(photo)
  const border = outlineOn(photo) ? Math.max(0.75, 2 * zoom) : 0

  // 사각·라운드·원형은 View 로 잘라 그린다. RN Image 라서 GIF 도 움직인다. (SVG 이미지는 첫 장면만 나옴)
  if (photo.frame === 'shape' && VIEW_CLIP_SHAPES[photo.shape] != null) {
    const shapeStyle = {
      width: box.width,
      height: box.height,
      borderRadius: photo.shape === 'circle' ? '50%' : Math.min(box.width, box.height) * VIEW_CLIP_SHAPES[photo.shape],
    }
    return (
      // 그림자는 잘라 내지 않는 바깥 View 에, 사진은 안쪽 View 에서 자른다.
      <View style={[shapeStyle, shadow && styles.shadow]}>
        <View style={[styles.shapeClip, shapeStyle, { borderWidth: border, transform: flip }]}>
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
        {border > 0 && <Path d={d} fill="none" stroke="#FFFFFF" strokeWidth={border * 2} />}
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
        shadow && styles.shadow,
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
  shadow: {
    shadowColor: '#0B1957',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  photoInner: {
    position: 'absolute',
    overflow: 'hidden',
  },
  photoImage: { position: 'absolute' },
})
