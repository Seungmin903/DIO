import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { useColorWindow } from '../../diary/components/PresetColorEditor'
import { PlannerPopup, PLANNER_POPUP, popupFont } from './PlannerPopup'
import Icon from './controls/Icon'
import Slider from './controls/Slider'
import { ROUTE_DAY_RANGE, ROUTE_OPACITY_RANGE, ROUTE_PALETTE, ROUTE_WIDTH_RANGE } from '../templates/routePaper.js'
import { paperColorRow } from '../utils/paperColorRow.js'
import { recordPaperColor, usePaperColorRecents } from '../hooks/usePaperColorRecents.js'

// 여행 노선 속지 위에 뜨는 고르는 창 둘(데일리 플래너의 시간 · 날짜 창과 같은 속지 모양, PlannerPopup). 속지 색 창에는 노선 설정을 두지 않는다(QA 2026-11-09).
// routeDay: 머리줄 "DAY n" 을 누르면 — 번호 줄이기 · 늘리기. routeStyle: 아래 범례의 노선 견본을 누르면 — 노선 색(칸 4 + 추가) · 굵기 · 진하기.
// onChange(patch, phase): Canvas.changePlannerOptions — 슬라이더 · 색 창은 'start' → 'drag' → 'end' 가 되돌리기 한 단위, 번호 · 색 칸은 phase 없이 한 번.
const HEADER = 40, TOP = 2, BOTTOM = 14, GAP = 8, LABEL_H = 18, SWATCH = 32, SLIDER = 44
const PAPER = '#FFFFFF' // 속지 종이색(plannerDraw 바탕 rect 와 같다). 앱 테마 색이 아니라 속지 양식의 고정값
export const ROUTE_DAY_POPUP = { width: 220, height: HEADER + TOP + 48 + BOTTOM }
export const ROUTE_STYLE_POPUP = { width: 300, height: HEADER + TOP + LABEL_H + GAP + SWATCH + GAP + SLIDER + GAP + SLIDER + BOTTOM }
/** 위치를 정할 때 쓰는 창 크기 */
export const routePopupSize = kind => kind === 'routeDay' ? ROUTE_DAY_POPUP : ROUTE_STYLE_POPUP

export default function RouteStylePopup({ kind, options, onChange, onClose, style }) {
  if (kind === 'routeDay') {
    return <PlannerPopup label="DAY 번호" closeLabel="DAY 번호 닫기" onClose={onClose} style={style}><DayStepper options={options} onChange={onChange} /></PlannerPopup>
  }
  return <PlannerPopup label="노선 스타일" closeLabel="노선 스타일 닫기" onClose={onClose} style={style}><RouteStyle options={options} onChange={onChange} /></PlannerPopup>
}

function DayStepper({ options, onChange }) {
  const step = delta => onChange?.({ day: Math.min(ROUTE_DAY_RANGE.max, Math.max(ROUTE_DAY_RANGE.min, options.day + delta)) })
  const atMin = options.day <= ROUTE_DAY_RANGE.min, atMax = options.day >= ROUTE_DAY_RANGE.max
  return (
    <View style={styles.dayRow}>
      <Pressable onPress={() => step(-1)} disabled={atMin} accessibilityRole="button" accessibilityLabel="DAY 번호 줄이기" accessibilityState={{ disabled: atMin }}
        style={({ pressed }) => [styles.dayButton, pressed && styles.pressed, atMin && styles.disabled]}><Icon name="minus" size={16} color={PLANNER_POPUP.text} /></Pressable>
      <Text style={[styles.dayValue, popupFont(true)]} accessibilityLabel={`DAY ${options.day}`}>DAY {options.day}</Text>
      <Pressable onPress={() => step(1)} disabled={atMax} accessibilityRole="button" accessibilityLabel="DAY 번호 늘리기" accessibilityState={{ disabled: atMax }}
        style={({ pressed }) => [styles.dayButton, pressed && styles.pressed, atMax && styles.disabled]}><Icon name="plus" size={16} color={PLANNER_POPUP.text} /></Pressable>
    </View>
  )
}

