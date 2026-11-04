import { useEffect, useRef, useState } from 'react'
import { PixelRatio, Platform, View } from 'react-native'
import PageBackground from './PageBackground'
import ObjectContent, { objectDrawOpacity } from './canvas/ObjectView'
import { pageImageQuality } from '../utils/pageImageQuality.js'
import { capturePage } from '../utils/capturePage'
import { exportObjectPosition } from '../utils/regionExport.js'
import { PageExportError } from '../utils/pageExport.js'
import { ensurePersonalFonts } from '../../handwriting/library.js'
import { ensureTextFontsFor } from '../services/textFonts'
import { SkiaPencilScale } from '../skia/skiaPencilScale.js'
import { isSkiaPencil } from '../skia/pencilRaster.js'

/** PNG/PDF가 공유하는 전용 surface. 편집 UI와 저장 UI는 포함하지 않는다. */
export default function PageImageSurface({ job }) {
  const { snapshot, signal, resolve, reject } = job
  const [area, setArea] = useState(null)
  const [laidOut, setLaidOut] = useState(false)
  const [loaded, setLoaded] = useState(() => new Set())
  const [backgroundReady, setBackgroundReady] = useState(!snapshot.template)
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let live = true
    // 앱 글꼴은 쓰일 때 불러오므로, 찍기 전에 이 페이지가 쓰는 글꼴(속지에 인쇄된 마루부리 포함)을 기다린다
    Promise.all([ensureTextFontsFor(snapshot.objects, snapshot.template ? ['maruburi'] : []), ensurePersonalFonts(snapshot.objects)]).then(() => { if (live) setFontsReady(true) }).catch(error => { if (live) reject(new PageExportError('EXPORT_FONT_FAILED', error.message, error)) })
    return () => { live = false }
  }, [snapshot, reject])
  const surface = useRef(null), started = useRef(false), failed = useRef(false)
  const scale = Platform.OS === 'web' || !area ? 1 : Math.min(1, area.width / snapshot.width, area.height / snapshot.height)
  // 여러 칸 사진 틀은 사진이 든 칸이 모두 그려지면 한 번 알린다.
  // 연필 획은 앱 Skia 그림(PNG · 캔버스)이 올라와야 찍을 수 있다 — 못 그리면 SVG 로 두고 알려 온다(PencilSkiaStroke)
  const ready = snapshot.objects.filter((o) => o.src || o.cells?.some(Boolean) || isSkiaPencil(o)).every((o) => loaded.has(o.id))
  useEffect(() => {
    if (!ready || !backgroundReady || !fontsReady || !laidOut || started.current || signal.aborted || failed.current) return
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
  }, [ready, backgroundReady, fontsReady, laidOut, snapshot, signal, resolve, reject])
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
      <SkiaPencilScale.Provider value={snapshot.pixelWidth / snapshot.width}>
      {snapshot.objects.map((object) => <View key={object.id} needsOffscreenAlphaCompositing={snapshot.isolateObjectOpacity ? objectDrawOpacity(object) < 1 : undefined} style={{ position: 'absolute', ...exportObjectPosition(object, snapshot, scale), width: object.w * scale, height: object.h * scale, transform: [{ rotate: `${object.rotation ?? 0}deg` }], opacity: objectDrawOpacity(object) }}>
        <ObjectContent object={object} zoom={scale} still onAssetLoad={() => setLoaded((previous) => new Set(previous).add(object.id))} onAssetError={assetError} />
      </View>)}
      </SkiaPencilScale.Provider>
    </View>}
  </View>
}
