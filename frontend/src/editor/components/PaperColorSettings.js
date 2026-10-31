import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { PAPER_BACKGROUNDS, PAPER_LAYOUTS } from '../templates/appearance.js'
import { DEFAULT_PAPER_FONT } from '../templates/paperFont.js'
import { PaperFontPicker } from './PaperFontChips'
import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { START_HOURS } from '../templates/studyPlanner.js'
import { HIGHLIGHTER_COLORS } from '../utils/penSettings'

const SCOPES = [{ id: 'page', label: '이 페이지' }, { id: 'all', label: '모든 페이지' }]

const SNAP = [{ id: 'on', label: '켬' }, { id: 'off', label: '끔' }]

/**
 * 속지 색 (빈 곳을 길게 눌러 연다). 다이어리를 만들 때 고르는 배경색·레이아웃 색과 같은 색들이다.
 * appearance: 지금 페이지의 { backgroundColor, layoutColor }. onChange(appearance, all): all 이면 모든 페이지(와 새로 추가할 페이지)에 쓴다.
 * showFont: 인쇄 글자가 있는 속지면 속지 글꼴(appearance.font, 없으면 원본 마루부리)을 함께 고른다. 이미 만든 페이지는 이 페이지 · 모든 페이지를 직접 고를 때만 바뀐다.
 * planner: 스터디 · 데일리 플래너 페이지면 기록의 옵션을 함께 보여 준다. 스터디는 { restColor, startHour, snap }, 데일리(plannerKind 'day')는 { snap }. onPlannerOptions(patch)
 */
export default function PaperColorSettings({ appearance, onChange, onClose, style, planner = null, plannerKind = 'study', onPlannerOptions, showFont = false }) {
  const [scope, setScope] = useState('page')
  const pick = (patch) => onChange({ ...appearance, ...patch }, scope === 'all')
  return (
    <View style={[toolPanelStyles.card, style]} accessibilityLabel="속지 색 설정" onStartShouldSetResponder={() => true}>
      <ToolPanelHeader icon="roller" title={planner ? '속지 옵션' : '속지 색'} closeLabel={planner ? '속지 옵션 닫기' : '속지 색 설정 닫기'} onClose={onClose} />
      <View style={toolPanelStyles.content}>
        <Segmented items={SCOPES} selected={(id) => scope === id} onPress={setScope} />
        {[['backgroundColor', '배경색', PAPER_BACKGROUNDS], ['layoutColor', '레이아웃 색', PAPER_LAYOUTS]].map(([key, label, presets]) => (
          <View key={key} style={styles.section}>
            <Text style={toolPanelStyles.label}>{label}</Text>
            <View style={styles.row}>
              {presets.map(([name, color]) => {
                const on = appearance[key]?.toUpperCase() === color.toUpperCase()
                return (
                  <Pressable key={color} onPress={() => pick({ [key]: color })} accessibilityRole="radio" accessibilityLabel={`${label} ${name}`} accessibilityState={{ selected: on }}
                    style={[styles.swatch, { backgroundColor: color }, on && styles.swatchOn]} />
                )
              })}
            </View>
          </View>
        ))}
        {showFont && (
          <View style={styles.section}>
            <Text style={toolPanelStyles.label}>글꼴</Text>
            <PaperFontPicker value={appearance.font ?? DEFAULT_PAPER_FONT} onChange={(font) => pick({ font: font === DEFAULT_PAPER_FONT ? undefined : font })} />
          </View>
        )}
        {planner && (plannerKind === 'day' ? <DayPlannerOptions options={planner.options} onChange={onPlannerOptions} /> : <PlannerOptions options={planner.options} onChange={onPlannerOptions} />)}
      </View>
    </View>
  )
}

/** 스터디 플래너 옵션. 이 페이지에만 쓴다. */
function PlannerOptions({ options, onChange }) {
  const rest = [null, ...HIGHLIGHTER_COLORS]
  return (
    <>
      <View style={styles.section}>
        <Text style={toolPanelStyles.label}>쉬는 시간 색 · 합계에서 빼요</Text>
        <View style={styles.row}>
          {rest.map((color) => {
            const on = (options.restColor ?? null) === (color && color.toUpperCase())
            return (
              <Pressable key={color ?? 'none'} onPress={() => onChange?.({ restColor: color && color.toUpperCase() })} accessibilityRole="radio"
                accessibilityLabel={color ? `쉬는 시간 색 ${color}` : '쉬는 시간 색 없음'} accessibilityState={{ selected: on }}
                style={[styles.restSwatch, color ? { backgroundColor: color } : styles.none, on && styles.swatchOn]}>
                {!color && <Text style={styles.noneText}>없음</Text>}
              </Pressable>
            )
          })}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={toolPanelStyles.label}>시간표 시작</Text>
        <Segmented items={START_HOURS.map((hour) => ({ id: hour, label: `${hour}시` }))} selected={(id) => options.startHour === id} onPress={(startHour) => onChange?.({ startHour })} />
      </View>
      <View style={styles.section}>
        <Text style={toolPanelStyles.label}>형광펜 칸 맞춤</Text>
        <Segmented items={SNAP} selected={(id) => (id === 'on') === options.snap} onPress={(id) => onChange?.({ snap: id === 'on' })} />
      </View>
    </>
  )
}

/** 데일리 플래너 옵션. 이 페이지에만 쓴다. */
function DayPlannerOptions({ options, onChange }) {
  return (
    <View style={styles.section}>
      <Text style={toolPanelStyles.label}>펜 · 형광펜 칸 맞춤</Text>
      <Segmented items={SNAP} selected={(id) => (id === 'on') === options.snap} onPress={(id) => onChange?.({ snap: id === 'on' })} />
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(11,23,102,0.15)' },
  swatchOn: { borderWidth: 3, borderColor: colors.primary },
  restSwatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(11,23,102,0.15)', alignItems: 'center', justifyContent: 'center' },
  none: { backgroundColor: colors.surface },
  noneText: { fontSize: 9, fontWeight: '700', color: colors.textMuted },
})
