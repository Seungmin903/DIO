import { memo, useRef } from 'react'
import { PixelRatio, View } from 'react-native'
import { createCompletedStrokePlanner } from '../../utils/completedStrokePlan.js'
import { objectOpacity, TextMeasure } from './ObjectView'
import PageObject from './PageObject'

const Batch = memo(function Batch({ batch, zoom, rasterize }) {
  return <View pointerEvents="none" collapsable={false}
    shouldRasterizeIOS={rasterize} renderToHardwareTextureAndroid={rasterize}
    style={{ position: 'absolute', left: batch.left * zoom, top: batch.top * zoom,
      width: batch.w * zoom, height: batch.h * zoom, overflow: 'hidden' }}>
    {/* 텍스트 측정 콜백 변경이 완성된 필기까지 다시 렌더하지 않게 한다. */}
    <TextMeasure.Provider value={null}>
      {batch.objects.map(object => <PageObject key={object.id} object={object} zoom={zoom}
        originX={batch.left} originY={batch.top} opacity={objectOpacity(object)} still />)}
    </TextMeasure.Provider>
  </View>
})

// 원래 레이어 순서대로 연속한 획만 묶는다. 사진·글자·GIF는 캐시에 포함하지 않는다.
export default function CompletedStrokeLayer({ objects, width, height, zoom, renderObject }) {
  const planner = useRef(null)
  if (!planner.current) planner.current = createCompletedStrokePlanner()
  return planner.current(objects, { width, height, zoom, pixelRatio: PixelRatio.get() }).map(layer => layer.batch
    ? <Batch key={`ink-${layer.batch.objects[0].id}`} batch={layer.batch} zoom={zoom} rasterize={layer.rasterize} />
    : renderObject(layer.object))
}
