import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { TAPE_PALETTES, TAPE_PATTERN_NAMES, TAPE_SIZES } from '../../constants'
import { resizeAroundCenter, tapeSizeOf } from '../../utils/objects'
import TapeView, { tapeLook } from '../canvas/TapeView'
import ColorPicker from '../controls/ColorPicker'
import Icon from '../controls/Icon'

/**
 * 붙인 테이프 하나의 규격·무늬·색 (더보기 패널).
 * 보관함의 규격별 6종은 출발점이고, 붙인 뒤에는 어떤 무늬든 어떤 규격으로도 바꿀 수 있다.
 * - 규격: 길이는 그대로 두고 폭만 바꾼다. (가운데 기준)
 * - 이미지 테이프는 잘라서 등록한 규격 그대로 두고 길이만 바꾼다. (규격·무늬·색 없음)
 */
export default function TapeOptions({ tape, dispatch }) {
  const update = (patch, record = true) => dispatch({ type: 'updateObject', id: tape.id, record, patch })
  const [customOpen, setCustomOpen] = useState(false)
  const [customTarget, setCustomTarget] = useState('bg')
  const isImage = Boolean(tape.src || tape.mediaFileId)
  const look = tapeLook(tape.pattern, tape.palette)
  const currentSize = tapeSizeOf(tape).id
  const isCustom = look.palette.startsWith('custom:')
  const setCustom = (bg, fg, record) => update({ pattern: look.pattern, palette: `custom:${bg}:${fg}` }, record)

  function changeSize(size) {
    // 길이는 그대로 두고 폭(높이)만 그 규격으로
    update({ size: size.id, ...resizeAroundCenter(tape, tape.w, size.h) })
  }

  return (
    <>
      {!isImage && (
        <Section title="테이프 디자인 · 규격">
          <View style={styles.segment}>
            {TAPE_SIZES.map((size) => (
              <Pressable
                key={size.id}
                onPress={() => changeSize(size)}
                accessibilityRole="button"
                accessibilityState={{ selected: currentSize === size.id }}
                style={[styles.segmentItem, currentSize === size.id && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, currentSize === size.id && styles.segmentTextActive]}>{size.name}</Text>
                <Text style={styles.segmentHint}>{size.hint}</Text>
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      {!isImage && (
        <Section title="무늬 · 색은 그대로">
          <View style={styles.patterns}>
            {Object.entries(TAPE_PATTERN_NAMES).map(([pattern, name]) => {
              const active = look.pattern === pattern
              return (
                <Pressable
                  key={pattern}
                  onPress={() => update({ pattern, palette: look.palette })}
                  accessibilityRole="button"
                  accessibilityLabel={`무늬 ${name}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.patternCell, active && styles.patternActive]}
                >
                  <TapeView pattern={pattern} palette={look.palette} edge="straight" width={76} height={18} scale={0.8} />
                  <Text style={styles.patternName} numberOfLines={1}>
                    {name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Section>
      )}

      {!isImage && (
        <Section title="색 · 무늬는 그대로">
          <View style={styles.swatches}>
            {TAPE_PALETTES.map((color) => {
              const active = look.palette === color.id
              return (
                <Pressable
                  key={color.id}
                  onPress={() => update({ pattern: look.pattern, palette: color.id })}
                  accessibilityLabel={`테이프 색 ${color.name}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.swatch, { backgroundColor: color.bg }, active && styles.swatchActive]}
                >
                  <View style={[styles.swatchInner, { backgroundColor: color.fg }]} />
                </Pressable>
              )
            })}
            {/* 마지막 칸: 사용자 지정. 처음 누르면 지금 색에서 시작해 바탕·무늬 색을 따로 고른다. */}
            <Pressable
              onPress={() => {
                if (!isCustom) setCustom(look.bg, look.fg, true)
                setCustomOpen(isCustom ? !customOpen : true)
              }}
              accessibilityLabel="테이프 색 사용자 지정"
              accessibilityState={{ selected: isCustom, expanded: customOpen }}
              style={[
                styles.swatch,
                isCustom ? { backgroundColor: look.bg } : styles.swatchCustom,
                isCustom && styles.swatchActive,
              ]}
            >
              {isCustom ? (
                <View style={[styles.swatchInner, { backgroundColor: look.fg }]} />
              ) : (
                <Icon name="plus" size={18} color={colors.textMuted} />
              )}
            </Pressable>
          </View>
          {isCustom && customOpen && (
            <View style={styles.custom}>
              <View style={styles.segment}>
                {[
                  { id: 'bg', label: '바탕색', value: look.bg },
                  { id: 'fg', label: '무늬색', value: look.fg },
                ].map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setCustomTarget(item.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: customTarget === item.id }}
                    style={[styles.segmentItem, styles.customItem, customTarget === item.id && styles.segmentActive]}
                  >
                    <View style={[styles.customDot, { backgroundColor: item.value }]} />
                    <Text style={[styles.segmentText, customTarget === item.id && styles.segmentTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <ColorPicker
                key={customTarget}
                value={customTarget === 'bg' ? look.bg : look.fg}
                label={customTarget === 'bg' ? '테이프 바탕색' : '테이프 무늬색'}
                onStart={() => dispatch({ type: 'checkpoint' })}
                onChange={(hex) => (customTarget === 'bg' ? setCustom(hex, look.fg, false) : setCustom(look.bg, hex, false))}
              />
            </View>
          )}
        </Section>
      )}
    </>
  )
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  title: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: '#EEF2F9' },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  segmentHint: { fontSize: 10, color: colors.textMuted },
  // 한 줄 3칸·5칸이 좌우 여백 없이 꽉 차게 나눈다
  patterns: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
  patternCell: {
    width: '32.3%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  patternActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  patternName: { fontSize: 11, fontWeight: '600', color: colors.text },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  // 46 이면 패널 안쪽 폭(268)에 정확히 한 줄 5칸 (6칸은 넘친다) → 10칸이 5 + 5 로 딱 맞는다
  swatch: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCustom: { backgroundColor: colors.surface, borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'rgba(11,25,87,0.35)' },
  custom: { marginTop: 12, gap: 10 },
  customItem: { flexDirection: 'row', gap: 6, minHeight: 40 },
  customDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  swatchInner: { position: 'absolute', right: 6, bottom: 6, width: 14, height: 14, borderRadius: 7 },
  swatchActive: { borderWidth: 3, borderColor: colors.primary },
})
