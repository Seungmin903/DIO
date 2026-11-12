import { createContext, memo, useContext, useLayoutEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from 'react-native-svg'
import { TAPE_DEFAULT_OPACITY } from '../../constants'
import { builtinStickerOf } from '../../builtinStickers'
import { useStickerPacks } from '../../hooks/useStickerPacks'
import { useRemoteAssetUri } from '../../../shared/remoteAssets/useRemoteAssetUri'
import { isAnimatedMedia, isRetiredSticker, stickerSource } from '../../stickerAssets'
import BuiltinStickerArt from './BuiltinStickerArt'
import MediaImage from './MediaImage'
import PdfDetail from './PdfDetail'
import { usePdfPageRaster } from '../../../diary/hooks/usePdfPageRaster'
import StickerFrame from './StickerFrame'
import { boxShadowStyle, insetShadowStyle, outlineOf, shadowOf, shadowOffset } from '../../utils/effects'
import { reportMediaDisplayError } from '../../services/mediaStore'
import { colors } from '../../../shared/theme'
import { mediaId } from '../../utils/mediaReferences.js'
import { isBackdrop } from '../../utils/backdrop.js'
import { useMediaEntry, useMediaUri, useSvgImageUri } from '../../hooks/useMediaUri'
import { coverLayout, hasPhotoMedia, photoInnerBox, tapePieceRatio, tapeUnitH } from '../../utils/objects'
import { shapePath } from '../../utils/shapes'
import { useSvgId } from '../../utils/svgId'
import TapeView from './TapeView'
import { pencilBakesOpacity } from '../../skia/pencilRaster.js'
import FrameBackdrop, { emptySlotColor, isDarkColor, isTicketFrame, StripBackdrop, STRIP_DEFAULT_COLOR, stampPath } from './PhotoFrame'
import { isStripFrame, stripCellBoxes } from '../../utils/photoStrip'
import PhotoPathShadow from './PhotoPathShadow'
import StrokeContent from '../StrokeContent'
import ShapeContent from './ShapeContent'
import { richTextSegments, segmentTextStyle } from '../../utils/textFormats'
import { loadedFontFamily, textLayoutKey, textSettings, textStyle } from '../../utils/text'
import { useTextFont } from '../../hooks/useTextFont'
import { useStickerPlayback } from '../../hooks/useStickerPlayback'
import DdayWidget from '../../widgets/DdayWidget'
import RouteNodeArt from './RouteNodeArt'

/**
 * 텍스트가 실제로 그려진 높이를 알려 받는 곳 (id, 논리 높이). 편집 화면 캔버스만 주고, 썸네일은 null 이다.
 * 글꼴·줄바꿈을 반영한 실제 내용 높이를 측정해 상자 축소의 하한으로 사용한다.
 */
export const TextMeasure = createContext(null)
export const TextMeasureReady = createContext(false)

/**
 * 오브젝트 하나의 생김새. 위치·회전·불투명도는 바깥에서 잡고, 여기서는 zoom 배율로 내용만 그린다.
 * 편집 화면, 페이지 썸네일에서 함께 쓴다.
 */
function ObjectContent({ object, zoom, areaPreview = false, still: stillRequested = false, onAssetLoad, onAssetError, showFallbackWhileLoading = false, linesOnly = false }) {
  const fontStatus = useTextFont(object.type === 'text' ? object.font : null, Boolean(object.bold))

  const width = object.w * zoom
  const height = object.h * zoom
  const failed = useMediaEntry(mediaId(object))?.status === 'error'
  // 원본을 찾지 못해도 문서에 첫 장면이 있으면 그것을 그린다. (복구 안내는 화면 위 배너가 맡는다)
  const still = stillRequested || (failed && Boolean(object.poster))
  const uri = useMediaUri(object, { still })
  const onTextMeasure = useContext(TextMeasure)
  const textMeasureReady = useContext(TextMeasureReady)
  if (object.type === 'text' && object.font?.startsWith('personal-') && !loadedFontFamily(object.font)) return (
    <View style={{ width, height, justifyContent: 'center' }}><Text style={{ fontSize: Math.max(8, 12 * zoom), color: colors.textMuted }}>{fontStatus.includes(':loading') ? '내 폰트를 준비하고 있어요…' : '내 폰트 파일을 가져와 주세요.'}</Text></View>
  )
  if (mediaId(object) && !uri) return (
    <View style={{ width, height, backgroundColor: failed ? colors.surfaceSoft : colors.surface, borderWidth: failed ? 1 : 0, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.max(8, 12 * zoom), color: failed ? colors.text : colors.textMuted }}>{failed ? '이미지 확인 필요' : '이미지 불러오는 중…'}</Text>
    </View>
  )
  // 없앤 기본 스티커: 자리만 점선으로 남겨 찾아 지울 수 있게 한다 (내보내기에서는 빠진다)
  if (isRetiredSticker(object)) return (
    <View style={{ width, height, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.max(8, 11 * zoom), color: colors.textMuted }}>없어진 스티커</Text>
    </View>
  )
  switch (object.type) {
    case 'text': {
      // 상자의 빈 공간과 별개로 실제 내용 높이를 측정한다 (TextMeasure).
      return <TextContent object={object} width={width} height={height} zoom={zoom} onTextMeasure={onTextMeasure} textMeasureReady={textMeasureReady} />
    }
    case 'shape':
      return <ShapeContent object={object} zoom={zoom} linesOnly={linesOnly} />
    case 'stroke':
      return <StrokeContent areaPreview={areaPreview} object={object} zoom={zoom} transform={flipTransform(object)} onAssetLoad={onAssetLoad} onAssetError={onAssetError} showFallbackWhileLoading={showFallbackWhileLoading} />
    case 'sticker':
      // 여행 노선 지점(출발 · 방문 · 도착): 스티커 하위 종류(widgets/routeNode.js)
      if (object.routeNode) return <RouteNodeArt node={object.routeNode} width={width} height={height} />
      if (object.widget) return <View style={{ transform: flipTransform(object) }}><DdayWidget widget={object.widget} width={width} height={height} /></View>
      if (object.pdfSource) return <PdfStickerContent object={object} width={width} height={height} zoom={zoom} still={still} onAssetLoad={onAssetLoad} onAssetError={onAssetError} />
      return <StickerContent object={object} width={width} height={height} zoom={zoom} still={still} onAssetLoad={onAssetLoad} onAssetError={onAssetError} />
    case 'tape':
      return (
        <View style={{ transform: flipTransform(object) }}>
          <TapeView
            pattern={object.pattern}
            palette={object.palette}
            segmentShare={object.segmentW ? object.segmentW / object.w : undefined}
            pieceRatio={tapePieceRatio(object)}
            src={object.src}
            mediaFileId={object.mediaFileId}
            poster={object.poster}
            crop={object.crop}
            imageWidth={object.imageWidth}
            imageHeight={object.imageHeight}
            edge={object.edge}
            width={width}
            height={height}
            // 테이프를 키우면 무늬도 같은 배율로 커지게 (규격 기본 높이 대비)
            scale={(zoom * object.h) / tapeUnitH(object)}
            onAssetLoad={onAssetLoad}
          />
        </View>
      )
    case 'photo':
      if (isStripFrame(object.frame)) return <PhotoStripContent photo={object} zoom={zoom} onAssetLoad={onAssetLoad} onAssetError={onAssetError} />
      return <PhotoContent photo={object} zoom={zoom} still={still} onAssetLoad={onAssetLoad} onAssetError={onAssetError} />
    default:
      return null
  }
}

// 새 획·선택·저장 상태가 바뀌어도 같은 요소의 그림은 재사용한다.
export default memo(ObjectContent)

// 안드로이드는 글자 장식(textDecorationLine)이 다시 그릴 때 사라지거나(밑줄) 아예 그려지지 않아서(취소선, 태블릿 실기기 확인 2026-11-01)
// 줄마다 위치를 재서(onTextLayout) 선을 직접 긋는다. 웹 · iOS 는 글자 장식을 그대로 쓴다.
const DRAWN_DECORATION = Platform.OS === 'android'

function TextContent({ object, width, height, zoom, onTextMeasure, textMeasureReady }) {
  const scale = width / (object.baseWidth ?? object.w)
  const settings = textSettings(object)
  const base = textStyle(object, scale, Platform.OS)
  const drawn = DRAWN_DECORATION && (settings.underline || settings.strike)
  const [lines, setLines] = useState(null)
  const textRef = useRef(null)
  const lastMeasurement = useRef(null)
  const measureCallback = useRef(onTextMeasure)
  measureCallback.current = onTextMeasure
  const measurementEnabled = Boolean(onTextMeasure)
  const layoutKey = textLayoutKey(object)
  const reportHeight = measuredHeight => {
    if (!measureCallback.current || !Number.isFinite(measuredHeight) || measuredHeight <= 0 || !Number.isFinite(zoom) || zoom <= 0) return
    const h = measuredHeight / zoom
    if (lastMeasurement.current?.id === object.id && lastMeasurement.current.key === layoutKey && lastMeasurement.current.boxHeight === object.h && Math.abs(lastMeasurement.current.h - h) < 0.01) return
    lastMeasurement.current = { id: object.id, key: layoutKey, boxHeight: object.h, h }
    measureCallback.current(object.id, h)
  }
  // 크기 조절 중 측정이 중단됐다가 재개되면 크기가 같아도 직접 잰다.
  useLayoutEffect(() => {
    if (!measurementEnabled || Platform.OS === 'web') return undefined
    let cancelled = false
    textRef.current?.measure?.((_x, _y, _width, measuredHeight) => {
      if (!cancelled) reportHeight(measuredHeight)
    })
    return () => { cancelled = true }
  }, [measurementEnabled, layoutKey, object.id, object.h, zoom, textMeasureReady])
  const style = { width, minHeight: onTextMeasure ? undefined : height, ...base, ...(drawn && { textDecorationLine: 'none' }) }
  // 측정이 다시 켜질 때 크기가 같아도 새로운 native Text의 첫 onLayout을 받는다.
  const text = <Text ref={textRef} key={textMeasureReady ? 'ready' : 'loading'} onLayout={onTextMeasure ? (event) => reportHeight(event.nativeEvent.layout.height) : undefined}
    onTextLayout={drawn ? (event) => setLines(event.nativeEvent.lines) : undefined} style={style}>
    {richTextSegments(object.text, object.colorRanges, object.styleRanges).map((segment, index) => <Text key={index} style={{ textDecorationLine: style.textDecorationLine, ...segmentTextStyle(segment, scale, settings.lineSpacing) }}>{segment.text}</Text>)}
  </Text>
  if (!drawn) return text
  const thickness = Math.max(1, base.fontSize * 0.06)
  return <View style={{ width }}>
    {text}
    {/* 기울임(글자 상자를 기울이는 변형)과 같이 선도 기울인다 */}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, base.transform && { transform: base.transform }]}>
      {(lines ?? []).filter(line => line.width > 0).flatMap((line, index) => {
        const baseline = line.y + line.ascender
        const marks = []
        if (settings.underline) marks.push(<View key={`u${index}`} style={{ position: 'absolute', left: line.x, width: line.width, top: baseline + thickness * 1.2, height: thickness, backgroundColor: settings.color }} />)
        if (settings.strike) marks.push(<View key={`s${index}`} style={{ position: 'absolute', left: line.x, width: line.width, top: baseline - (line.xHeight || base.fontSize * 0.5) / 2 - thickness / 2, height: thickness, backgroundColor: settings.color }} />)
        return marks
      })}
    </View>
  </View>
}

