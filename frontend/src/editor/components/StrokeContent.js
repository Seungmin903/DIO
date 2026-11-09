import { useMemo } from 'react'
import Svg, { Path } from 'react-native-svg'
import { strokeOutline, strokePath } from '../utils/strokes'
import PencilStrokeContent from './PencilStrokeContent'
import PencilSkiaStroke from './PencilSkiaStroke'
import { isSkiaPencil, pencilBakesOpacity } from '../skia/pencilRaster.js'
import InkStrokeContent from './InkStrokeContent'
import FeltStrokeContent from './FeltStrokeContent'
import NibStrokeContent from './NibStrokeContent'
import { ballVaries, isNibKind } from '../utils/nibStroke'
import { useSvgId } from '../utils/svgId'
import { HIGHLIGHTER_OPACITY } from '../utils/penSettings'
import { isDashedKind, dashedObjectContour } from '../utils/dashedStroke'

export default function StrokeContent({ object, zoom, transform, areaPreview = false, onAssetLoad, showFallbackWhileLoading = false }) {
  const grainId = useSvgId('pencil-grain')
  const { points, penKind: kind, strokeWidth: width, color } = object
  const dashed = useMemo(() => isDashedKind(kind) ? dashedObjectContour(object) : '', [object])
  const variable = kind === 'fountain' || kind === 'brush' || (kind === 'ball' && ballVaries(points))
  const modern = object.renderVersion === 2 || object.renderVersion === 3
  const outline = useMemo(() => variable && !modern && points.length > 1
    ? strokeOutline(points, width, object.eraserCaps)
    : '', [points, width, kind, variable, modern, object.eraserCaps])
  const materialPath = modern && (variable || kind === 'felt')
  // 지우개 조각(sampled)은 이미 곡선 표본이라 그대로 잇는다(다시 곡선으로 펴면 지울 때마다 미세하게 흔들린다)
  const path = useMemo(() => outline || materialPath ? '' : object.sampled && points.length > 1 ? points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('') : strokePath(points),
    [points, outline, materialPath, object.sampled])
  const pencil = kind === 'pencil'
  const highlighter = kind === 'highlighter'
  const dotWidth = width * (points[0]?.pressure ?? 1)
  const svg = <Svg width={object.w * zoom} height={object.h * zoom} viewBox={`0 0 ${object.baseWidth} ${object.baseHeight}`} preserveAspectRatio="none" style={{ opacity: pencilBakesOpacity(object) ? object.opacity ?? 1 : undefined, transform }}>
    {isDashedKind(kind) ? <Path d={dashed} fill={color} />
      : isNibKind(kind) ? <NibStrokeContent object={object} color={color} />
      : modern && kind === 'felt' ? <FeltStrokeContent object={object} points={points} width={width} color={color} renderVersion={object.renderVersion} materialSeed={object.materialSeed} />
      : modern && variable ? <InkStrokeContent object={kind === 'ball' ? undefined : object} areaPreview={areaPreview} points={points} width={width} kind={kind} color={color} startDistance={object.inkStartDistance ?? 0} renderVersion={object.renderVersion} />
      : modern && pencil ? <PencilStrokeContent grainId={grainId} object={object} width={width} dotWidth={dotWidth} color={color} seed={object.materialSeed} zoom={zoom} />
      : highlighter ? <Path d={path} fill="none" stroke={color} strokeWidth={width} strokeOpacity={HIGHLIGHTER_OPACITY}
      strokeLinecap={object.lineCap === 'square' ? 'square' : 'round'} strokeLinejoin="round" />
      : outline ? <Path d={outline} fillRule="nonzero" fill={color} /> : <Path d={path} fill="none" stroke={color}
      strokeWidth={points.length === 1 ? dotWidth : width * (pencil ? 0.85 : 1)}
      strokeOpacity={!modern && pencil ? 0.65 : 1} strokeDasharray={!modern && pencil ? [1.5, 0.5] : undefined}
      strokeLinecap="round" strokeLinejoin="round" />}
  </Svg>
  // 연필은 앱과 같은 Skia 그림으로(웹 · 썸네일 · 내보내기). 준비 전 · 실패는 위 SVG 그대로(래퍼가 불투명도를 안 곱하므로 SVG 가 스스로)
  return isSkiaPencil(object) ? <PencilSkiaStroke object={object} zoom={zoom} transform={transform} fallback={svg} onAssetLoad={onAssetLoad} showFallbackWhileLoading={showFallbackWhileLoading} /> : svg
}
