import { Profiler, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import StrokePreview from './StrokePreview'
import PencilLivePreview from './PencilLivePreview'
import { useSkiaRuntime } from '../skia/skiaRuntime'

function PreviewStroke({ item, zoom, pageWidth, pageHeight, skia }) {
  const measurement = item.measurement
  useLayoutEffect(() => measurement?.previewCommitted?.(), [measurement])
  // 연필은 CanvasKit 가 준비되면 앱과 같은 Skia 그림으로(준비 전이나 표면을 못 만들면 SVG)
  const [liveFailed, setLiveFailed] = useState(false)
  const drawing = skia && item.settings.kind === 'pencil' && !liveFailed
    ? <PencilLivePreview runtime={skia} preview={item} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} onUnavailable={() => setLiveFailed(true)} />
    : <StrokePreview preview={item} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} />
  return <View pointerEvents="none" dataSet={Platform.OS === 'web' ? { strokePreviewId: item.strokeId } : undefined} style={StyleSheet.absoluteFill}>
    {measurement ? <Profiler id="pen-preview" onRender={(_id, _phase, duration) => measurement.record('previewReactMs', duration)}>
      {drawing}
    </Profiler> : drawing}
  </View>
}

// 현재 획을 대기 목록으로 옮겨도 동일한 SVG 노드와 측정 수명을 유지한다.
// kind: 지금 고른 펜 종류 — 연필이면 CanvasKit(wasm)를 미리 불러 둔다
export default function PenPreview({ store, zoom, pageWidth, pageHeight, kind }) {
  const { runtime: skia } = useSkiaRuntime(kind === 'pencil')
  const preview = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const pending = useSyncExternalStore(store.subscribe, store.getPendingSnapshot, store.getPendingSnapshot)
  if (!preview && !pending.length) return null
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {[...pending, ...(preview ? [preview] : [])].map(item =>
      <PreviewStroke key={item.strokeId} item={item} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} skia={skia} />)}
  </View>
}