/* ---------- 꾸미기 옵션 (값이 없으면 기본값) ---------- */

// 테두리·그림자: 기본은 둘 다 꺼짐. 색·두께·위치 등은 utils/effects 의 outlineOf·shadowOf
export const outlineOn = (object) => outlineOf(object).on
export const shadowOn = (object) => shadowOf(object).on
// 테이프는 기본 80% (살짝 비치는 마스킹테이프). 100% 면 완전히 불투명하다.
export const objectOpacity = (object) => object.opacity ?? (object.type === 'tape' ? TAPE_DEFAULT_OPACITY : 1)
// 요소 래퍼에 곱할 값: 연필은 그림 안에 불투명도를 구우므로 1
export const objectDrawOpacity = (object) => pencilBakesOpacity(object) ? 1 : objectOpacity(object)
// 특수 외곽(하트·별·우표)은 SVG 경로로, 나머지는 기존 View 그림자로 그린다.
export const photoSupportsShadow = (photo) =>
  ['polaroid', 'film', 'frame', 'stamp', 'fourcut', 'filmstrip'].includes(photo.frame) || isTicketFrame(photo.frame) || (photo.frame === 'shape' && ['rect', 'round', 'circle', 'heart', 'star'].includes(photo.shape))
// 틀 색: 사용자가 고른 HEX. 예전 문서의 프리셋 id(white·cream…)도 읽는다.
const LEGACY_FRAME_COLORS = { white: '#FFFFFF', cream: '#FBF3E1', sky: '#D4D7ED', pink: '#F9DDE2', black: '#22262F' }
// 처음 색: 액자는 짙은 나무색, 티켓은 종류별 색, 인생네컷은 검정, 나머지(폴라로이드·우표·공연 티켓)는 흰색
const FRAME_DEFAULT_COLORS = { frame: '#6B5444', ticketCinema: '#FBE7A1', ticketMatch: '#DDEFE3', ticketBoarding: '#D6E6F5', fourcut: STRIP_DEFAULT_COLOR }
export const frameColorOf = (photo) =>
  photo.frameColor?.startsWith?.('#')
    ? photo.frameColor
    : LEGACY_FRAME_COLORS[photo.frameColor] ?? FRAME_DEFAULT_COLORS[photo.frame] ?? '#FFFFFF'

