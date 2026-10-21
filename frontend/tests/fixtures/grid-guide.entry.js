// 격자 합성 검증용 독립 진입점. 앱 저장소를 읽거나 쓰지 않는다.
import { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { View } from 'react-native'
import PageBackground from '../../src/editor/components/PageBackground'
import GridOverlay from '../../src/editor/components/canvas/GridOverlay'

function Fixture() {
  const [config, setConfig] = useState({ mode: 'none', portrait: false, blank: false, cream: false, zoom: 0.75 })
  useEffect(() => { window.__setGridFixture = setConfig }, [])
  const width = config.portrait ? 768 : 1024, height = config.portrait ? 1024 : 768
  const page = {
    id: 'grid-fixture', canvasWidth: width, canvasHeight: height,
    ...(config.blank ? {} : { backgroundAssetId: `2026-monthly-01-${config.portrait ? 'portrait' : 'landscape'}`, templateVersion: '1.0.0' }),
    paperAppearance: { backgroundColor: config.cream ? '#FFF8E7' : '#FFFFFF', layoutColor: '#292929' },
  }
  const guides = { grid: 'lines', spacing: 'narrow', center: true, thirds: true, margin: true }
  const grid = <><GridOverlay guides={guides} layer="grid" width={width} height={height} zoom={config.zoom} /><GridOverlay guides={guides} layer="guides" width={width} height={height} zoom={config.zoom} /></>
  return <View testID="grid-page" style={{ width: width * config.zoom, height: height * config.zoom }}>
    <PageBackground page={page} zoom={config.zoom} underlay={config.mode === 'fixed' ? grid : null} />
    {config.mode === 'old' && grid}
  </View>
}
registerRootComponent(Fixture)
