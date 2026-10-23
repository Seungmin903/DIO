import { Profiler, useSyncExternalStore } from 'react'
import { StyleSheet, View } from 'react-native'
import StrokePreview from './StrokePreview'

// 펜 입력 View의 상태·responder와 별도로 갱신하는 표시 전용 층.
export default function PenPreview({ store, zoom, pageWidth, pageHeight }) {
  const preview = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  if (!preview) return null
  const drawing = <StrokePreview preview={preview} zoom={zoom} pageWidth={pageWidth} pageHeight={pageHeight} />
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {preview.measurement ? <Profiler id="pen-preview" onRender={(_id, _phase, duration) => preview.measurement.record('previewReactMs', duration)}>
      {drawing}
    </Profiler> : drawing}
  </View>
}