export function flipTransform(object) {
  // 반전 해제도 명시적인 기본 배율로 전달한다. undefined는 RN 속성 갱신에서
  // null로 바뀌어 개발 모드 processTransform의 배열 검사에서 실패할 수 있다.
  return [{ scaleX: object.flipX ? -1 : 1 }, { scaleY: object.flipY ? -1 : 1 }]
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
function PdfStickerContent({ object, width, height, zoom, ...props }) {
  const raster = usePdfPageRaster(object.pdfSource)
  return <View style={{ width, height }}>
    {!raster.pending && <>
      <StickerContent {...props} object={object} width={width} height={height} zoom={zoom} pdfUri={raster.uri} />
      <PdfDetail object={object} zoom={zoom} />
    </>}
  </View>
}

function StickerContent({ object, width, height, zoom, still, pdfUri, onAssetLoad, onAssetError }) {
  useStickerPacks() // 원격 스티커 팩이 늦게 들어오면 다시 그린다
  const outline = outlineOf(object)
  const shadow = shadowOf(object)
  const stroke = outline.on ? Math.max(0.75, outline.width * zoom) : 0
  const offset = shadowOffset(shadow)
  const blurSpread = shadow.blur * zoom * 0.45
  const box = { width, height }
  const uri = useMediaUri(object, { still })
  const originalSource = pdfUri ? { uri: pdfUri } : stickerSource(object, still, uri)
  const originalAnimated = !still && isAnimatedMedia(object)
  const synchronized = (Platform.OS === 'ios' || Platform.OS === 'android') && originalAnimated && (outline.on || shadow.on)
  const playback = useStickerPlayback(synchronized ? originalSource : null)
  const posterUri = useMediaUri(object, { still: true })
  // 준비 중에도 원본과 효과를 같은 첫 장면으로 표시한다. 출력(still)은 기존 경로를 쓴다.
  // Bundled GIFs have a PNG poster; do not fall back to an animated imported GIF.
  const fallback = object.asset || object.poster ? stickerSource(object, true, posterUri) : null
  // 원격 그림 스티커(팩의 PNG, builtin: 'remote:<팩>:<스티커>')는 그림 스티커와 같은 경로(MediaImage · 테두리 · 그림자 실루엣)로 그린다
  const packSticker = builtinStickerOf(object.builtin)
  const remoteImage = packSticker?.image ?? null
  const remoteUri = useRemoteAssetUri(remoteImage, onAssetError)
  const source = remoteImage ? (remoteUri ? { uri: remoteUri } : null) : synchronized ? playback.source ?? fallback : originalSource
  const animated = originalAnimated && !synchronized
  const builtin = remoteImage ? null : packSticker

  const silhouette = synchronized
    ? (key, color, dx, dy, opacity = 1) => ({ key, color, dx, dy, opacity })
    : builtin
    ? (key, color, dx, dy, opacity = 1) => (
        <BuiltinStickerArt
          key={key}
          sticker={builtin}
          tint={color}
          width={width}
          height={height}
          style={[styles.layer, { opacity, transform: [{ translateX: dx }, { translateY: dy }] }]}
        />
      )
    : source
    ? (key, color, dx, dy, opacity = 1) => (
        <MediaImage
          animated={animated}
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
  // 그림자 몸통: 테두리 바깥 끝 + 크기(spread)만큼 스티커를 키운 모양에서 시작한다.
  const grow = stroke + shadow.spread * zoom
  const body = grow > 0
    ? DIRECTIONS.map(([dx, dy], i) => silhouette(`sb${i}`, shadow.color, sx + dx * grow, sy + dy * grow, perLayer(shadow.opacity, EDGE_OVERLAP)))
    : [silhouette('sb', shadow.color, sx, sy, shadow.opacity)]
  // 흐림: 몸통 바깥으로 둥글게 더 옅은 그림자를 퍼뜨린다.
  const blurRing = blurSpread > 0.5
    ? DIRECTIONS.map(([dx, dy], i) =>
        silhouette(`sr${i}`, shadow.color, sx + dx * (grow + blurSpread), sy + dy * (grow + blurSpread), perLayer(shadow.opacity * 0.5, EDGE_OVERLAP)),
      )
    : []
  const shadowLayers = !shadow.on
    ? null
    : !source && !builtin
      ? silhouette('s', shadow.color, sx, sy, Math.min(1, shadow.opacity * 2), Math.max(1, grow + shadow.blur * zoom))
      : [...blurRing, ...body]

  const outlineLayers = outline.on && DIRECTIONS.map(([dx, dy], i) => silhouette(`o${i}`, outline.color, dx * stroke, dy * stroke))
  if (synchronized) return <View style={[styles.center, box, { transform: flipTransform(object) }]}>
    {source && <StickerFrame source={source} width={width} height={height}
      layers={[shadowLayers, outlineLayers].flat().filter(Boolean)} />}
    {playback.error && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 11 }}>움직이는 효과를 불러오지 못했어요.</Text>}
  </View>

  return (
    <View style={[styles.center, box, { transform: flipTransform(object) }]}>
      {shadowLayers}
      {outlineLayers}
      {builtin ? (
        // View 로 감싼다: 웹의 <svg> 는 위치 지정 요소가 아니라서 그대로 두면 테두리 · 그림자 층 아래로 깔린다
        <View style={box}><BuiltinStickerArt sticker={builtin} width={width} height={height} /></View>
      ) : source ? (
        <MediaImage animated={animated} onLoad={onAssetLoad} onError={() => { if (!synchronized && !remoteImage) reportMediaDisplayError(object); onAssetError?.() }}
          source={source} style={box} resizeMode={isBackdrop(object) ? 'stretch' : 'contain'} />
      ) : (
        <Text style={[styles.emoji, emojiText(height)]}>{object.emoji}</Text>
      )}
      {synchronized && playback.error && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 11 }}>움직이는 효과를 불러오지 못했어요.</Text>}
    </View>
  )
}

