import { memo } from 'react'
import Svg, { Ellipse, G, Path } from 'react-native-svg'
import { INK_RECORD_BOTTLES } from '../../templates/inkRecordBottles.js'
import { inkRecordLayout } from '../../templates/inkRecordLayout.js'
import { normalizePaperAppearance, paperLayoutColor } from '../../templates/appearance.js'
import { pageSize } from '../../utils/pageGeometry.js'

// 속지가 병을 그릴 때 쓰는 색(scripts/generate-ink-record-paper.mjs 의 FRAME)
const FRAME = '#aeb3b8'

/**
 * 발색 기록 속지의 **병 윤곽만** 획 위에 한 겹 더 올린다(사용자 2026-11-11:
 * "속지 병 안에 획 그으면 병 윤곽이 내가 그은 획보다 위이게 해줘").
 * 잉크병 메모(StaticPage 의 overTop)와 같은 생각이다 — 선이 위에 있어야 칠한 잉크가
 * 병 **안에** 들어간 것처럼 보인다. 속지 자체(종이 · 이름 · 값 줄)는 제자리(아래)에 그대로 있다.
 *
 * 그림은 scripts/generate-ink-record-bottles.mjs 가 **속지를 그리는 그 코드에서** 뽑아 둔
 * INK_RECORD_BOTTLES[shape].draw 다. 두 벌이 되지 않으므로 속지에 찍힌 선과 한 치도 어긋나지 않는다.
 */
export function InkRecordFrontLayer({ page, zoom }) {
  if (!inkRecordLayout(page?.backgroundAssetId)) return null
  const { width, height } = pageSize(page)
  // 속지 색은 colorTemplateAst 가 옮긴다. 이 층은 속지 밖이라 같은 규칙을 직접 거쳐야 색이 맞는다.
  const stroke = paperLayoutColor(FRAME, normalizePaperAppearance(page.paperAppearance))
  return <InkRecordFrontSvg assetId={page.backgroundAssetId} width={width} height={height} zoom={zoom} stroke={stroke} />
}

// 페이지(요소 목록)가 아니라 속지 · 크기 · 배율 · 색만 받는다 — 획을 하나 그을 때마다 다시 그리지 않게.
const InkRecordFrontSvg = memo(function InkRecordFrontSvg({ assetId, width, height, zoom, stroke }) {
  const layout = inkRecordLayout(assetId)
  const art = INK_RECORD_BOTTLES[layout.shape].draw
  const common = { fill: 'none', stroke, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}
    width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
    {layout.cells.map((cell, index) => {
      // 그림은 높이 1000 으로 떠 있다. 칸의 병 높이에 맞춰 줄이면 선 굵기도 같은 비율로 줄어
      // 속지에 찍힌 병과 똑같아진다. 자리는 속지가 병을 앉히는 식(place: 왼쪽 위 - box 원점)과 같다.
      const k = cell.bottleHeight / art.height
      const tx = cell.bottle.x - art.box[0] * k, ty = cell.bottle.y - art.box[1] * k
      return <G key={index} transform={`translate(${tx} ${ty}) scale(${k})`}>
        {art.parts.map((part, i) => <Shape key={`p${i}`} part={part} {...common} strokeWidth={art.sw} />)}
        {art.thin.map((part, i) => <Shape key={`t${i}`} part={part} {...common} strokeWidth={art.thinSw} />)}
      </G>
    })}
  </Svg>
})

const Shape = ({ part, ...props }) => part.ellipse
  ? <Ellipse cx={part.ellipse[0]} cy={part.ellipse[1]} rx={part.ellipse[2]} ry={part.ellipse[3]} {...props} />
  : <Path d={part.d} {...props} />

export default InkRecordFrontLayer
