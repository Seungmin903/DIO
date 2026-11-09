import { useId } from 'react'
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg'
import { packingLayout } from '../../templates/packingLayout.js'
import { pageSize } from '../../utils/pageGeometry.js'

const rounded = ({ x, y, width: w, height: h, rx: r }) => `M${x+r} ${y}H${x+w-r}A${r} ${r} 0 0 1 ${x+w} ${y+r}V${y+h-r}A${r} ${r} 0 0 1 ${x+w-r} ${y+h}H${x+r}A${r} ${r} 0 0 1 ${x} ${y+h-r}V${y+r}A${r} ${r} 0 0 1 ${x+r} ${y}Z`

// 색상은 기존 캔버스 요소로 저장해 서버·기기 복원 경로에서 보존한다.
export function PackingColorLayer({ page, zoom }) {
  const layout = packingLayout(page.backgroundAssetId)
  if (!layout) return null
  const colors = Object.fromEntries(page.objects.filter(o => o.packingColorRegion && !o.hidden).map(o => [o.packingColorRegion, o.fill]))
  const { width, height } = pageSize(page)
  return <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
    <G transform={`translate(${layout.origin.x} ${layout.origin.y}) scale(${layout.scaleX ?? 1} ${layout.scaleY ?? 1})`}>
      {layout.cases.map((outer, i) => colors[`case-${i}`] && <Path key={`case-${i}`} d={`${rounded(outer)} ${rounded(layout.interiors[i])}`} fill={colors[`case-${i}`]} fillRule="evenodd" />)}
      {layout.interiors.map((box, i) => colors[`interior-${i}`] && <Rect key={`inside-${i}`} {...box} fill={colors[`interior-${i}`]} />)}
    </G>
  </Svg>
}

