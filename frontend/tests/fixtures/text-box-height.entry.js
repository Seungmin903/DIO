// 앱 저장소를 읽지 않는 실제 Canvas/리사이즈 검증 진입점.
import { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { View } from 'react-native'
import Canvas from '../../src/editor/components/canvas/Canvas'
import { createInitialState, editorReducer } from '../../src/editor/state/editorReducer'

function documentFor(config) {
  return { pages: [{ id: 'height-fixture', canvasWidth: 1200, canvasHeight: 1600, objects: [{ id: 'text', type: 'text', x: 120, y: 150, w: config.width, baseWidth: config.width, h: config.height, text: 'Dynamic\n한글 둘째 줄\n마지막 줄', fontSize: 28, rotation: 0, styleRanges: [{ start: 8, end: 10, fontSize: 40 }] }] }] }
}
function Fixture() {
  const [config, setConfig] = useState({ zoom: 1, width: 240, height: 10 })
  const initial = () => ({ ...createInitialState(documentFor(config)), selectedIds: ['text'] })
  const [state, setState] = useState(initial)
  useEffect(() => { window.__setTextBoxConfig = next => { setConfig(next); setState({ ...createInitialState(documentFor(next)), selectedIds: ['text'] }) } }, [])
  useEffect(() => { window.__textBoxState = state }, [state])
  return <View testID="text-box-fixture" style={{ width: 1200 * config.zoom, height: 1600 * config.zoom }}>
    <Canvas page={state.doc.pages[0]} selectedIds={state.selectedIds} zoom={config.zoom} dispatch={action => setState(current => editorReducer(current, action))} linkBadges={false} />
  </View>
}
registerRootComponent(Fixture)
