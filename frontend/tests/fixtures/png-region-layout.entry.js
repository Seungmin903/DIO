import React from 'react'
import { registerRootComponent } from 'expo'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RegionExportSelector from '../../src/editor/components/RegionExportSelector'
import { createRegionExportSnapshot } from '../../src/editor/utils/regionExport'
const page = { id: 'region-layout-qa', canvasWidth: 1280, canvasHeight: 1800, paper: 'plain', objects: [] }
globalThis.__regionLayoutQA = { confirmed: null, snapshot: null }
function App() {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }, insets: { top: 0, bottom: 0, left: 0, right: 0 } }}>
    <RegionExportSelector page={page} onCancel={() => {}} onConfirm={value => {
      const snapshot = createRegionExportSnapshot(page, { pageWidth: 1280, pageHeight: 1800, ...value })
      globalThis.__regionLayoutQA = { confirmed: value, snapshot: { pixelWidth: snapshot.pixelWidth, pixelHeight: snapshot.pixelHeight, region: snapshot.region } }
    }} />
  </SafeAreaProvider>
}
registerRootComponent(App)
