import { useRef, useState } from 'react'
import { Image, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { CROP_ZOOM_MAX, CROP_ZOOM_MIN } from '../../constants'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import { useMediaUri } from '../../hooks/useMediaUri'
import { coverLayout } from '../../utils/objects'
import Icon from '../controls/Icon'
import Slider from '../controls/Slider'
import TapeView, { TAPE_RATIO } from '../canvas/TapeView'

const CONTEXT_PX = 70 // 테이프 틀 위아래로 보여 주는 사진 여유

/**
 * 사진으로 테이프를 만들 때(또는 붙인 이미지 테이프를 다시 자를 때) 테이프 틀 안에 들어갈 부분을 고른다.
 * 틀 밖 사진은 흐리게 보여 주고, 끌어서 위치를, 슬라이더로 확대를 정한다. 확정하면 crop 값만 넘긴다.
 * image: { src, poster?, width, height }  crop: { fx, fy, zoom }
 */
export default function TapeCropper({
  image,
  initialCrop,
  title = '테이프로 쓸 부분 고르기',
  confirmLabel = '테이프 만들기',
  onConfirm,
  onCancel,
}) {
  const window = useWindowDimensions()
  const uri = useMediaUri(image)
  const [crop, setCrop] = useState(initialCrop ?? { fx: 0.5, fy: 0.5, zoom: 1 })
  const start = useRef(crop)

  const cardWidth = Math.min(720, window.width - 48)
  const frameWidth = cardWidth - 48 - 40
  const frameHeight = frameWidth / TAPE_RATIO
  const photo = { imageWidth: image.width, imageHeight: image.height, crop }
  const layout = coverLayout(photo, frameWidth, frameHeight)

  const panHandlers = usePan({
    onStart: () => {
      start.current = crop
    },
    onMove: (dx, dy) => {
      const from = coverLayout({ ...photo, crop: start.current }, frameWidth, frameHeight)
      const overflowX = from.width - frameWidth
      const overflowY = from.height - frameHeight
      setCrop({
        ...start.current,
        fx: overflowX > 0 ? clamp(start.current.fx - dx / overflowX, 0, 1) : start.current.fx,
        fy: overflowY > 0 ? clamp(start.current.fy - dy / overflowY, 0, 1) : start.current.fy,
      })
    },
  })

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="취소">
              <Icon name="close" size={20} />
            </Pressable>
          </View>
          <Text style={styles.hint}>사진을 끌어서 테이프에 들어갈 위치를 맞추고, 아래에서 확대해 보세요.</Text>

          <View style={[styles.stage, { height: frameHeight + CONTEXT_PX * 2 }]} {...panHandlers}>
            {/* 틀 밖까지 이어지는 사진 (흐리게) */}
            <Image
              source={uri ? { uri } : null}
              style={[
                styles.context,
                { left: 20 + layout.left, top: CONTEXT_PX + layout.top, width: layout.width, height: layout.height },
              ]}
              resizeMode="stretch"
              pointerEvents="none"
            />
            <View
              style={[styles.frame, { left: 20, top: CONTEXT_PX, width: frameWidth, height: frameHeight }]}
              pointerEvents="none"
            >
              <TapeView
                src={image.src}
                mediaFileId={image.mediaFileId}
                crop={crop}
                imageWidth={image.width}
                imageHeight={image.height}
                edge="straight"
                width={frameWidth}
                height={frameHeight}
              />
            </View>
            <View
              style={[styles.frameLine, { left: 20 - 2, top: CONTEXT_PX - 2, width: frameWidth + 4, height: frameHeight + 4 }]}
              pointerEvents="none"
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>확대</Text>
            <View style={styles.slider}>
              <Slider
                value={crop.zoom}
                min={CROP_ZOOM_MIN}
                max={CROP_ZOOM_MAX}
                step={0.1}
                minusLabel="축소"
                plusLabel="확대"
                onChange={(zoom) => setCrop((prev) => ({ ...prev, zoom: Math.round(zoom * 100) / 100 }))}
              />
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm({ crop })}
              style={({ pressed }) => [styles.button, styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={[styles.buttonText, styles.primaryText]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  card: { padding: 24, borderRadius: 24, backgroundColor: colors.surface, ...shadow.float },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  hint: { marginTop: 6, fontSize: 12.5, color: colors.textMuted },
  stage: { marginTop: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#EEF2F9' },
  context: { position: 'absolute', opacity: 0.32 },
  frame: { position: 'absolute' },
  frameLine: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  label: { width: 64, fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  slider: { flex: 1 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: '#EEF2F9' },
  segmentItem: { height: 36, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  button: {
    height: 44,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.primarySoft },
  buttonText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  primaryPressed: { opacity: 0.85 },
  primaryText: { color: colors.surface },
})
