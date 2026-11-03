import { useMemo } from 'react'
import { ClipPath, Defs, G, Path, Pattern } from 'react-native-svg'
import { DUST_PATTERN, EDGE_PATTERN, GRAPHITE_VIEWBOX, PAPER_PATTERNS, PAPER_TONE, PENCIL_TILE, paperClass, paperPatternIndex } from '../utils/pencilTexture'
import { pencilBodies, pencilLayerPaths, pencilLook, pencilPreviewPaths } from '../utils/pencilStroke'
import { penMaterialSeed } from '../utils/penMaterials'

// 페이지 좌표에 고정된 타일 무늬. 몸통은 불투명 흑연 면 − 종이 결 구멍(evenodd), 테두리 · 얼룩 · 가루는 알갱이 · 덩어리만.
// origin: 무늬를 획의 첫 점에 맞춘다(그리는 중은 페이지 좌표, 저장 획은 요소 좌표의 같은 점). 요소 상자 원점이나 페이지 원점에 맞추면
//   손을 뗄 때 결이 밀리거나, 요소 위치가 화면 픽셀에 반올림되며 알갱이가 반 픽셀씩 어긋나 반짝였다(태블릿 확인).
// detail: 안드로이드는 무늬 한 타일을 '타일 크기 × 화면 밀도' 픽셀의 작은 비트맵으로 그려 늘린다. 12 단위 타일이면 약 21px 이라
//   작은 구멍이 각진 흰 네모로 커졌다. 타일을 detail 배 크게 그린 뒤 같은 배율로 줄여 해상도를 올린다.
function TilePattern({ id, d, tones, color, tile = PENCIL_TILE, viewBox = GRAPHITE_VIEWBOX, evenOdd = false, origin, detail }) {
  return <Pattern id={id} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse"
    width={tile * detail} height={tile * detail} viewBox={`0 0 ${viewBox} ${viewBox}`}
    patternTransform={`translate(${origin.x} ${origin.y}) scale(${1 / detail})`}>
    {d ? <Path d={d} fill={color} fillRule={evenOdd ? 'evenodd' : 'nonzero'} /> : null}
    {/* 알갱이마다 진하기가 다르다: [d, 불투명도] 목록 */}
    {tones?.map(([path, opacity], i) => path ? <Path key={i} d={path} fill={color} fillOpacity={opacity} fillRule={i === 0 && evenOdd ? 'evenodd' : 'nonzero'} /> : null)}
  </Pattern>
}
// 배율은 몇 단계로만 바꿔(확대할 때마다 무늬를 새로 굽지 않게) 2 · 3 · 4 중 하나. 안드로이드는 그릴 때마다 이 크기 비트맵을 새로 만든다.
export const pencilDetail = zoom => (zoom ?? 1) < 0.9 ? 2 : (zoom ?? 1) < 1.6 ? 3 : 4

// 필기 미리보기(parts) · 저장된 캔버스 · 썸네일 · 내보내기(object)가 함께 쓰는 연필 획(pencilStroke).
// 겹: 바깥 가루(옅게) → 테두리 알갱이 띠 → 몸통(불투명 알갱이, 종이 결 구멍. 굵으면 폭이 다른 세 겹). 알갱이가 불투명이라 펜 불투명도 100이면 비치지 않는다.
export default function PencilStrokeContent({ grainId, object, parts, width, dotWidth, color, seed, zoom = 1 }) {
  const paths = useMemo(() => object ? pencilLayerPaths(object, dotWidth) : pencilPreviewPaths(parts, width, dotWidth),
    [object, parts, width, dotWidth])
  const look = pencilLook(width), phase = paperPatternIndex(seed ?? penMaterialSeed(object?.id ?? ''))
  // 겹마다 다른 위상의 종이 결을 써야 쌓일 때 구멍이 메워진다. 가는 연필의 안쪽 겹은 거의 꽉 찬 결(굵기 등급별)
  const papers = pencilBodies(width).map((layer, i) => {
    const set = PAPER_PATTERNS[layer?.paper === 'fine' ? paperClass(width) : 'tooth']
    return set[(phase + i) % set.length]
  })
  const first = object ? object.grainOrigin ?? object.points[0] : parts[0]?.points[0]
  const tile = { color, origin: { x: first?.x ?? 0, y: first?.y ?? 0 }, detail: pencilDetail(zoom) }
  return <>
    <Defs>
      {papers.map((paper, i) => paths[i] ? <TilePattern key={i} id={`${grainId}-paper${i}`} evenOdd {...tile}
        tones={[[paper.base, PAPER_TONE.base], [paper.half, PAPER_TONE.half], [paper.dark, PAPER_TONE.dark]]} /> : null)}
      {paths[3] ? <TilePattern id={`${grainId}-edge`} tones={[[EDGE_PATTERN.strong, 1], [EDGE_PATTERN.light, 0.5]]} {...tile} /> : null}
      <TilePattern id={`${grainId}-dust`} d={DUST_PATTERN} {...tile} />
      {paths[5] ? <ClipPath id={`${grainId}-scratch`}><Path d={`M-100000 -100000H100000V100000H-100000Z${paths[5]}`} clipRule="evenodd" /></ClipPath> : null}
    </Defs>
    <Path d={paths[4]} fill={`url(#${grainId}-dust)`} fillOpacity={look.dustOpacity} fillRule="nonzero" />
    {/* 굵은 연필의 획 방향 긁힘: 테두리 · 몸통 세 겹을 같은 슬롯으로 함께 잘라낸다(evenodd: 큰 사각 − 슬롯) */}
    <G clipPath={paths[5] ? `url(#${grainId}-scratch)` : undefined}>
      {paths[3] ? <Path d={paths[3]} fill={`url(#${grainId}-edge)`} fillRule="nonzero" /> : null}
      {[0, 1, 2].map(i => paths[i] ? <Path key={i} d={paths[i]} fill={`url(#${grainId}-paper${i})`} fillRule="nonzero" /> : null)}
    </G>
  </>
}
