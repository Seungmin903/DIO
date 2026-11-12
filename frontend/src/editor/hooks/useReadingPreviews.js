import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Image, PixelRatio, Platform } from 'react-native'
import { usePageImageRenderer } from './usePageImageRenderer'
import { createExportSnapshot } from '../utils/pageExport.js'
import { createReadingPreviewCache, readingPreviewSpec, readingPreviewEligible } from '../utils/readingPreviewCache.js'
import { isAnimatedMedia } from '../stickerAssets'
import { mediaRegistry } from '../services/mediaStore'
import { mediaId } from '../utils/mediaReferences.js'
import { ReadingPreviewEnabled } from '../components/canvas/ReadingPreviewContext'

export function useReadingPreviews({ enabled, page, previous, next, target, zoom, moving }) {
  const allowed = useContext(ReadingPreviewEnabled)
  enabled = enabled && allowed
  const { renderPageImage, surface } = usePageImageRenderer()
  const [, refresh] = useState(0), mounted = useRef(false)
  const cache = useMemo(() => createReadingPreviewCache({
    async render(spec, options) {
      const snapshot = { ...createExportSnapshot(spec.page), isolateObjectOpacity: true, pixelWidth: spec.pixelWidth, pixelHeight: spec.pixelHeight }
      return renderPageImage(snapshot, options)
    },
    warm: uri => Image.prefetch(uri).catch(() => {}),
    onChange: () => { if (mounted.current) refresh(value => value + 1) },
  }), [renderPageImage])
  const pixelRatio = PixelRatio.get()
  const specs = useMemo(() => enabled ? [page, target, next, previous].filter(Boolean).filter(item => readingPreviewEligible(item, object => isAnimatedMedia(object) || Boolean(mediaId(object) && !mediaRegistry.get(mediaId(object))?.media))).map(item => readingPreviewSpec(item, zoom, pixelRatio)).filter(Boolean) : [], [enabled, page, previous, next, target, zoom, pixelRatio])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; cache.clear() }
  }, [cache])
  useEffect(() => { cache.update(specs, moving) }, [cache, specs, moving])
  useEffect(() => {
    const leave = AppState.addEventListener('change', state => { if (!mounted.current) return; if (state !== 'active') cache.clear(); else cache.update(specs, moving) })
    const memory = Platform.OS === 'web' ? null : AppState.addEventListener('memoryWarning', () => cache.clear())
    return () => { leave?.remove(); memory?.remove() }
  }, [cache, specs, moving])
  const get = item => enabled && item && cache.get(specs.find(spec => spec.page === item))
  return { current: get(page), target: get(target), surface, stats: cache.stats }
}
