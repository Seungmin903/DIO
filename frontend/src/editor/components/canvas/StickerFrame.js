import Svg, { Defs, G, Image, Mask, Rect, Use } from 'react-native-svg'
import { useSvgId } from '../../utils/svgId'

/** One decoded bitmap per frame: body and alpha masks reference this exact node.
 * Separate native Image views can display different frames during async loading.
 */
export default function StickerFrame({ source, width, height, layers }) {
  const id = useSvgId('sticker-frame')
  const mask = `${id}-alpha`
  const pad = Math.ceil(Math.max(0, ...layers.flatMap(layer => [Math.abs(layer.dx), Math.abs(layer.dy)]))) + 2
  return <Svg pointerEvents="none" width={width + pad * 2} height={height + pad * 2}
    viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
    style={{ position: 'absolute', left: -pad, top: -pad }}>
    <Defs>
      <Image id={id} href={source} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid meet" />
      <Mask id={mask} maskType="alpha" maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
        <Use href={`#${id}`} />
      </Mask>
    </Defs>
    {layers.map(layer => <G key={layer.key} transform={`translate(${layer.dx} ${layer.dy})`} opacity={layer.opacity}>
      <Rect x={0} y={0} width={width} height={height} fill={layer.color} mask={`url(#${mask})`} />
    </G>)}
    <Use href={`#${id}`} />
  </Svg>
}
