import { useEffect, useRef, useState } from 'react'
import { PixelRatio, Platform, View } from 'react-native'
import PageBackground from './PageBackground'
import ObjectContent, { objectOpacity } from './canvas/ObjectView'
import { pageImageQuality } from '../utils/pageImageQuality.js'
import { capturePage } from '../utils/capturePage'
import { exportObjectPosition } from '../utils/regionExport.js'
import { PageExportError } from '../utils/pageExport.js'

/** PNG/PDF가 공유하는 전용 surface. 편집 UI와 저장 UI는 포함하지 않는다. */
export default function PageImageSurface({ job }) {
  const { snapshot, signal, resolve, reject } = job
  const [area, setArea] = useState(null)
  const [laidOut, setLaidOut] = useState(false)
  const [loaded, setLoaded] = useState(() => new Set())
  const [backgroundReady, setBackgroundReady] = useState(!snapshot.template)
  const surface = useRef(null), started = useRef(false), failed = useRef(false)
  const scale = Platform.OS === 'web' || !area ? 1 : Math.min(1, area.width / snapshot.width, area.height / snapshot.height)
  // 여러 칸 사진 틀은 사진이 든 칸이 모두 그려지면 한 번 알린다.
  const ready = snapshot.objects.filter((o) => o.src || o.cells?.some(Boolean)).every((o) => loaded.has(o.id))
  useEffect(() => {
    if (!ready || !backgroundReady || !laidOut || started.current || signal.aborted || failed.current) return
    started.current = true
    let frame1, frame2
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(async () => {
        if (signal.aborted || failed.current) return
        job.onCaptureStart()
        try {
          const result = await capturePage(surface.current, snapshot)
          // 늦은 결과의 소유권/취소 처리는 요청 bridge가 한 곳에서 담당한다.
          resolve({ ...result, diagnostics: { ...pageImageQuality(snapshot, { platform: Platform.OS, scale, pixelRatio: PixelRatio.get() }), rasterWarnings: snapshot.rasterWarnings ?? [] } })
        } catch (error) { reject(error) }
      })
    })
    return () => { cancelAnimationFrame(frame1); if (frame2 != null) cancelAnimationFrame(frame2) }
  }, [ready, backgroundReady, laidOut, snapshot, signal, resolve, reject])
  const backgroundError = () => {
    failed.current = true
    reject(new PageExportError('EXPORT_TEMPLATE_FAILED', '속지를 표시하지 못했어요. 다시 시도해 주세요.'))
  }
  const assetError = () => {
    failed.current = true
    reject(new PageExportError('EXPORT_MEDIA_FAILED', '이미지를 표시하지 못했어요. 원본을 확인해 주세요.'))
  }
  return <View style={{ flex: 1 }} onLayout={(event) => setArea(event.nativeEvent.layout)}>
    {(Platform.OS === 'web' || area?.width > 0 && area?.height > 0) && <View ref={surface} collapsable={false} testID="page-export-surface" onLayout={() => setLaidOut(true)} style={{ width: snapshot.width * scale, height: snapshot.height * scale, backgroundColor: snapshot.background, overflow: 'hidden' }}>
      {snapshot.template && <View style={{ position: 'absolute', ...exportObjectPosition({ x: 0, y: 0 }, snapshot, scale), width: (snapshot.pageWidth ?? snapshot.width) * scale, height: (snapshot.pageHeight ?? snapshot.height) * scale }}>
        <PageBackground page={{ id: snapshot.pageId, ...snapshot.template, canvasWidth: snapshot.pageWidth ?? snapshot.width, canvasHeight: snapshot.pageHeight ?? snapshot.height }} zoom={scale} preparedXml={snapshot.backgroundXml} onReady={() => setBackgroundReady(true)} onError={backgroundError} />
      </View>}
      {snapshot.objects.map((object) => <View key={object.id} style={{ position: 'absolute', ...exportObjectPosition(object, snapshot, scale), width: object.w * scale, height: object.h * scale, transform: [{ rotate: `${object.rotation ?? 0}deg` }], opacity: objectOpacity(object) }}>
        <ObjectContent object={object} zoom={scale} still onAssetLoad={() => setLoaded((previous) => new Set(previous).add(object.id))} onAssetError={assetError} />
      </View>)}
    </View>}
  </View>
}
