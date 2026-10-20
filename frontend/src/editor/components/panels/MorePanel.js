import { useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, shadow } from '../../../shared/theme'
import { FRAME_COLORS } from '../../constants'
import { normalizeAngle } from '../../utils/common'
import Icon from '../controls/Icon'
import { frameColorOf, objectOpacity, photoSupportsShadow } from '../canvas/ObjectView'
import Slider from '../controls/Slider'
import EffectOptions from './EffectOptions'
import TapeOptions from './TapeOptions'

const ALIGN_ACTIONS = [
  { mode: 'left', label: '왼쪽' },
  { mode: 'hcenter', label: '가운데' },
  { mode: 'right', label: '오른쪽' },
  { mode: 'top', label: '위' },
  { mode: 'vcenter', label: '중간' },
  { mode: 'bottom', label: '아래' },
]

const TYPE_TITLES = { sticker: '스티커', photo: '사진', tape: '마스킹테이프' }

/**
 * 선택한 요소의 세부 옵션 (편집 바의 '더보기').
 * 캔버스 위에 띄우면 요소·편집 바를 가리기 쉬워서 보관함처럼 편집 영역 오른쪽에 붙인다.
 * 탭 두 개: '꾸미기'(테두리·그림자, 테이프 디자인, 폴라로이드 틀 색)를 먼저, '배치'(투명도·반전·회전·정렬)는 뒤에.
 * 꾸밀 것이 없는 요소(이미지 테이프 등)는 배치만 보여 준다.
 */
export default function MorePanel({ objects, dispatch, onClose }) {
  const [tab, setTab] = useState('style')
  const ids = objects.map((o) => o.id)
  const editable = objects.filter((o) => !o.locked)
  const single = objects.length === 1 ? objects[0] : null
  const isPolaroid = single?.type === 'photo' && single.frame === 'polaroid' && !single.locked
  const isTape = single?.type === 'tape' && !single.locked
  const isPatternTape = isTape && !single.src && !single.mediaFileId
  const hasEffects = editable.some(
    (o) => o.type === 'sticker' || (o.type === 'photo' && (o.frame === 'shape' || photoSupportsShadow(o))),
  )
  const hasStyle = hasEffects || isPatternTape || isPolaroid
  const current = hasStyle ? tab : 'layout'
  const title = objects.length > 1 ? `${objects.length}개 요소` : `${TYPE_TITLES[single?.type] ?? '요소'} 옵션`
  const updateEach = (makePatch, record = true) =>
    dispatch({ type: 'updateMany', record, patches: Object.fromEntries(editable.map((o) => [o.id, makePatch(o)])) })

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="옵션 닫기">
          <Icon name="close" size={18} />
        </Pressable>
      </View>

      {hasStyle && editable.length > 0 && (
        <View style={styles.tabs} accessibilityRole="tablist">
          {[
            { id: 'style', label: '꾸미기' },
            { id: 'layout', label: '배치' },
          ].map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: current === item.id }}
              style={[styles.tab, current === item.id && styles.tabActive]}
            >
              <Text style={[styles.tabText, current === item.id && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!editable.length ? (
          <Text style={styles.hint}>잠긴 요소예요. 잠금을 풀면 편집할 수 있어요.</Text>
        ) : current === 'style' ? (
          <>
            <EffectOptions objects={editable} dispatch={dispatch} />

            {isTape && <TapeOptions tape={single} dispatch={dispatch} />}

            {isPolaroid && (
              <Section title="폴라로이드 틀 색">
                <View style={styles.chips}>
                  {FRAME_COLORS.map((color) => (
                    <Pressable
                      key={color.id}
                      onPress={() =>
                        dispatch({ type: 'updateObject', id: single.id, record: true, patch: { frameColor: color.id } })
                      }
                      accessibilityLabel={`틀 색 ${color.name}`}
                      accessibilityState={{ selected: frameColorOf(single) === color.value }}
                      style={[
                        styles.swatch,
                        { backgroundColor: color.value },
                        frameColorOf(single) === color.value && styles.swatchActive,
                      ]}
                    />
                  ))}
                </View>
              </Section>
            )}
          </>
        ) : (
          <>
            <Section title={`투명도 ${Math.round(objectOpacity(editable[0]) * 100)}%`}>
              <Slider
                value={objectOpacity(editable[0])}
                min={0.1}
                max={1}
                step={0.1}
                minusLabel="더 투명하게"
                plusLabel="덜 투명하게"
                onStart={() => dispatch({ type: 'checkpoint' })}
                onChange={(value) => updateEach(() => ({ opacity: Math.round(value * 100) / 100 }), false)}
              />
            </Section>

            <Section title="반전 · 회전">
              <View style={styles.chips}>
                <Chip label="좌우 반전" onPress={() => updateEach((o) => ({ flipX: !o.flipX }))} />
                <Chip label="상하 반전" onPress={() => updateEach((o) => ({ flipY: !o.flipY }))} />
                <Chip
                  label="↺ 90°"
                  onPress={() => updateEach((o) => ({ rotation: normalizeAngle(Math.round(o.rotation) - 90) }))}
                />
                <Chip
                  label="↻ 90°"
                  onPress={() => updateEach((o) => ({ rotation: normalizeAngle(Math.round(o.rotation) + 90) }))}
                />
                <Chip label="0°" onPress={() => updateEach(() => ({ rotation: 0 }))} />
              </View>
            </Section>

            <Section title={objects.length > 1 ? '정렬 · 선택 영역 기준' : '정렬 · 페이지 기준'}>
              <View style={styles.chips}>
                {ALIGN_ACTIONS.map((action) => (
                  <Chip
                    key={action.mode}
                    label={action.label}
                    onPress={() => dispatch({ type: 'align', ids, mode: action.mode })}
                  />
                ))}
                {editable.length > 2 && (
                  <>
                    <Chip label="가로 간격 맞춤" onPress={() => dispatch({ type: 'align', ids, mode: 'hspace' })} />
                    <Chip label="세로 간격 맞춤" onPress={() => dispatch({ type: 'align', ids, mode: 'vspace' })} />
                  </>
                )}
              </View>
            </Section>
          </>
        )}
      </ScrollView>
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

function Chip({ label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  panel: {
    width: 300,
    maxWidth: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.97)',
    // 웹에서는 뒤 캔버스가 살짝 비치는 유리 질감 (네이티브는 불투명 흰 배경)
    ...Platform.select({ web: { backgroundColor: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(18px)' }, default: {} }),
    overflow: 'hidden',
    ...shadow.float,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#EEF2F9',
  },
  tab: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: colors.surface, boxShadow: '0px 1px 3px rgba(11, 25, 87, 0.14)' },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  close: { padding: 6 },
  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 18 },
  hint: { paddingTop: 12, fontSize: 12.5, color: colors.textMuted },
  section: { marginTop: 14 },
  sectionTitle: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.primarySoft },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  swatchActive: { borderWidth: 3, borderColor: colors.primary },
})