function RouteStyle({ options, onChange }) {
  // 색 창의 start → drag → end 는 되돌리기 한 단위. 칸을 눌렀을 때(phase 없음)는 그 자체가 한 단위, 창에서 확정(end-pick)은 기록 반영 뒤 확정
  const pickColor = (color, phase) => {
    if (phase === 'start' || phase === 'end') return onChange?.({}, phase)
    if (phase === 'end-pick') { onChange?.({ color }, 'drag'); return onChange?.({}, 'end') }
    onChange?.({ color }, phase)
  }
  return (
    <>
      <Text style={[styles.label, popupFont()]}>노선 색</Text>
      <ColorRow kind="route" label="노선 색" presets={ROUTE_PALETTE} value={options.color} onPick={pickColor} />
      <Slider name="굵기" label="노선 굵기" minusLabel="노선 가늘게" plusLabel="노선 굵게" min={ROUTE_WIDTH_RANGE.min} max={ROUTE_WIDTH_RANGE.max} step={0.5}
        value={options.width} onStart={() => onChange?.({}, 'start')} onChange={(width) => onChange?.({ width: Math.round(width * 2) / 2 }, 'drag')} onEnd={() => onChange?.({}, 'end')} />
      <Slider name="진하기" label="노선 진하기" minusLabel="노선 더 투명하게" plusLabel="노선 더 진하게" min={Math.round(ROUTE_OPACITY_RANGE.min * 100)} max={100} step={5} unit="%"
        value={Math.round(options.opacity * 100)} onStart={() => onChange?.({}, 'start')} onChange={(value) => onChange?.({ opacity: value / 100 }, 'drag')} onEnd={() => onChange?.({}, 'end')} />
    </>
  )
}

/**
 * 색 한 줄: 보이는 칸 4개(직접 고른 최근 색 → 기본 견본 순, 지금 색은 항상 보임) + 추가(+). + 를 누르면 색 창이 열리고,
 * 고른 색은 이 종류(kind)의 최근 색으로 기억돼 왼쪽에서 들어온다(오른쪽 끝 색이 밀려난다).
 * onPick(color, phase): 칸을 누르면 phase 없이 한 번. 색 창은 'start' → 'drag'(미리보기) → 'end-pick'(확정) 또는 'end'(닫기).
 */
export function ColorRow({ kind, label, presets, value, onPick }) {
  const recent = usePaperColorRecents(kind)
  const colorWindow = useColorWindow()
  const anchor = useRef(null), ended = useRef(true)
  const row = paperColorRow(recent, presets, value)
  // 창 한 번 = 되돌리기 한 단위: start 한 번, end(확정 end-pick 또는 취소 end) 한 번. 확정 뒤 닫힘이 이어져도 end 는 다시 보내지 않는다
  const once = (color, phase) => { if (ended.current) return; ended.current = true; onPick?.(color, phase) }
  const openPicker = () => {
    ended.current = false
    onPick?.(value, 'start')
    colorWindow.open(anchor, { title: label, value, original: value,
      onChange: (color) => onPick?.(color, 'drag'),
      onDone: (color) => { once(color, 'end-pick'); recordPaperColor(kind, color) },
      onClose: () => once(value, 'end') })
  }
  return (
    <View style={styles.row}>
      {row.map(({ color, name }) => {
        const on = value?.toUpperCase() === color
        return (
          <Pressable hitSlop={8} key={color} onPress={() => onPick?.(color)} accessibilityRole="radio" accessibilityLabel={`${label} ${name}`} accessibilityState={{ selected: on }}
            style={[styles.swatch, { backgroundColor: color }, on && styles.swatchOn]} />
        )
      })}
      <Pressable ref={anchor} collapsable={false} hitSlop={8} onPress={openPicker} accessibilityRole="button" accessibilityLabel={`${label} 직접 고르기`} accessibilityState={{ expanded: colorWindow.isOpen }}
        style={[styles.swatch, styles.add]}>
        <Icon name="plus" size={16} color={PLANNER_POPUP.label} />
      </Pressable>
      {colorWindow.element}
    </View>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 11.5, lineHeight: LABEL_H, color: PLANNER_POPUP.label },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, height: SWATCH },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, borderWidth: 1, borderColor: PLANNER_POPUP.line },
  swatchOn: { borderWidth: 3, borderColor: colors.primary },
  // 추가(+) 칸: 점선 테두리의 빈 칸. 바탕은 창(PlannerPopup card)과 같은 속지 종이색(흰색) — 앱 테마가 아니라 속지 양식의 고정값
  add: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: PLANNER_POPUP.line, backgroundColor: PAPER },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48 },
  dayButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: PLANNER_POPUP.line },
  dayValue: { flex: 1, textAlign: 'center', fontSize: 20, color: PLANNER_POPUP.text },
  pressed: { backgroundColor: PLANNER_POPUP.band },
  disabled: { opacity: 0.4 },
})
