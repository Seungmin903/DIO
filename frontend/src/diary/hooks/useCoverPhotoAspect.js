import { useEffect, useState } from 'react'
import { Image } from 'react-native'
import { useMediaEntry, useMediaUri } from '../../editor/hooks/useMediaUri'
import { mediaId } from '../../editor/utils/mediaReferences.js'
import { coverPhotoAspect } from '../utils/coverPhotoCrop.js'

// 예전 표지에는 crop만 있고 aspect가 없다. 원본 메타데이터로 복구하고,
// 원격 이미지에 크기 정보도 없을 때만 실제 표시 주소에서 크기를 읽는다.
export function useCoverPhotoAspect(photo) {
  const uri = useMediaUri(photo)
  const entry = useMediaEntry(mediaId(photo))
  const known = coverPhotoAspect(photo, entry?.media)
  const [measured, setMeasured] = useState(null)
  useEffect(() => {
    if (known || !uri) return undefined
    let active = true
    Image.getSize(uri, (width, height) => {
      const aspect = coverPhotoAspect({ width, height })
      if (active && aspect) setMeasured({ uri, aspect })
    }, () => {})
    return () => { active = false }
  }, [known, uri])
  return known ?? (measured?.uri === uri ? measured.aspect : null)
}
