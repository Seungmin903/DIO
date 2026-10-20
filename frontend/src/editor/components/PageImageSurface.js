import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import ObjectContent, { objectOpacity } from './canvas/ObjectView'
import { capturePage } from '../utils/capturePage'
import { PageExportError } from '../utils/pageExport.js'

/** PNG/PDF가 공유하는 전용 surface. 편집 UI와 저장 UI는 포함하지 않는다. */
export default function PageImageSurface({ job }) {
  const { snapshot, signal, resolve, reject } = job
  const [area, setArea] = useState(null)
  const [laidOut, setLaidOut] = useState(false)
  const [loaded, setLoaded] = useState(() => new Set())
  const surface = useRef(null), started = useRef(false), failed = useRef(false)
  const scale = Platform.OS === 'web' || !area ? 1 : Math.min(1, area.width / snapshot.width, area.height / snapshot.height)
  const ready = snapshot.objects.filter((o) => o.src).every((o) => loaded.has(o.id))
  useEffect(() => {
    if (!ready || !laidOut || started.current || signal.aborted || failed.current) return
    started.current = true
    let frame1, frame2
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(async () => {
        if (signal.aborted || failed.current) return
        job.onCaptureStart()
        try {
          const result = await capturePage(surface.current, snapshot)
          // 늦은 결과의 소유권/취소 처리는 요청 bridge가 한 곳에서 담당한다.
          resolve(result)
        } catch (error) { reject(error) }
      })
    })
    return () => { cancelAnimationFrame(frame1); if (frame2 != null) cancelAnimationFrame(frame2) }
  }, [ready, laidOut, snapshot, signal, resolve, reject])
  const assetError = () => {
    failed.current = true
    reject(new PageExportError('EXPORT_MEDIA_FAILED', '이미지를 표시하지 못했어요. 원본을 확인해 주세요.'))
  }
  return <View style={{ flex: 1 }} onLayout={(event) => setArea(event.nativeEvent.layout)}>
    {(Platform.OS === 'web' || area?.width > 0 && area?.height > 0) && <View ref={surface} collapsable={false} testID="page-export-surface" onLayout={() => setLaidOut(true)} style={{ width: snapshot.width * scale, height: snapshot.height * scale, backgroundColor: snapshot.background, overflow: 'hidden' }}>
      {snapshot.objects.map((object) => <View key={object.id} style={{ position: 'absolute', left: object.x * scale, top: object.y * scale, width: object.w * scale, height: object.h * scale, transform: [{ rotate: `${object.rotation ?? 0}deg` }], opacity: objectOpacity(object) }}>
        <ObjectContent object={object} zoom={scale} still onAssetLoad={() => setLoaded((previous) => new Set(previous).add(object.id))} onAssetError={assetError} />
      </View>)}
    </View>}
  </View>
}
