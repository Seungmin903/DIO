import { registerRootComponent } from 'expo'
import { useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import EditorScreen from '../../src/editor/screens/EditorScreen'
import { createDefaultDoc } from '../../src/editor/state/defaultDoc'
import { editorDocKey, rememberEditorDoc } from '../../src/editor/services/editorDocs'
import { createPhoto } from '../../src/editor/utils/objects'
import { createShape } from '../../src/editor/utils/editorShapes'

const diary = { id: 'eyedropper-qa', title: '스포이트 검증', color: '#1462B8', firstPage: 'blank' }
const doc = createDefaultDoc(diary), page = doc.pages[0]
const shape = (id, x, fill, opacity = 1) => ({ ...createShape({ shape: 'rect', fill }, { x: 0, y: 0 }), id, x, y: 180, w: 400, h: 300, opacity })
const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64
const context = canvas.getContext('2d'); context.fillStyle = '#E08020'; context.fillRect(0, 0, 64, 64)
page.objects = [shape('blue', 100, '#1462B8'), shape('red-overlay', 100, '#FF0000', .5), { ...createPhoto({ src: canvas.toDataURL(), imageWidth: 64, imageHeight: 64 }, { x: 750, y: 330 }), id: 'photo', x: 600, y: 180, w: 300, h: 300 }]
rememberEditorDoc(editorDocKey(diary), doc)
function Fixture() {
  const { width, height } = useWindowDimensions()
  const controller = useMemo(() => ({ initialTool: 'pen', onCommit(value) { window.__eyedropperEditor = value } }), [])
  return <SafeAreaProvider><View style={{ flex: 1 }}><EditorScreen diary={diary} compact={width < 600} landscape={width > height} qaController={controller} onHome={() => {}} /></View></SafeAreaProvider>
}
registerRootComponent(Fixture)
