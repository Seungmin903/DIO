import { useRef, useState } from 'react'
import { Image, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { CROP_ZOOM_MAX, CROP_ZOOM_MIN, TAPE_SIZES } from '../../constants'
import { clamp } from '../../utils/common'
import { useMediaUri } from '../../hooks/useMediaUri'
import { coverLayout } from '../../utils/objects'
import HelpButton, { useHelp } from '../controls/HelpButton'
import Icon from '../controls/Icon'
import Slider from '../controls/Slider'
import TapeView from '../canvas/TapeView'

const CONTEXT_PX = 70 // 테이프 틀 위아래로 보여 주는 사진 여유

/**
 * 사진으로 테이프를 만들 때(또는 붙인 이미지 테이프를 다시 자를 때) 테이프 틀 안에 들어갈 부분을 고른다.
 * 틀 밖 사진은 흐리게 보여 주고, 끌어서 위치를, 두 손가락이나 슬라이더로 확대를 정한다. 확정하면 crop 값만 넘긴다.
 * image: { src, poster?, width, height }  crop: { fx, fy, zoom }
 */
export default function TapeCropper({
  image,
  initialCrop,
  initialSize = 'standard',
  ratio: fixedRatio, // 다시 자를 때: 붙어 있는 테이프의 가로:세로 (규격 고르기 숨김)
  title = '테이프로 쓸 부분 고르기',
  confirmLabel = '테이프 만들기',
  onConfirm,
  onCancel,
}) {
  const help = useHelp()
  const window = useWindowDimensions()
  const uri = useMediaUri(image)
  const [crop, setCrop] = useState(initialCrop ?? { fx: 0.5, fy: 0.5, zoom: 1 })
  const [sizeId, setSizeId] = useState(initialSize)
  const size = TAPE_SIZES.find((s) => s.id === sizeId) ?? TAPE_SIZES[1]
  const ratio = fixedRatio ?? size.w / size.h

  const cardWidth = Math.min(720, window.width - 48)
  const frameWidth = cardWidth - 48 - 40
  const frameHeight = frameWidth / ratio
  const photo = { imageWidth: image.width, imageHeight: image.height, crop }
  const layout = coverLayout(photo, frameWidth, frameHeight)

  // 한 손가락: 끌어서 위치 / 두 손가락: 벌리고 오므려 확대·축소 + 함께 끌어 이동.
  // 손가락 수가 바뀔 때마다 그 순간의 crop·손가락 위치를 기준으로 다시 잡는다.
  const cropRef = useRef(crop)
  cropRef.current = crop
  const gesture = useRef(null)
  const touchesOf = (event) => {
    const list = event.nativeEvent.touches?.length ? event.nativeEvent.touches : [event.nativeEvent]
    const c = list.reduce((acc, t) => ({ x: acc.x + t.pageX / list.length, y: acc.y + t.pageY / list.length }), { x: 0, y: 0 })
    const dist = list.length > 1 ? Math.hypot(list[0].pageX - list[1].pageX, list[0].pageY - list[1].pageY) : 0
    return { count: list.length, c, dist }
  }
  const rebase = (event) => {
    gesture.current = { crop: cropRef.current, ...touchesOf(event) }
  }
  const stageHandlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: rebase,
    onResponderStart: rebase,
    onResponderEnd: (event) => {
      if (event.nativeEvent.touches?.length) rebase(event)
    },
    onResponderMove: (event) => {
      const g = gesture.current
      if (!g) return
      const now = touchesOf(event)
      if (now.count !== g.count) {
        rebase(event)
        return
      }
      const zoom = now.count > 1 && g.dist > 0 ? clamp(g.crop.zoom * (now.dist / g.dist), CROP_ZOOM_MIN, CROP_ZOOM_MAX) : g.crop.zoom
      const next = coverLayout({ ...photo, crop: { ...g.crop, zoom } }, frameWidth, frameHeight)
      const overflowX = next.width - frameWidth
      const overflowY = next.height - frameHeight
      const dx = now.c.x - g.c.x
      const dy = now.c.y - g.c.y
      setCrop({
        zoom: Math.round(zoom * 100) / 100,
        fx: overflowX > 0 ? clamp(g.crop.fx - dx / overflowX, 0, 1) : g.crop.fx,
        fy: overflowY > 0 ? clamp(g.crop.fy - dy / overflowY, 0, 1) : g.crop.fy,
      })
    },
    onResponderRelease: () => {
      gesture.current = null
    },
    onResponderTerminate: () => {
      gesture.current = null
    },
  }

  return (
    <Modal transparent animationType="none" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <Text style={styles.title}>{title}</Text>
              <HelpButton {...help} label="테이프 자르기 도움말" />
            </View>
            <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="취소">
              <Icon name="close" size={20} />
            </Pressable>
          </View>
          {help.open && <Text style={styles.hint}>사진을 끌어서 테이프에 들어갈 위치를 맞추고, 두 손가락으로 벌리거나 아래 막대로 확대해 보세요.</Text>}

          <View style={[styles.stage, { height: frameHeight + CONTEXT_PX * 2 }]} {...stageHandlers}>
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
                scale={100}
                unit="%"
                label="확대"
                onChange={(zoom) => setCrop((prev) => ({ ...prev, zoom: Math.round(zoom * 100) / 100 }))}
              />
            </View>
          </View>
          {!fixedRatio && (
            <View style={styles.row}>
              <Text style={styles.label}>규격</Text>
              <View style={styles.segment}>
                {TAPE_SIZES.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setSizeId(item.id)}
                    style={[styles.segmentItem, sizeId === item.id && styles.segmentActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sizeId === item.id }}
                  >
                    <Text style={[styles.segmentText, sizeId === item.id && styles.segmentTextActive]}>
                      {item.name} {item.hint}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm({ crop, size: sizeId })}
              style={({ pressed }) => [styles.button, styles.confirm, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, styles.confirmText]}>{confirmLabel}</Text>
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
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  hint: { marginTop: 6, fontSize: 12.5, color: colors.textMuted },
  stage: { marginTop: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#EEF2F9', ...Platform.select({ web: { touchAction: 'none' }, default: {} }) },
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
  // 확정: 흰 바탕에 남색 글씨 (사진 자르기 창과 같게)
  confirm: { borderColor: colors.text },
  confirmText: { color: colors.text, fontWeight: '800' },
})
