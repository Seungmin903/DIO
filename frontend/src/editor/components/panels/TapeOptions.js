import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { TAPE_EDGES, TAPE_PALETTES, TAPE_PATTERN_NAMES } from '../../constants'
import { tapeSizeOf } from '../../utils/objects'
import TapeView, { tapeLook } from '../canvas/TapeView'
import MyColorPresets from '../controls/MyColorPresets'
import { tapeColors, usePalette } from '../../hooks/usePalettes'

/**
 * 마스킹테이프 옵션. 붙인 테이프(옵션 패널)에는 끝선만, 보관함(draft)에는 넣을 때 정하는 규격·색상·무늬만 보인다.
 * 보관함(draft)에서는 dispatch 대신 onUpdate(patch) 를 넘기고, 아직 고르지 않은 무늬·색은 강조하지 않는다.
 * 무늬를 고르면 보관함이 그 설정으로 테이프를 붙인다. 이미지 테이프는 잘라서 등록한 규격 그대로라 끝선만 바꾼다.
 */
const PREVIEW_W = 96 // 코덱스 22번: 무늬 카드 128×72 안의 미리보기 96 폭

/** 바탕색보다 진한 무늬 색 (내 색상으로 고른 테이프) */
function deeper(hex) {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift) => Math.round(((n >> shift) & 255) * 0.7)
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export default function TapeOptions({ tape, dispatch, onUpdate, draft = false }) {
  const update = (patch, record = true) =>
    onUpdate ? onUpdate(patch, record) : dispatch({ type: 'updateObject', id: tape.id, record, patch })
  const isImage = Boolean(tape.src || tape.mediaFileId)
  const look = tapeLook(tape.pattern, tape.palette)
  // 고른 무늬·색 (draft 에서 아직 안 골랐으면 없음)
  const activePattern = draft ? tape.pattern : look.pattern
  const activePalette = draft ? tape.palette : look.palette
  // 색 줄은 꾸미기 공방 '내 프리셋'의 테이프 색을 따른다(기본 색 id 또는 'custom:#바탕:#무늬')
  const tapePalette = usePalette?.('tape')?.colors ?? TAPE_PALETTES.filter((color) => !color.hidden).map((color) => color.id)
  const isCustom = Boolean(tape.palette?.startsWith('custom:'))
  // 내 색상으로 바꿀 색: 바탕(bg) 또는 무늬(fg). + 로 피커를 열었을 때만 고를 수 있고, 닫혀 있으면 바탕색이다.
  // 처음 고르는 바탕색에는 그보다 진한 무늬색을 짝지어 준다.
  const [colorSlot, setColorSlot] = useState('bg')
  const [customOpen, setCustomOpen] = useState(false)
  const slotColor = colorSlot === 'bg' ? look.bg : look.fg
  const pickCustom = (hex) => {
    // 저장한 두 색(바탕/무늬)은 그대로 쓴다
    if (hex.includes('/')) return update({ palette: `custom:${hex.replace('/', ':')}` })
    if (colorSlot === 'bg') update({ palette: `custom:${hex}:${isCustom ? look.fg : deeper(hex)}` })
    else update({ palette: `custom:${look.bg}:${hex}` })
  }
  // 무늬 미리보기 높이: 기본 폭의 실제 폭:길이 비율대로
  const sizeInfo = tapeSizeOf(tape)
  const previewH = Math.max(5, Math.round((PREVIEW_W * sizeInfo.h) / sizeInfo.w))

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
        <Section title="색상">
          <View style={styles.swatches}>
            {tapePalette.map((entry) => {
              const color = { ...tapeColors(entry), name: TAPE_PALETTES.find((item) => item.id === entry)?.name ?? entry.split(':').slice(1).join('/') }
              const active = activePalette === entry
              return (
                <Pressable
                  key={entry}
                  onPress={() => update(draft ? { palette: entry } : { pattern: look.pattern, palette: entry })}
                  accessibilityLabel={`테이프 색 ${color.name}`}
                  accessibilityState={{ selected: active }}
                  style={[styles.swatch, { backgroundColor: color.bg }, active && styles.swatchActive]}
                >
                  <View style={[styles.swatchInner, { backgroundColor: color.fg }]} />
                </Pressable>
              )
            })}
          </View>
        </Section>
      )}

      {/* 내 색상: 테이프만의 저장 목록. 저장한 색은 바탕색으로, + 로 연 피커에서는 바탕색·무늬색을 골라 바꾼다 */}
      {draft && !isImage && (
        <Section title="내 색상">
          <MyColorPresets
            scope="tape"
            // 피커는 지금 테이프 색에서 시작한다. 닫혀 있을 때는 내 색상을 쓴 테이프만 저장한 색을 표시한다
            value={isCustom || customOpen ? slotColor : null}
            entry={isCustom || customOpen ? `${look.bg}/${look.fg}` : null}
            label={customOpen ? (colorSlot === 'bg' ? '테이프 바탕색' : '테이프 무늬색') : '테이프 색'}
            onPick={pickCustom}
            onPickerOpenChange={(open) => { setCustomOpen(open); if (!open) setColorSlot('bg') }}
            pickerTop={(
              <View style={styles.segment}>
                {[{ id: 'bg', name: '바탕색', color: look.bg }, { id: 'fg', name: '무늬색', color: look.fg }].map((slot) => {
                  const active = colorSlot === slot.id
                  return (
                    <Pressable
                      key={slot.id}
                      onPress={() => setColorSlot(slot.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${slot.name} 바꾸기`}
                      accessibilityState={{ selected: active }}
                      style={[styles.segmentItem, styles.slotItem, active && styles.segmentActive]}
                    >
                      <View style={[styles.slotSwatch, { backgroundColor: slot.color }]} />
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{slot.name}</Text>
                    </Pressable>
                  )
                })}
              </View>
            )}
          />
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
  // B안 테두리 칩: 칸마다 흰 면 + 1px 테두리, 고르면 primaryStrong 2px
  segment: { flexDirection: 'row', gap: 6 },
  slotItem: { flexDirection: 'row', gap: 6 },
  slotSwatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(11,23,102,0.15)' },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  segmentActive: { borderColor: colors.primaryStrong, borderWidth: 2 },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '800' },
  // 한 줄 3칸·5칸이 좌우 여백 없이 꽉 차게 나눈다
  // 코덱스 22번: 무늬는 2열, 카드 128×72 (미리보기 96 폭)
  patterns: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  patternCell: {
    width: 128,
    maxWidth: '48%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
  },
  // 규격이 바뀌어도 칸 높이가 흔들리지 않게 미리보기 자리를 고정
  previewBox: { height: 30, justifyContent: 'center' },
  patternActive: { borderWidth: 2, borderColor: colors.primaryStrong },
  patternName: { fontSize: 11, fontWeight: '600', color: colors.text },
  // 46 칸 5개가 패널 안쪽 폭(268)에 꼭 맞는 간격. 마지막 줄이 덜 차도 칸이 위 줄과 줄 맞춰 놓인다.
  // 펜·형광펜·글자 색처럼 한 줄에 같은 간격, 같은 크기(30)로
  swatches: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15, // 펜 · 형광펜 · 글자 색과 같은 원
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 무늬 색: 오른쪽 아래 작은 점
  swatchInner: { position: 'absolute', right: 3, bottom: 3, width: 8, height: 8, borderRadius: 4 },
  swatchActive: { borderWidth: 3, borderColor: colors.primaryStrong },
  swatchCustom: { backgroundColor: colors.surface, borderStyle: 'dashed', borderWidth: 1.5, borderColor: 'rgba(11,23,102,0.35)' },
  custom: { marginTop: 12, gap: 10 },
  customItem: { flexDirection: 'row', gap: 6, minHeight: 40 },
  customDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
})
