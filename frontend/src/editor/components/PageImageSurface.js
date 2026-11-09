import { useEffect, useRef, useState } from 'react'
import { PixelRatio, Platform, View } from 'react-native'
import PageBackground from './PageBackground'
import ObjectContent, { objectDrawOpacity } from './canvas/ObjectView'
import { pageImageQuality } from '../utils/pageImageQuality.js'
import { capturePage } from '../utils/capturePage'
import { exportObjectPosition } from '../utils/regionExport.js'
import { PageExportError } from '../utils/pageExport.js'
import { ensurePersonalFonts } from '../../handwriting/library.js'
import { ensureExportFonts } from '../services/textFonts'
import { SkiaPencilScale } from '../skia/skiaPencilScale.js'
import { isSkiaPencil } from '../skia/pencilRaster.js'
import { builtinStickerOf } from '../builtinStickers'
import { useStickerPacks } from '../hooks/useStickerPacks'
import { packingLayout } from '../templates/packingLayout.js'
import { PackingColorLayer, PackingFrontLayer } from './canvas/PackingColorLayer'

// 원격 스티커 팩(catalog.json)을 기다리는 최대 시간. 앱이 켜질 때 받으므로 보통은 이미 들어와 있다
export const REMOTE_PACK_WAIT_MS = 10000
export const isRemoteSticker = (object) => object?.type === 'sticker' && typeof object.builtin === 'string' && object.builtin.startsWith('remote:')

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
    // 앱 글꼴은 쓰일 때 불러오므로, 찍기 전에 이 페이지가 쓰는 글꼴(데일리 플래너가 비추는 글의 마루부리 포함)을 기다린다
    Promise.all([ensureExportFonts(snapshot), ensurePersonalFonts(snapshot.objects)]).then(() => { if (live) setFontsReady(true) }).catch(error => { if (live) reject(new PageExportError('EXPORT_FONT_FAILED', error.message, error)) })
    return () => { live = false }
  }, [snapshot, reject])
  const surface = useRef(null), started = useRef(false), failed = useRef(false)
  const scale = Platform.OS === 'web' || !area ? 1 : Math.min(1, area.width / snapshot.width, area.height / snapshot.height)
  // 여러 칸 사진 틀은 사진이 든 칸이 모두 그려지면 한 번 알린다.
  // 연필 획은 앱 Skia 그림(PNG · 캔버스)이 올라와야 찍을 수 있다 — 못 그리면 SVG 로 두고 알려 온다(PencilSkiaStroke)
  // 원격 스티커(builtin 'remote:<팩>:<스티커>')는 팩이 들어와야 그릴 수 있다. 팩이 늦게 들어오면 다시 계산한다
  useStickerPacks()
  const missingPack = snapshot.objects.some((o) => isRemoteSticker(o) && !builtinStickerOf(o.builtin))
  // 원격 그림 스티커(팩의 PNG)도 그림이 올라온 뒤 찍는다
  const ready = !missingPack && snapshot.objects.filter((o) => o.src || o.cells?.some(Boolean) || isSkiaPencil(o) || builtinStickerOf(o.builtin)?.image).every((o) => loaded.has(o.id))
  // 팩이 끝내 오지 않으면(오프라인 첫 실행 · 목록에서 지워진 팩) 빈 자리로 찍지 않고 오류로 알린다
  useEffect(() => {
    if (!missingPack || failed.current) return undefined
    const timer = setTimeout(() => {
      failed.current = true
      reject(new PageExportError('EXPORT_MEDIA_FAILED', '스티커 일부를 불러오지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.'))
    }, REMOTE_PACK_WAIT_MS)
    return () => clearTimeout(timer)
  }, [missingPack, reject])
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
  const packing = packingLayout(snapshot.template?.backgroundAssetId)
  const packingPage = packing && { ...snapshot.template, objects: snapshot.objects, canvasWidth: snapshot.pageWidth ?? snapshot.width, canvasHeight: snapshot.pageHeight ?? snapshot.height }
  const packed = packing ? snapshot.objects.filter(o => o.packingSlot === 0 || o.packingSlot === 1) : []
  const ordinary = packing ? snapshot.objects.filter(o => !o.packingColorRegion && o.packingSlot !== 0 && o.packingSlot !== 1) : snapshot.objects
  const renderObject = (object, pageCoordinates = false) => <View key={object.id} needsOffscreenAlphaCompositing={snapshot.isolateObjectOpacity ? objectDrawOpacity(object) < 1 : undefined} style={{ position: 'absolute', ...(pageCoordinates ? { left: object.x * scale, top: object.y * scale } : exportObjectPosition(object, snapshot, scale)), width: object.w * scale, height: object.h * scale, transform: [{ rotate: `${object.rotation ?? 0}deg` }], opacity: objectDrawOpacity(object) }}>
    <ObjectContent object={object} zoom={scale} still onAssetLoad={() => setLoaded((previous) => new Set(previous).add(object.id))} onAssetError={assetError} />
  </View>
  return <View style={{ flex: 1 }} onLayout={(event) => setArea(event.nativeEvent.layout)}>
    {(Platform.OS === 'web' || area?.width > 0 && area?.height > 0) && <View ref={surface} collapsable={false} testID="page-export-surface" onLayout={() => setLaidOut(true)} style={{ width: snapshot.width * scale, height: snapshot.height * scale, backgroundColor: snapshot.background, overflow: 'hidden' }}>
      {snapshot.template && <View style={{ position: 'absolute', ...exportObjectPosition({ x: 0, y: 0 }, snapshot, scale), width: (snapshot.pageWidth ?? snapshot.width) * scale, height: (snapshot.pageHeight ?? snapshot.height) * scale }}>
        <PageBackground page={{ id: snapshot.pageId, ...snapshot.template, canvasWidth: snapshot.pageWidth ?? snapshot.width, canvasHeight: snapshot.pageHeight ?? snapshot.height }} zoom={scale} preparedXml={snapshot.backgroundXml} onReady={() => setBackgroundReady(true)} onError={backgroundError} />
      </View>}
      <SkiaPencilScale.Provider value={snapshot.pixelWidth / snapshot.width}>
      {packing && <View pointerEvents="none" style={{ position: 'absolute', ...exportObjectPosition({ x: 0, y: 0 }, snapshot, scale), width: packingPage.canvasWidth * scale, height: packingPage.canvasHeight * scale }}><PackingColorLayer page={packingPage} zoom={scale} /></View>}
      {packing && packing.interiors.map((box, slot) => {
        const sx = packing.scaleX ?? 1, sy = packing.scaleY ?? 1
        const x = packing.origin.x + box.x * sx, y = packing.origin.y + box.y * sy
        return <View key={slot} style={{ position: 'absolute', ...exportObjectPosition({ x, y }, snapshot, scale), width: box.width * sx * scale, height: box.height * sy * scale, borderRadius: box.rx * Math.min(sx, sy) * scale, overflow: 'hidden' }}><View style={{ position: 'absolute', left: -x * scale, top: -y * scale, width: packingPage.canvasWidth * scale, height: packingPage.canvasHeight * scale }}>{packed.filter(o => o.packingSlot === slot).map(o => renderObject(o, true))}</View></View>
      })}
      {packing && <View pointerEvents="none" style={{ position: 'absolute', ...exportObjectPosition({ x: 0, y: 0 }, snapshot, scale), width: packingPage.canvasWidth * scale, height: packingPage.canvasHeight * scale }}><PackingFrontLayer page={packingPage} zoom={scale} /></View>}
      {ordinary.map(o => renderObject(o))}
      </SkiaPencilScale.Provider>
    </View>}
  </View>
}
