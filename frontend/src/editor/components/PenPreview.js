import { Profiler, useLayoutEffect, useSyncExternalStore } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import StrokePreview from './StrokePreview'

function PreviewStroke({ item, zoom, pageWidth, pageHeight }) {
  const measurement = item.measurement
  useLayoutEffect(() => measurement?.previewCommitted?.(), [measurement])
  const drawing = <StrokePreview preview={item} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} />
  return <View pointerEvents="none" dataSet={Platform.OS === 'web' ? { strokePreviewId: item.strokeId } : undefined} style={StyleSheet.absoluteFill}>
    {measurement ? <Profiler id="pen-preview" onRender={(_id, _phase, duration) => measurement.record('previewReactMs', duration)}>
      {drawing}
    </Profiler> : drawing}
  </View>
}

// 현재 획을 대기 목록으로 옮겨도 동일한 SVG 노드와 측정 수명을 유지한다.
export default function PenPreview({ store, zoom, pageWidth, pageHeight }) {
  const preview = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const pending = useSyncExternalStore(store.subscribe, store.getPendingSnapshot, store.getPendingSnapshot)
  if (!preview && !pending.length) return null
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {[...pending, ...(preview ? [preview] : [])].map(item =>
      <PreviewStroke key={item.strokeId} item={item} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} />)}
  </View>
}
