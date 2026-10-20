// 브라우저 검증 전용 Metro 진입점. 실제 App 진입점에서는 참조하지 않는다.
import { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { View } from 'react-native'
import EditorScreen from '../../src/editor/screens/EditorScreen'
import PageBackground from '../../src/editor/components/PageBackground'
import { catalog } from '../../src/editor/templates/data.js'
import { loadTemplate } from '../../src/editor/templates/loadTemplate'

function Fixture() {
  const [index, setIndex] = useState(0)
  const renderAll = window.location.search.includes('all')
  const asset = catalog.assets[index]
  useEffect(() => {
    if (renderAll) return
    ;(async () => {
      try {
        for (const asset of catalog.assets) { await loadTemplate({ backgroundAssetId: asset.id, templateVersion: asset.templateVersion }); window.__templateProgress = asset.id }
        window.__templateValidation = { parsed: catalog.assets.length }
      } catch (error) { window.__templateValidation = { error: error.message } }
    })()
  }, [renderAll])
  if (renderAll) return <View style={{width:1024,height:768}}><PageBackground page={{id:asset.id,backgroundAssetId:asset.id,templateVersion:asset.templateVersion,canvasWidth:1024,canvasHeight:768}} zoom={1} onError={error => { window.__templateValidation = { error: error.message, id: asset.id } }} onReady={() => { if (index + 1 < catalog.assets.length) setIndex(index + 1); else window.__templateValidation = { rendered: catalog.assets.length } }} /></View>
  return <View style={{flex:1}}><EditorScreen readOnly /></View>
}
registerRootComponent(Fixture)
