// Isolated drag fixture; no account, storage, or API access.
import { registerRootComponent } from 'expo'
import { useState } from 'react'
import { Text, View } from 'react-native'
import PageList from '../../src/editor/components/panels/PageList'

function App() {
  const count = Math.max(5, Math.min(30, Number(new URL(globalThis.location.href).searchParams.get('count')) || 5))
  const [pages, setPages] = useState(Array.from({length:count},(_,index)=>index+1).map(n => ({ id: `page-${n}`, canvasWidth: 768, canvasHeight: n === 1 ? 512 : 1024, backgroundAssetId: null, objects: [] })))
  const [currentId, setCurrent] = useState('page-2')
  return <View style={{ flex: 1, flexDirection: 'row', padding: 12 }}>
    <View testID="page-panel" style={{ width: 176, flexDirection: 'row' }}><PageList pages={pages} currentId={currentId} onSelect={setCurrent} onAdd={() => {}} onDuplicate={() => {}} onToggleIndex={() => {}} onRemove={() => {}}
      onMove={(id, index) => setPages(previous => { const next = previous.filter(p => p.id !== id); next.splice(index, 0, previous.find(p => p.id === id)); return next })} /></View>
    <Text accessibilityLabel="페이지 순서">{pages.map(p => p.id).join(',')}</Text>
    <Text accessibilityLabel="현재 페이지">{currentId}</Text>
  </View>
}
registerRootComponent(App)
