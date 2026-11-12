import { registerRootComponent } from 'expo'
import { useMemo } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import EditorScreen from '../../src/editor/screens/EditorScreen'
import { createDefaultDoc } from '../../src/editor/state/defaultDoc'
import { editorDocKey, rememberEditorDoc } from '../../src/editor/services/editorDocs'

const diary = { id: 'pen-colors-qa', title: '펜 최근 색상 검증', color: '#1462B8', firstPage: 'blank' }
rememberEditorDoc(editorDocKey(diary), createDefaultDoc(diary))
function Fixture() {
  const controller = useMemo(() => ({ initialTool: 'pen', onCommit(value) { window.__penColorEditor = value } }), [])
  return <SafeAreaProvider><View style={{ flex: 1 }}><EditorScreen diary={diary} qaController={controller} onHome={() => {}} /></View></SafeAreaProvider>
}
registerRootComponent(Fixture)
