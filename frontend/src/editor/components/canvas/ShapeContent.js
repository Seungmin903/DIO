import { Platform, Text, View } from 'react-native'
import Svg, { Defs, Filter, FeGaussianBlur, G, Path } from 'react-native-svg'
import { useTextFont } from '../../hooks/useTextFont'
import { richTextSegments, segmentTextStyle } from '../../utils/textFormats'
import { textSettings } from '../../utils/text'
import { shadowOf, shadowOffset } from '../../utils/effects'
import { useSvgId } from '../../utils/svgId'
import { shapeDefinition, shapeTextStyle, shapeBorderDash, shapeTextBox } from '../../utils/editorShapes'

export default function ShapeContent({ object, zoom = 1, hideText = false }) {
  useTextFont(object.font)
  const width = object.w * zoom, height = object.h * zoom
  const stroke = Math.max(0, object.borderWidth ?? 0) * zoom
  const inset = stroke / 2 + 0.5
  const box = shapeTextBox(object,zoom)
  const shadowId = useSvgId('shape-shadow')
  const shadow = shadowOf(object), offset = shadowOffset(shadow)
  const castShadow = shadow.on && (object.fill !== 'none' || stroke > 0)
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
      <Svg width={width} height={height} style={{position:'absolute'}}>
        <Path d={shapeDefinition(object.shape).path} transform={transform} fill={object.fill === 'none' ? 'none' : object.fill ?? '#F8EBA7'} stroke={stroke ? object.borderColor ?? '#0B1957' : 'none'} strokeWidth={stroke} strokeDasharray={dash} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Svg>
    </View>
    {!hideText && Boolean(object.text) && <View style={{position:'absolute',...box,overflow:'visible',justifyContent:object.verticalAlign==='top'?'flex-start':object.verticalAlign==='bottom'?'flex-end':'center'}}><Text style={[shapeTextStyle(object, zoom, Platform.OS), { padding:0,flexShrink:0 }]}>{richTextSegments(object.text,object.colorRanges,object.styleRanges).map((segment,index)=><Text key={index} style={segmentTextStyle(segment,zoom,textSettings(object).lineSpacing)}>{segment.text}</Text>)}</Text></View>}
  </View>
}
