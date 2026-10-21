import { memo } from 'react'
import { StyleSheet } from 'react-native'
import Svg, { Defs, Line, Path, Pattern, Rect } from 'react-native-svg'
import { useSvgId } from '../../utils/svgId'

/**
 * 격자·보조선 표시 설정. 편집 화면에만 그리고 저장·내보내기·썸네일에는 넣지 않는다.
 * - grid: 'none' | 'lines'(모눈)  — GoodNotes 의 모눈 종이, Procreate 그리기 가이드의 격자처럼
 * - spacing: 격자 간격(페이지 좌표)
 * - center: 가운데 십자선 (PowerPoint·Keynote 의 가운데 안내선)
 * - thirds: 3등분선 (사진·카메라 앱의 구도선)
 * - margin: 여백선 (Canva 의 여백 표시처럼 가장자리에서 MARGIN 만큼 안쪽)
 */
export const GRID_SPACINGS = [
  { id: 'narrow', label: '좁게', value: 16 },
  { id: 'normal', label: '보통', value: 32 },
  { id: 'wide', label: '넓게', value: 64 },
]
export const DEFAULT_GUIDES = { grid: 'none', spacing: 'normal', center: false, thirds: false, margin: false }
export const hasGuides = (guides) => guides.grid !== 'none' || guides.center || guides.thirds || guides.margin

const MARGIN = 48
// 불투명 색으로 그린다. 반투명이면 가로·세로 선이 겹치는 교차점이 진하게 보였다 (흰 바탕 위 rgba(110,146,198,0.32) 와 같은 색)
const GRID_COLOR = '#DCE5F1'
const GUIDE_COLOR = 'rgba(232,93,140,0.7)'

/**
 * 격자(layer="grid")는 요소 아래, 보조선(layer="guides")은 요소 위에 그린다.
 * 격자는 무늬(Pattern) 하나로 채워서 간격이 좁아도 그림 요소가 늘지 않는다.
 */
function GridOverlay({ guides, layer, width, height, zoom }) {
  const patternId = useSvgId('grid')
  const w = width * zoom
  const h = height * zoom
  if (layer === 'grid') {
    if (guides.grid === 'none') return null
    const step = (GRID_SPACINGS.find((s) => s.id === guides.spacing) ?? GRID_SPACINGS[1]).value * zoom
    // 가로·세로 선 하나씩이 페이지 한가운데를 지나도록 무늬 시작점을 옮긴다 (양쪽 여백이 같아진다)
    const ox = (w / 2 - 0.5 + step) % step
    const oy = (h / 2 - 0.5 + step) % step
    // 맨 왼쪽·맨 위에 오는 선(가장자리에 붙은 선) 한 줄의 위치. 무늬는 왼쪽·위로도 이어지므로 0 근처까지 당겨 구한다.
    const firstX = ox - step * Math.floor((ox + 1) / step)
    const firstY = oy - step * Math.floor((oy + 1) / step)
    return (
      <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* 세로선·가로선을 따로 채워, 맨 왼쪽 세로선과 맨 위 가로선 한 줄씩만 빼고 그린다 (가장자리에 붙어 보여서).
            선은 칸 안쪽(0.5px)에 그려 칸 경계에서 반쯤 잘리지 않게 한다. */}
        <Defs>
          <Pattern id={`${patternId}-v`} patternUnits="userSpaceOnUse" x={ox} y={0} width={step} height={h}>
            <Path d={`M 0.5 0 V ${h}`} fill="none" stroke={GRID_COLOR} strokeWidth={1} />
          </Pattern>
          <Pattern id={`${patternId}-h`} patternUnits="userSpaceOnUse" x={0} y={oy} width={w} height={step}>
            <Path d={`M 0 0.5 H ${w}`} fill="none" stroke={GRID_COLOR} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect x={firstX + 1} width={Math.max(0, w - firstX - 1)} height={h} fill={`url(#${patternId}-v)`} />
        <Rect y={firstY + 1} width={w} height={Math.max(0, h - firstY - 1)} fill={`url(#${patternId}-h)`} />
      </Svg>
    )
  }
  if (!guides.center && !guides.thirds && !guides.margin) return null
  const dash = [6, 5]
  const line = (key, x1, y1, x2, y2) => <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GUIDE_COLOR} strokeWidth={1} strokeDasharray={dash} />
  const m = MARGIN * zoom
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      {guides.center && [line('cx', w / 2, 0, w / 2, h), line('cy', 0, h / 2, w, h / 2)]}
      {guides.thirds && [1, 2].flatMap((k) => [line(`tx${k}`, (w * k) / 3, 0, (w * k) / 3, h), line(`ty${k}`, 0, (h * k) / 3, w, (h * k) / 3)])}
      {guides.margin && <Rect x={m} y={m} width={w - m * 2} height={h - m * 2} fill="none" stroke={GUIDE_COLOR} strokeWidth={1} strokeDasharray={dash} />}
    </Svg>
  )
}

export default memo(GridOverlay)
