// Browser QA only: uses an in-memory page and never calls a real server.
import { registerRootComponent } from 'expo'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import PageSettingsDialog from '../../src/editor/components/panels/PageSettingsDialog'
import { loadPageSettings, updateServerPage } from '../../src/collaboration/serverPages.js'

const diaryId = '10000000-0000-4000-8000-000000000001', pageId = '20000000-0000-4000-8000-000000000001'
let page = { diaryId, pageId, title: '테스트 페이지', canvasWidth: 1188, canvasHeight: 840,
  gridVisible: false, gridColor: '#DCE5F1', templateId: null, templateConfig: { blank: true, custom: 'preserved' } }
let fail = false
const transport = async request => {
  if (request.method) {
    if (fail) throw Error('저장 실패 테스트')
    page = { ...page, ...request.body }
  }
  return { page }
}
function App() {
  const [open, setOpen] = useState(true), [result, setResult] = useState('')
  return <View style={{ flex: 1 }}>
    <Pressable accessibilityRole="button" onPress={() => setOpen(true)}><Text>설정 다시 열기</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => { fail = !fail }}><Text>저장 실패 전환</Text></Pressable>
    <Text accessibilityLabel="저장 결과">{result}</Text>
    {open && <PageSettingsDialog pageId={pageId} onLoad={() => loadPageSettings(transport, diaryId, pageId)}
      onSave={async (id, body) => { const saved = await updateServerPage(transport, diaryId, id, body); setResult(JSON.stringify(saved)) }} onClose={() => setOpen(false)} />}
  </View>
}
registerRootComponent(App)
