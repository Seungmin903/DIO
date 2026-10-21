import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { TAPE_EDGES, TAPE_PALETTES, TAPE_PATTERN_NAMES, TAPE_SIZES } from '../../constants'
import { resizeAroundCenter, tapeSizeOf } from '../../utils/objects'
import TapeView, { tapeLook } from '../canvas/TapeView'
import ColorPicker from '../controls/ColorPicker'
import Icon from '../controls/Icon'

/**
 * 마스킹테이프 옵션. 붙인 테이프(옵션 패널)에는 끝선만, 보관함(draft)에는 넣을 때 정하는 규격·색상·무늬만 보인다.
 * 보관함(draft)에서는 dispatch 대신 onUpdate(patch) 를 넘기고, 아직 고르지 않은 무늬·색은 강조하지 않는다.
 * 무늬를 고르면 보관함이 그 설정으로 테이프를 붙인다. 이미지 테이프는 잘라서 등록한 규격 그대로라 끝선만 바꾼다.
 */
const PREVIEW_W = 76

export default function TapeOptions({ tape, dispatch, onUpdate, draft = false }) {
  const update = (patch, record = true) =>
    onUpdate ? onUpdate(patch, record) : dispatch({ type: 'updateObject', id: tape.id, record, patch })
  const isImage = Boolean(tape.src || tape.mediaFileId)
  const look = tapeLook(tape.pattern, tape.palette)
  // 고른 무늬·색 (draft 에서 아직 안 골랐으면 없음)
  const activePattern = draft ? tape.pattern : look.pattern
  const activePalette = draft ? tape.palette : look.palette
  const isCustom = Boolean(tape.palette?.startsWith('custom:'))
  const [customOpen, setCustomOpen] = useState(false)
  const [customTarget, setCustomTarget] = useState('bg')
  const currentSize = tapeSizeOf(tape).id
  // 무늬 미리보기 높이: 고른 규격의 실제 폭:길이 비율대로 (슬림은 가늘게, 와이드는 두껍게)
  const sizeInfo = tapeSizeOf(tape)
  const previewH = Math.max(5, Math.round((PREVIEW_W * sizeInfo.h) / sizeInfo.w))

  function changeSize(size) {
    // 길이는 그대로 두고 폭(높이)만 그 규격으로
    update({ size: size.id, ...resizeAroundCenter(tape, tape.w, size.h) })
  }

  return (
    <>
      {/* 끝선은 붙인 뒤에 고르는 옵션이라 보관함(draft)에는 두지 않는다 */}
      {!draft && (
      <Section title="끝선">
        <View style={styles.segment}>
          {TAPE_EDGES.map((edge) => {
            const active = (tape.edge ?? 'straight') === edge.id
            return (
              <Pressable
                key={edge.id}
                onPress={() => update({ edge: edge.id })}
                accessibilityRole="button"
                accessibilityLabel={`끝선 ${edge.name}`}
                accessibilityState={{ selected: active }}
                style={[styles.segmentItem, active && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{edge.name}</Text>
              </Pressable>
            )
          })}
        </View>
      </Section>
      )}

      {draft && !isImage && (
        <Section title="테이프 규격">
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

      {draft && !isImage && (
        <Section title="색상">
          <View style={styles.swatches}>
            {TAPE_PALETTES.map((color) => {
              const active = activePalette === color.id
              return (
                <Pressable
                  key={color.id}
                  onPress={() => update(draft ? { palette: color.id } : { pattern: look.pattern, palette: color.id })}
                  accessibilityLabel={`테이프 색 ${color.name}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.swatch, { backgroundColor: color.bg }, active && styles.swatchActive]}
                >
                  <View style={[styles.swatchInner, { backgroundColor: color.fg }]} />
                </Pressable>
              )
            })}
            {/* 마지막 칸: 사용자 지정. 누르면 지금 색에서 시작해 바탕·무늬 색을 따로 고른다 (이 테이프에만, 따로 저장하지 않음) */}
            <Pressable
              onPress={() => {
                if (!isCustom) update({ palette: `custom:${look.bg}:${look.fg}` })
                setCustomOpen(isCustom ? !customOpen : true)
              }}
              accessibilityLabel="테이프 색 사용자 지정"
              accessibilityState={{ selected: isCustom, expanded: customOpen }}
              style={[styles.swatch, isCustom ? { backgroundColor: look.bg } : styles.swatchCustom, isCustom && styles.swatchActive]}
            >
              {isCustom ? (
                <View style={[styles.swatchInner, { backgroundColor: look.fg }]} />
              ) : (
                // 저장되는 '추가'가 아니라 이 테이프 색만 직접 고르는 칸이라 + 대신 ···
                <Icon name="more" size={18} color={colors.textMuted} />
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
                onChange={(hex) =>
                  update({ palette: customTarget === 'bg' ? `custom:${hex}:${look.fg}` : `custom:${look.bg}:${hex}` })
                }
              />
            </View>
          )}
        </Section>
      )}

      {draft && !isImage && (
        <Section title="무늬">
          <View style={styles.patterns}>
            {Object.entries(TAPE_PATTERN_NAMES).map(([pattern, name]) => {
              const active = activePattern === pattern
              return (
                <Pressable
                  key={pattern}
                  onPress={() => update(draft ? { pattern } : { pattern, palette: look.palette })}
                  accessibilityRole="button"
                  accessibilityLabel={`무늬 ${name}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.patternCell, active && styles.patternActive]}
                >
                  <View style={styles.previewBox}>
                    <TapeView pattern={pattern} palette={look.palette} edge="straight" width={PREVIEW_W} height={previewH} scale={previewH / sizeInfo.h} />
                  </View>
                  <Text style={styles.patternName} numberOfLines={1}>
                    {name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
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
  // 규격이 바뀌어도 칸 높이가 흔들리지 않게 미리보기 자리를 고정
  previewBox: { height: 28, justifyContent: 'center' },
  patternActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  patternName: { fontSize: 11, fontWeight: '600', color: colors.text },
  // 46 칸 5개가 패널 안쪽 폭(268)에 꼭 맞는 간격. 마지막 줄이 덜 차도 칸이 위 줄과 줄 맞춰 놓인다.
  swatches: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 9.5, rowGap: 10 },
  // 46 이면 패널 안쪽 폭(268)에 한 줄 5칸 (6칸은 넘친다)
  swatch: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchInner: { position: 'absolute', right: 6, bottom: 6, width: 14, height: 14, borderRadius: 7 },
  swatchActive: { borderWidth: 3, borderColor: colors.primary },
  swatchCustom: { backgroundColor: colors.surface, borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'rgba(11,25,87,0.35)' },
  custom: { marginTop: 12, gap: 10 },
  customItem: { flexDirection: 'row', gap: 6, minHeight: 40 },
  customDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
})
