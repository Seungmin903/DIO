import { useRef } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { CROP_ZOOM_MAX } from '../../constants'
import { createFixedCropGesture, fixedCropImage } from '../../utils/fixedCropGeometry.js'

export default function FixedPhotoCrop({ uri, rect, frame, onChange, onInteraction }) {
  const latest = useRef(null)
  latest.current = { rect, frame, maxZoom: CROP_ZOOM_MAX, onInteraction, onChange(next) {
    // 손가락 추가·해제가 다시 그리기보다 먼저 와도 최신 영역에서 재개한다.
    latest.current.rect = next
    onChange(next)
  } }
  const gesture = useRef(null)
  if (!gesture.current) gesture.current = createFixedCropGesture(() => latest.current)
  const image = fixedCropImage(rect, frame)
  return (
    <View {...gesture.current} style={StyleSheet.absoluteFill} accessibilityLabel="프로필 사진 이동 및 확대" testID="profile-crop-gesture">
      <Image pointerEvents="none" source={uri ? { uri } : null} resizeMode="stretch" style={[styles.context, image]} />
      <View pointerEvents="none" testID="profile-crop-circle" style={[styles.frame, frame, { borderRadius: frame.width / 2 }]}>
        <Image source={uri ? { uri } : null} resizeMode="stretch" style={{ position: 'absolute', left: image.left - frame.left, top: image.top - frame.top, width: image.width, height: image.height }} />
      </View>
      <View pointerEvents="none" style={[styles.outline, frame, { borderRadius: frame.width / 2 }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  context: { position: 'absolute', opacity: 0.3 },
  frame: { position: 'absolute', overflow: 'hidden' },
  outline: { position: 'absolute', borderWidth: 2, borderColor: colors.primary },
})
