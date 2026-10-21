import { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { View, Text } from 'react-native'
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg'
import StrokeContent from '../../src/editor/components/StrokeContent'
import { createStroke, PENCIL_GRAIN, PENCIL_GRAIN_SIZE, strokePath } from '../../src/editor/utils/strokes'

function Previous({ object, zoom, id }) {
  return <Svg width={object.w * zoom} height={object.h * zoom} viewBox={`0 0 ${object.baseWidth} ${object.baseHeight}`}>
    <Defs><Pattern id={id} patternUnits="userSpaceOnUse" width={PENCIL_GRAIN_SIZE} height={PENCIL_GRAIN_SIZE}>
      <Rect width={14} height={14} fill={object.color} opacity={0.22} />
      {PENCIL_GRAIN.map((g, i) => <Circle key={i} cx={g.x} cy={g.y} r={g.radius} fill={object.color} opacity={g.opacity} />)}
    </Pattern></Defs>
    <Path d={strokePath(object.points)} fill="none" stroke={`url(#${id})`} strokeWidth={object.strokeWidth * 0.85} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
}
const points = Array.from({ length: 121 }, (_, i) => ({ x: 20 + i * 2.5, y: 24 + Math.sin(i / 11) * 10, pressure: 0.85 }))
function Fixture() {
  const [config, setConfig] = useState({ zoom: 2, paper: '#FAF8F2', count: 1, restored: false })
  useEffect(() => { window.__setPencilFixture = setConfig }, [])
  return <View style={{ padding: 20, backgroundColor: config.paper }} testID="pencil-comparison">
    <Text style={{ fontSize: 20, marginBottom: 10 }}>Pencil / Rough graphite — before & after</Text>
    {[1, 8, 16].map(width => {
      let object = createStroke(points, { width, kind: 'pencil', color: '#1D1D1F' })
      if (config.restored) object = JSON.parse(JSON.stringify(object))
      return <View key={width} style={{ marginBottom: 12 }}>
        <Text>Width {width} · before</Text>
        <View testID={`before-${width}`}><Previous object={object} zoom={config.zoom} id={`before-${width}`} /></View>
        <Text>Width {width} · after</Text>
        <View testID={`after-${width}`}><StrokeContent object={object} zoom={config.zoom} /></View>
      </View>
    })}
    {[1, 3, 6].map(passes => <View key={passes}>
      <Text>Graphite buildup · {passes} passes</Text>
      <View testID={`tone-${passes}`} style={{ width: 316 * config.zoom, height: 20 * config.zoom }}>
        {Array.from({ length: passes }, (_, i) => <View key={i} style={{ position: 'absolute', left: 0, top: 0 }}>
          <StrokeContent object={createStroke([{ x: 10, y: 20 }, { x: 310, y: 20 }], { kind: 'pencil', width: 16, color: '#1D1D1F' })} zoom={config.zoom} />
        </View>)}
      </View>
    </View>)}
    <View testID="solid-sample"><StrokeContent object={createStroke([{ x: 10, y: 20 }, { x: 310, y: 20 }], { kind: 'pencil', width: 16, color: '#1D1D1F' })} zoom={config.zoom} /></View>
    <View testID="dot"><StrokeContent object={createStroke([{ x: 10, y: 10, pressure: 0.85 }], { kind: 'pencil', width: 16 })} zoom={config.zoom} /></View>
    <View testID="stress">{Array.from({ length: config.count }, (_, i) => <StrokeContent key={i} object={createStroke(points, { kind: 'pencil', width: 8 })} zoom={0.5} />)}</View>
  </View>
}
registerRootComponent(Fixture)
