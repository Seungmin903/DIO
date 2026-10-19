import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, radius } from '../../theme'
import { CROP_MODES, CROP_ZOOM_MAX, CROP_ZOOM_MIN, PHOTO_SHAPES, POLAROID_RATIOS } from '../constants'
import { usePan } from '../hooks/usePan'
import { clamp } from '../utils/common'
import { polaroidHeight, resizeAroundCenter } from '../utils/objects'
import { shapePath } from '../utils/shapes'
import Icon from './Icon'

/**
 * 사진 자르기 패널 (명세: 폴라로이드 · 도형 두 방식).
 * 열 때 히스토리 지점을 만들고, 여기서의 변경은 바로 캔버스에 반영한다.
 * 취소하면 그 지점으로 되돌리고, 적용하면 하나의 되돌리기 단위로 남는다.
 * 보이는 위치는 캔버스에서 사진을 끌어 옮긴다.
 */
export default function CropPanel({ photo, dispatch, onApply, onCancel }) {
  const update = (patch) => dispatch({ type: 'updateObject', id: photo.id, patch })
  const ratioValue = POLAROID_RATIOS.find((r) => r.id === photo.ratio)?.value ?? 4 / 5

  function changeMode(mode) {
    if (mode === photo.frame) return
    if (mode === 'polaroid') {
      update({ frame: 'polaroid', ...resizeAroundCenter(photo, photo.w, polaroidHeight(photo.w, photo.ratio)) })
      return
    }
    const square = PHOTO_SHAPES.find((s) => s.id === photo.shape)?.square
    update({ frame: 'shape', ...resizeAroundCenter(photo, photo.w, square ? photo.w : photo.w / ratioValue) })
  }

  function changeRatio(ratioId) {
    update({ ratio: ratioId, ...resizeAroundCenter(photo, photo.w, polaroidHeight(photo.w, ratioId)) })
  }

  function changeShape(shape) {
    const square = PHOTO_SHAPES.find((s) => s.id === shape)?.square
    const size = Math.min(photo.w, photo.h)
    update({ shape, ...(square ? resizeAroundCenter(photo, size, size) : {}) })
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>사진 자르기</Text>
        <Pressable onPress={onCancel} hitSlop={8} accessibilityLabel="닫기">
          <Icon name="close" size={20} />
        </Pressable>
      </View>
      <Text style={styles.hint}>페이지의 사진을 직접 끌어서 보이는 위치를 옮기고, 아래에서 확대해 보세요.</Text>

      <View style={styles.segment}>
        {CROP_MODES.map((mode) => (
          <Pressable
            key={mode.id}
            onPress={() => changeMode(mode.id)}
            style={[styles.segmentItem, photo.frame === mode.id && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, photo.frame === mode.id && styles.segmentTextActive]}>{mode.name}</Text>
          </Pressable>
        ))}
      </View>

      {photo.frame === 'polaroid' ? (
        <Section title="비율">
          <View style={styles.chips}>
            {POLAROID_RATIOS.map((ratio) => (
              <Chip key={ratio.id} label={ratio.name} active={photo.ratio === ratio.id} onPress={() => changeRatio(ratio.id)} />
            ))}
          </View>
        </Section>
      ) : (
        <Section title="도형">
          <View style={styles.shapes}>
            {PHOTO_SHAPES.map((shape) => (
              <Pressable
                key={shape.id}
                onPress={() => changeShape(shape.id)}
                style={[styles.shape, photo.shape === shape.id && styles.shapeActive]}
                accessibilityLabel={shape.name}
              >
                <Svg width={30} height={30}>
                  <Path d={shapePath(shape.id, 30, 30)} fill={photo.shape === shape.id ? colors.primary : colors.secondary} />
                </Svg>
                <Text style={styles.shapeText}>{shape.name}</Text>
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      <Section title={`확대 ${Math.round(photo.crop.zoom * 100)}%`}>
        <ZoomSlider value={photo.crop.zoom} onChange={(zoom) => update({ crop: { ...photo.crop, zoom } })} />
      </Section>

      <View style={styles.footer}>
        <Pressable
          onPress={() => update({ crop: { fx: 0.5, fy: 0.5, zoom: 1 } })}
          style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
        >
          <Icon name="reset" size={15} />
          <Text style={styles.ghostText}>초기화</Text>
        </Pressable>
        <View style={styles.footerRight}>
          <Pressable onPress={onCancel} style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}>
            <Text style={styles.ghostText}>취소</Text>
          </Pressable>
          <Pressable onPress={onApply} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}>
            <Text style={styles.primaryText}>적용</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

/** RN 기본 컴포넌트에는 슬라이더가 없어서 직접 만든다. */
function ZoomSlider({ value, onChange }) {
  const [trackWidth, setTrackWidth] = useState(1)
  const startRef = useRef(0)
  const toValue = (x) => CROP_ZOOM_MIN + clamp(x / trackWidth, 0, 1) * (CROP_ZOOM_MAX - CROP_ZOOM_MIN)
  const ratio = (value - CROP_ZOOM_MIN) / (CROP_ZOOM_MAX - CROP_ZOOM_MIN)

  const panHandlers = usePan({
    onStart: (event) => {
      startRef.current = event.locationX
      onChange(toValue(event.locationX))
    },
    onMove: (dx) => onChange(toValue(startRef.current + dx)),
  })

  const step = (delta) => onChange(clamp(Math.round((value + delta) * 10) / 10, CROP_ZOOM_MIN, CROP_ZOOM_MAX))

  return (
    <View style={styles.sliderRow}>
      <Pressable onPress={() => step(-0.1)} style={styles.stepButton} accessibilityLabel="사진 축소">
        <Icon name="minus" size={16} />
      </Pressable>
      <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)} {...panHandlers}>
        <View style={styles.trackLine} pointerEvents="none" />
        <View style={[styles.trackFill, { width: `${ratio * 100}%` }]} pointerEvents="none" />
        <View style={[styles.thumb, { left: ratio * trackWidth - 11 }]} pointerEvents="none" />
      </View>
      <Pressable onPress={() => step(0.1)} style={styles.stepButton} accessibilityLabel="사진 확대">
        <Icon name="plus" size={16} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { width: 300, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  hint: {
    marginTop: 10,
    padding: 10,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textMuted,
  },
  segment: { flexDirection: 'row', marginTop: 14, padding: 4, borderRadius: 12, backgroundColor: '#EEF2F9' },
  segmentItem: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  segmentActive: { backgroundColor: colors.surface, shadowColor: '#0B1957', shadowOpacity: 0.1, shadowRadius: 4, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  section: { marginTop: 16 },
  sectionTitle: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 32, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.text, fontWeight: '800' },
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  shape: { width: 50, paddingVertical: 6, alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  shapeActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  shapeText: { fontSize: 10.5, color: colors.text },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2F9' },
  track: { flex: 1, height: 32, justifyContent: 'center' },
  trackLine: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: colors.surfaceSoft },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  footerRight: { flexDirection: 'row', gap: 6 },
  ghostButton: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: 11 },
  ghostText: { fontSize: 13, fontWeight: '700', color: colors.text },
  pressed: { backgroundColor: colors.primarySoft },
  primaryButton: { height: 36, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 18, backgroundColor: colors.primary },
  primaryPressed: { opacity: 0.85 },
  primaryText: { fontSize: 13, fontWeight: '800', color: colors.surface },
})
