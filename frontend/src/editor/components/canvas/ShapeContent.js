import { Platform, Text, View } from 'react-native'
import Svg, { Defs, Filter, FeGaussianBlur, G, Path, SvgXml } from 'react-native-svg'
import { useTextFont } from '../../hooks/useTextFont'
import { richTextSegments, segmentTextStyle } from '../../utils/textFormats'
import { textSettings } from '../../utils/text'
import { shadowOf, shadowOffset } from '../../utils/effects'
import { useSvgId } from '../../utils/svgId'
import { hairline } from '../../../shared/pixelSnap'
import { memoArtOf, shapeDefinition, shapeTextStyle, shapeBorderDash, shapeTextBox } from '../../utils/editorShapes'

// crisp: 보관함 칸 같은 미리보기 전용. 줄여 그린 메모지 줄이 기기 픽셀 한 칸보다 가늘어지지 않게 한다(shared/pixelSnap)
// linesOnly: 종이 · 글 · 그림자 없이 **그림 선만** 그린다. 잉크병 메모(art.overTop)를 획 위에 한 번 더 올려
//   펜 색이 병 선을 덮지 않고 병 안으로 들어간 것처럼 보이게 하는 덧그림에 쓴다(StaticPage, 사용자 2026-11-10).
export default function ShapeContent({ object, zoom = 1, hideText = false, crisp = false, linesOnly = false }) {
  useTextFont(object.font)
  const width = object.w * zoom, height = object.h * zoom
  const stroke = Math.max(0, object.borderWidth ?? 0) * zoom
  const inset = stroke / 2 + 0.5
  const box = shapeTextBox(object,zoom)
  const shadowId = useSvgId('shape-shadow')
  const art = memoArtOf(object.art)
  const shadow = shadowOf(object), offset = shadowOffset(shadow)
  const castShadow = !linesOnly && shadow.on && (object.fill !== 'none' || stroke > 0)
  const bleed = castShadow ? Math.ceil((Math.max(Math.abs(offset.x),Math.abs(offset.y))+shadow.spread+shadow.blur*2)*zoom)+2 : 0
  const transform = `translate(${inset} ${inset}) scale(${Math.max(1,width-2*inset)/100} ${Math.max(1,height-2*inset)/100})`
  const dash = shapeBorderDash(object.borderStyle,stroke)
  return <View style={{ width, height, overflow: 'visible' }}>
    <View style={{position:'absolute',width,height,transform:[{scaleX:object.flipX?-1:1},{scaleY:object.flipY?-1:1}]}}>
      {castShadow && <View pointerEvents="none" style={{position:'absolute',left:-bleed,top:-bleed,width:width+2*bleed,height:height+2*bleed}}>
        <Svg width={width+2*bleed} height={height+2*bleed} viewBox={`0 0 ${width+2*bleed} ${height+2*bleed}`}>
          <Defs><Filter id={shadowId} filterUnits="userSpaceOnUse" x={0} y={0} width={width+2*bleed} height={height+2*bleed}><FeGaussianBlur stdDeviation={shadow.blur*zoom/2} /></Filter></Defs>
          <G opacity={shadow.opacity} filter={`url(#${shadowId})`}>
            <Path d={shapeDefinition(object.shape).path} transform={`translate(${bleed+offset.x*zoom} ${bleed+offset.y*zoom}) ${transform}`} fill={object.fill==='none'?'none':shadow.color} stroke={shadow.color} strokeWidth={stroke+2*shadow.spread*zoom} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </G>
        </Svg>
      </View>}
      {/* 메모 종이: 코덱스가 그린 종이 그림을 종이 · 무늬 색만 바꿔 그대로 그린다 */}
      {art ? <SvgXml xml={memoXml(art, object, crisp ? hairline(width / art.w) : 0, linesOnly)} width={width} height={height} style={{position:'absolute'}} />
        : <Svg width={width} height={height} style={{position:'absolute'}}>
          <Path d={shapeDefinition(object.shape).path} transform={transform} fill={object.fill === 'none' ? 'none' : object.fill ?? '#F8EBA7'} stroke={stroke ? object.borderColor ?? '#0B1766' : 'none'} strokeWidth={stroke} strokeDasharray={dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </Svg>}
    </View>
    {!hideText && !linesOnly && Boolean(object.text) && <View style={{position:'absolute',...box,overflow:'visible',justifyContent:object.verticalAlign==='top'?'flex-start':object.verticalAlign==='bottom'?'flex-end':'center'}}><Text style={[shapeTextStyle(object, zoom, Platform.OS), { padding:0,flexShrink:0 }]}>{richTextSegments(object.text,object.colorRanges,object.styleRanges).map((segment,index)=><Text key={index} style={segmentTextStyle(segment,zoom,textSettings(object).lineSpacing)}>{segment.text}</Text>)}</Text></View>}
  </View>
}

// 종이 그림의 색 자리({paper} · {line})를 메모의 채우기 · 테두리 색으로 바꾼다. 크기는 Svg 가 viewBox 로 맞춘다.
// minStroke: 미리보기에서 선 굵기의 하한(그림 좌표). 0 이면 그대로
const memoXml = (art, object, minStroke = 0, linesOnly = false) => {
  const xml = art.svg
    .replaceAll('{paper}', linesOnly ? 'none' : object.fill && object.fill !== 'none' ? object.fill : art.paper)
    .replaceAll('{line}', object.borderColor ?? art.line)
  return minStroke > 0 ? xml.replace(/stroke-width="([\d.]+)"/g, (_, width) => `stroke-width="${Math.max(Number(width), minStroke)}"`) : xml
}