// 수납 요소 위에는 테두리, 고정 끈과 그물만 다시 그린다.
export function PackingFrontLayer({ page, zoom }) {
  const clipId = `packing-mesh-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const layout = packingLayout(page.backgroundAssetId)
  if (!layout) return null
  const { width, height } = pageSize(page)
  const portrait = page.backgroundAssetId.endsWith('portrait')
  const beltY = portrait ? 198.45 : 258.3
  const beltRight = portrait ? 294 : 242
  const buckleX = portrait ? 136.5 : 110.5
  const left = layout.interiors[0], cx = left.x + left.width / 2, cy = left.y + left.height / 2
  const strapPath = `M${left.x + 10} ${left.y + 10} L${cx} ${cy - 30} L${cx} ${cy + 30} L${left.x + 10} ${left.y + left.height - 10} M${left.x + left.width - 10} ${left.y + 10} L${cx} ${cy - 30} M${cx} ${cy + 30} L${left.x + left.width - 10} ${left.y + left.height - 10}`
  const lines = Array.from({ length: 110 }, (_, i) => {
    const x = i * 18 - 600
    return `M${x} 0l600 600 M${x} 600l600 -600`
  }).join(' ')
  return <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
    <Defs><ClipPath id={clipId}><Path d={layout.mesh} /></ClipPath></Defs>
    <G transform={`translate(${layout.origin.x} ${layout.origin.y}) scale(${layout.scaleX ?? 1} ${layout.scaleY ?? 1})`}>
      {layout.cases.map((box, i) => <Rect key={`outer-${i}`} {...box} fill="none" stroke="#666666" strokeWidth={layout.outlineWidth ?? 1.8} />)}
      {layout.interiors.map((box, i) => <Rect key={i} {...box} fill="none" stroke="#666666" strokeWidth={layout.outlineWidth ?? 1.2} />)}
      {layout.detailed ? <>
        {layout.interiors.map((box, i) => <Rect key={`depth-${i}`} x={box.x + 5} y={box.y + 5} width={box.width - 10} height={box.height - 10} rx={Math.max(1, box.rx - 4)} fill="none" stroke="#d1d2d6" strokeWidth="5" />)}
        {layout.buckleV2 ? <>
          <Path d={strapPath} fill="none" stroke="#74767b" strokeWidth="14" strokeLinejoin="round" />
          <Path d={strapPath} fill="none" stroke="#e2e3e5" strokeWidth="10" strokeLinejoin="round" />
          <Rect x={cx - 8} y={cy - 10} width="16" height="20" rx="3" fill="#777a80" stroke="#595c61" strokeWidth="1.3" />
          <Path d={`M${cx-5} ${cy-3}H${cx+5} M${cx-5} ${cy+4}H${cx+5}`} stroke="#f0f0f1" strokeWidth="1.5" />
        </> : <>
        <Path d={`M${layout.interiors[0].x + 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + layout.interiors[0].height - 10} M${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + 10} ${layout.interiors[0].y + layout.interiors[0].height - 10}`} fill="none" stroke="#74767b" strokeWidth="13" />
        <Path d={`M${layout.interiors[0].x + 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + layout.interiors[0].height - 10} M${layout.interiors[0].x + layout.interiors[0].width - 10} ${layout.interiors[0].y + 10} L${layout.interiors[0].x + 10} ${layout.interiors[0].y + layout.interiors[0].height - 10}`} fill="none" stroke="#e2e3e5" strokeWidth="9" />
        <Rect x={layout.interiors[0].x + layout.interiors[0].width / 2 - 13} y={layout.interiors[0].y + layout.interiors[0].height / 2 - 12} width="26" height="24" rx="5" fill="#ffffff" stroke="#666666" strokeWidth="1.5" />
        <Rect x={layout.interiors[0].x + layout.interiors[0].width / 2 - 6} y={layout.interiors[0].y + layout.interiors[0].height / 2 - 5} width="12" height="10" rx="2" fill="none" stroke="#888888" strokeWidth="1" />
        </>}
      </> : <>
      <Path d={`M16 ${beltY}H${beltRight}`} fill="none" stroke="#666666" strokeWidth="21" />
      <Path d={`M16 ${beltY}H${beltRight}`} fill="none" stroke="#e8e9eb" strokeWidth="18" />
      <Rect x={buckleX} y={beltY - 17} width="36" height="34" rx="7" fill="#ffffff" stroke="#666666" strokeWidth="1.8" />
      <Rect x={buckleX + 9} y={beltY - 7} width="18" height="14" rx="3" fill="#ffffff" stroke="#666666" strokeWidth="1.8" />
      </>}
      <Path d={lines} stroke="#bfc1c4" strokeWidth="0.8" fill="none" clipPath={`url(#${clipId})`} />
      {layout.detailed && <>
        <Rect x={layout.interiors[1].x + 5} y={layout.interiors[1].y + 5} width={layout.interiors[1].width - 10} height={layout.interiors[1].height - 10} rx={Math.max(1, layout.interiors[1].rx - 4)} fill="none" stroke="#92949a" strokeWidth="2" strokeDasharray="3 2" />
        {layout.buckleV2 ? <G transform={`translate(${layout.interiors[1].x + layout.interiors[1].width - 22} ${layout.interiors[1].y + 13})`}>
          <Rect x="0" y="0" width="11" height="8" rx="3" fill="#777a80" stroke="#56595d" strokeWidth="1" />
          <Path d="M2 6 L9 6 L12 29 Q12 34 5.5 34 Q-1 34 -1 29 Z" fill="#eceef0" stroke="#707378" strokeWidth="1.3" />
          <Circle cx="5.5" cy="27" r="3.2" fill="#7c8084" stroke="#5f6367" strokeWidth="0.8" />
          <Path d="M3 9 L4 21" stroke="#ffffff" strokeWidth="1" />
        </G> : <Rect x={layout.interiors[1].x + layout.interiors[1].width - 19} y={layout.interiors[1].y + 12} width="10" height="20" rx="3" fill="#fafafa" stroke="#777777" strokeWidth="1.2" />}
      </>}
    </G>
  </Svg>
}