const emojiText = (height) => ({ fontSize: height * 0.72, lineHeight: height })

/* ---------- 사진 ---------- */

// still: 페이지 썸네일처럼 움직일 필요 없는 곳에서는 GIF 대신 첫 장면을 그린다.
export function PhotoContent({ photo, zoom, still = false, onAssetLoad, onAssetError }) {
  const uri = useMediaUri(photo, { still })
  const animated = !still && isAnimatedMedia(photo)
  // 하트 · 별 같은 모양 틀은 SVG 이미지로 자른다 — SVG 이미지에는 GIF 를 넘기면 안 된다(useSvgImageUri)
  const pathShaped = photo.frame === 'shape' && VIEW_CLIP_SHAPES[photo.shape] == null
  const svgUri = useSvgImageUri(pathShaped ? photo : null)
  const clipInstance = useSvgId('photo-clip')
  const clipId = `${clipInstance}-${photo.shape ?? 'rect'}`
  const inner = photoInnerBox(photo)
  const box = { width: inner.width * zoom, height: inner.height * zoom }
  const layout = coverLayout(photo, box.width, box.height)
  const flip = flipTransform(photo)
  const outline = outlineOf(photo)
  const shadow = { ...shadowOf(photo), on: shadowOf(photo).on && photoSupportsShadow(photo) }
  const border = outline.on ? Math.max(0.75, outline.width * zoom) : 0

  // 사각·라운드·원형은 View 로 잘라 그린다. RN Image·expo-image(GIF) 라서 GIF 도 움직인다. (SVG 이미지는 첫 장면만 나옴)
  // resizeMethod="scale": Android 는 기본값(auto)이면 처음 놓인 크기로 줄여 풀고, 사진을 키우거나 확대해도 다시 풀지 않아 흐려진다.
  // 표시본(긴 변 3072px)을 그대로 풀어 두고 화면 크기에 맞춰 그리게 한다. (iOS·웹은 이 값을 쓰지 않는다)
  if (photo.frame === 'shape' && VIEW_CLIP_SHAPES[photo.shape] != null) {
    const shapeStyle = {
      width: box.width,
      height: box.height,
      borderRadius: photo.shape === 'circle' ? '50%' : Math.min(box.width, box.height) * photoCornerRadius(photo),
    }
    return (
      // 그림자는 잘라 내지 않는 바깥 View 에, 사진은 안쪽 View 에서 자른다.
      <View style={[shapeStyle, boxShadowStyle(shadow, zoom)]}>
        <View style={[styles.shapeClip, shapeStyle, { borderWidth: border, borderColor: outline.color, transform: flip }]}>
          <MediaImage animated={animated} onLoad={onAssetLoad} onError={() => { reportMediaDisplayError(photo); onAssetError?.() }} source={uri ? { uri } : null} style={[styles.photoImage, shiftForBorder(layout, border)]} resizeMode="stretch" resizeMethod="scale" />
          {shadow.inset && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: shapeStyle.borderRadius }, insetShadowStyle(shadow, zoom)]} />}
        </View>
      </View>
    )
  }

  if (photo.frame === 'shape') {
    const d = shapePath(photo.shape, box.width, box.height)
    return (
      <View style={{ width: box.width, height: box.height }}>
      {!shadow.inset && <PhotoPathShadow d={d} width={box.width} height={box.height} shadow={shadow} zoom={zoom} flipX={photo.flipX} flipY={photo.flipY} />}
      {/* 네이티브 SVG의 이전 clip 참조가 남지 않게 모양 전환 시 정의와 이미지를 함께 재생성한다. */}
      <Svg key={photo.shape} width={box.width} height={box.height} style={{ transform: flip }}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={d} />
          </ClipPath>
        </Defs>
        <SvgImage
          onLoad={onAssetLoad} onError={() => { reportMediaDisplayError(photo); onAssetError?.() }}
          href={svgUri ? { uri: svgUri } : undefined}
          x={layout.left}
          y={layout.top}
          width={layout.width}
          height={layout.height}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
        />
        {border > 0 && <Path d={d} fill="none" stroke={outline.color} strokeWidth={border * 2} />}
      </Svg>
      {shadow.inset && <PhotoPathShadow d={d} width={box.width} height={box.height} shadow={shadow} zoom={zoom} flipX={photo.flipX} flipY={photo.flipY} />}
      </View>
    )
  }

  // 여백 있는 틀: 폴라로이드는 단색 판, 필름·우표·액자는 SVG 바탕 위에 사진을 얹는다.
  const frameW = photo.w * zoom
  const frameH = photo.h * zoom
  return (
    <View
      style={[{ width: frameW, height: frameH }, photo.frame !== 'stamp' && boxShadowStyle(shadow, zoom)]}
    >
      {photo.frame === 'stamp' && !shadow.inset && <PhotoPathShadow d={stampPath(frameW, frameH)} width={frameW} height={frameH} shadow={shadow} zoom={zoom} />}
      {/* 폴라로이드 판도 바탕이 그린다. 바깥 선과 같은 모양이라 양옆 가장자리가 같게 보인다 */}
      <FrameBackdrop
        frame={photo.frame}
        width={frameW}
        height={frameH}
        inner={{ left: inner.left * zoom, top: inner.top * zoom, width: box.width, height: box.height }}
        color={frameColorOf(photo)}
        text={photo.frameText}
      />
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
        {/* 사진 없이 붙인 틀은 빈 자리 색만 (캔버스에서는 + 로 채운다) */}
        {hasPhotoMedia(photo)
          ? <MediaImage animated={animated} onLoad={onAssetLoad} onError={() => { reportMediaDisplayError(photo); onAssetError?.() }} source={uri ? { uri } : null} style={[styles.photoImage, layout]} resizeMode="stretch" resizeMethod="scale" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: emptySlotColor(photo.frame === 'film' || isDarkColor(frameColorOf(photo))) }]} />}
        {/* 안쪽 그림자: 틀 안 사진이 오목하게 들어가 보이게 */}
        {shadow.inset && photo.frame !== 'stamp' && <View pointerEvents="none" style={[StyleSheet.absoluteFill, insetShadowStyle(shadow, zoom)]} />}
      </View>
      {photo.frame === 'stamp' && shadow.inset && <PhotoPathShadow d={stampPath(frameW, frameH)} width={frameW} height={frameH} shadow={shadow} zoom={zoom} />}
    </View>
  )
}

