import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, radius } from '../../../shared/theme'
import { CROP_MODES, CROP_RATIOS, CROP_ZOOM_MAX, CROP_ZOOM_MIN, PHOTO_SHAPES, POLAROID_RATIOS } from '../../constants'
import { polaroidHeight, ratioValueOf, resizeAroundCenter } from '../../utils/objects'
import { shapePath } from '../../utils/shapes'
import HelpButton, { useHelp } from '../controls/HelpButton'
import Icon from '../controls/Icon'
import Slider from '../controls/Slider'

/**
 * 사진 자르기 패널 (명세: 폴라로이드 · 도형 두 방식).
 * 열 때 히스토리 지점을 만들고, 여기서의 변경은 바로 캔버스에 반영한다.
 * 취소하면 그 지점으로 되돌리고, 적용하면 하나의 되돌리기 단위로 남는다.
 * 보이는 위치는 캔버스에서 사진을 끌어 옮긴다.
 * 사각·라운드 사진은 정해진 비율·원본 비율 외에 캔버스의 자르기 손잡이로 자유롭게 자를 수 있다. (CropHandles)
 */
export default function CropPanel({ photo, dispatch, onApply, onCancel }) {
  const update = (patch) => dispatch({ type: 'updateObject', id: photo.id, patch })
  const help = useHelp()
  const freeCrop = photo.frame === 'shape' && !PHOTO_SHAPES.find((s) => s.id === photo.shape)?.square
  // 폴라로이드 안쪽 사진 비율 (자유로 잘랐던 사진을 폴라로이드로 바꾸면 원본 비율로)
  const polaroidRatio = POLAROID_RATIOS.some((r) => r.id === photo.ratio) ? photo.ratio : 'original'
  const original = { fx: 0.5, fy: 0.5, zoom: 1 }

  function changeMode(mode) {
    if (mode === photo.frame) return
    if (mode === 'polaroid') {
      update({
        frame: 'polaroid',
        ratio: polaroidRatio,
        ...resizeAroundCenter(photo, photo.w, polaroidHeight(photo.w, polaroidRatio, photo)),
      })
      return
    }
    const square = PHOTO_SHAPES.find((s) => s.id === photo.shape)?.square
    const value = ratioValueOf(photo.ratio, photo) ?? photo.imageWidth / photo.imageHeight
    update({ frame: 'shape', ...resizeAroundCenter(photo, photo.w, square ? photo.w : photo.w / value) })
  }

  function changeRatio(ratioId) {
    // 원본 비율로 바꾸면 잘린 곳 없이 사진 전체가 보이게 되돌린다.
    const crop = ratioId === 'original' ? original : photo.crop
    if (photo.frame === 'polaroid') {
      update({ ratio: ratioId, crop, ...resizeAroundCenter(photo, photo.w, polaroidHeight(photo.w, ratioId, photo)) })
      return
    }
    const value = ratioValueOf(ratioId, photo)
    if (value == null) {
      update({ ratio: ratioId }) // 자유: 크기는 그대로 두고 손잡이로 자른다.
      return
    }
    // 넓이를 지키되 너무 길쭉해지지 않게 긴 변을 지금 긴 변에 맞춘다.
    const long = Math.max(photo.w, photo.h)
    const w = value >= 1 ? long : long * value
    update({ ratio: ratioId, crop, ...resizeAroundCenter(photo, w, w / value) })
  }

  function changeShape(shape) {
    const square = PHOTO_SHAPES.find((s) => s.id === shape)?.square
    const size = Math.min(photo.w, photo.h)
    update({ shape, ...(square ? resizeAroundCenter(photo, size, size) : {}) })
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>사진 자르기</Text>
          <HelpButton {...help} label="사진 자르기 도움말" />
        </View>
        <Pressable onPress={onCancel} hitSlop={8} accessibilityLabel="닫기">
          <Icon name="close" size={20} />
        </Pressable>
      </View>
      {help.open && <Text style={styles.hint}>페이지의 사진을 직접 끌어서 보이는 위치를 옮기고, 아래에서 확대해 보세요.</Text>}

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
              <Chip key={ratio.id} label={ratio.name} active={polaroidRatio === ratio.id} onPress={() => changeRatio(ratio.id)} />
            ))}
          </View>
        </Section>
      ) : (
        <>
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
          {freeCrop && (
            <Section title="비율">
              <View style={styles.chips}>
                {CROP_RATIOS.map((ratio) => (
                  <Chip
                    key={ratio.id}
                    label={ratio.name}
                    active={photo.ratio === ratio.id}
                    onPress={() => changeRatio(ratio.id)}
                  />
                ))}
              </View>
              <Text style={styles.ratioHint}>비율 없이 자르려면 사진 테두리의 자르기 손잡이를 끌어 보세요.</Text>
            </Section>
          )}
        </>
      )}

      <Section title={`확대 ${Math.round(photo.crop.zoom * 100)}%`}>
        <Slider
          value={photo.crop.zoom}
          min={CROP_ZOOM_MIN}
          max={CROP_ZOOM_MAX}
          step={0.1}
          minusLabel="사진 축소"
          plusLabel="사진 확대"
          onChange={(zoom) => update({ crop: { ...photo.crop, zoom } })}
        />
      </Section>

      <View style={styles.footer}>
        <Pressable
          onPress={() => update({ crop: original })}
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

const styles = StyleSheet.create({
  panel: { width: 300, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
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
  ratioHint: { marginTop: 8, fontSize: 11.5, lineHeight: 17, color: colors.textMuted },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.text, fontWeight: '800' },
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  shape: {
    width: 50,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shapeActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  shapeText: { fontSize: 10.5, color: colors.text },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  footerRight: { flexDirection: 'row', gap: 6 },
  ghostButton: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: 11 },
  ghostText: { fontSize: 13, fontWeight: '700', color: colors.text },
  pressed: { backgroundColor: colors.primarySoft },
  primaryButton: {
    height: 36,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  primaryPressed: { opacity: 0.85 },
  primaryText: { fontSize: 13, fontWeight: '800', color: colors.surface },
})
