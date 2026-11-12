import { useEffect, useState } from 'react'
import { Image } from 'react-native'
import { useMediaEntry, useMediaUri } from '../../editor/hooks/useMediaUri'
import { mediaService } from '../../editor/services/mediaStore'
import { mediaId } from '../../editor/utils/mediaReferences.js'
import { coverPhotoAspect } from '../utils/coverPhotoCrop.js'

// 예전 표지는 메타데이터 → 실제 이미지 크기 순서로 비율을 복구한다.
export function useCoverPhotoAspect(photo) {
  const uri = useMediaUri(photo)
  const id = mediaId(photo)
  const entry = useMediaEntry(id)
  const known = coverPhotoAspect(photo, entry?.media)
  const source = `${id ?? ''}:${photo?.src ?? ''}`
  const [attempt, setAttempt] = useState(0)
  const [measured, setMeasured] = useState(null)
  useEffect(() => {
    if (known || !uri) return undefined
    let active = true
    const fail = () => { if (active) setMeasured({ source, uri, attempt, status: 'failed' }) }
    try {
      Image.getSize(uri, (width, height) => {
        const aspect = coverPhotoAspect({ width, height })
        if (!aspect) { fail(); return }
        if (active) setMeasured({ source, uri, attempt, status: 'ready', aspect })
      }, fail)
    } catch { fail() }
    return () => { active = false }
  }, [known, uri, source, attempt])
  const current = measured?.source === source && measured?.uri === uri && measured?.attempt === attempt ? measured : null
  const aspect = known ?? current?.aspect ?? null
  const status = aspect ? 'ready' : !photo?.src && !id ? 'idle'
    : current?.status === 'failed' || entry?.status === 'error' ? 'failed' : 'loading'
  const retry = () => {
    setAttempt(value => value + 1)
    if (id && !uri) mediaService.retryDisplay(id).catch(() => {})
  }
  return { aspect, status, retry }
}