/**
 * 여러 칸 틀(인생네컷 · 필름 4컷). 바탕 위 칸마다 사진을 꽉 채워(cover) 넣는다. 빈 칸은 바탕의 빈 칸 색이 보인다.
 * 칸 사진은 늘 첫 장면으로 그리고(GIF 도), 사진이 있는 칸이 모두 그려지면 onAssetLoad 를 한 번 알린다(내보내기 대기).
 */
export function PhotoStripContent({ photo, zoom, onAssetLoad, onAssetError }) {
  const loaded = useRef(new Set())
  const width = photo.w * zoom
  const height = photo.h * zoom
  const boxes = stripCellBoxes(photo).map((b) => ({ left: b.left * zoom, top: b.top * zoom, width: b.width * zoom, height: b.height * zoom }))
  const filled = (photo.cells ?? []).filter(Boolean).length
  const shadow = shadowOf(photo)
  const cellLoaded = (index) => {
    loaded.current.add(index)
    if (loaded.current.size === filled) onAssetLoad?.()
  }
  return (
    <View style={[{ width, height }, boxShadowStyle(shadow, zoom)]}>
      <StripBackdrop frame={photo.frame} width={width} height={height} cells={boxes} color={frameColorOf(photo)} text={photo.frameText} />
      {boxes.map((box, i) => photo.cells?.[i] && (
        <StripCell key={i} cell={photo.cells[i]} box={box} flip={flipTransform(photo)} shadow={shadow} zoom={zoom}
          onLoad={() => cellLoaded(i)} onError={() => { reportMediaDisplayError(photo.cells[i]); onAssetError?.() }} />
      ))}
    </View>
  )
}

function StripCell({ cell, box, flip, shadow, zoom, onLoad, onError }) {
  const uri = useMediaUri(cell, { still: true })
  const layout = coverLayout(cell, box.width, box.height)
  return (
    <View style={[styles.photoInner, { ...box, transform: flip }]}>
      <MediaImage onLoad={onLoad} onError={onError} source={uri ? { uri } : null} style={[styles.photoImage, layout]} resizeMode="stretch" resizeMethod="scale" />
      {shadow.inset && <View pointerEvents="none" style={[StyleSheet.absoluteFill, insetShadowStyle(shadow, zoom)]} />}
    </View>
  )
}

// 모서리 반경 = 짧은 변 × 비율 (shapes.js 의 round 반경과 같게). 원형은 늘려도 타원이 되도록 50%
const VIEW_CLIP_SHAPES = { rect: 0, round: 0.14, circle: 0.5 }

/** 사각·라운드 사진의 모서리 둥글기 (짧은 변 대비 0~0.5). 옵션의 '모서리 둥글기'로 바꾼 값이 있으면 그 값 */
export function photoCornerRadius(photo) {
  return photo.radius ?? VIEW_CLIP_SHAPES[photo.shape] ?? 0
}

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
