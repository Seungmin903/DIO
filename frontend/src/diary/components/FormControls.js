import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SettingSwitch } from './SettingRow'
import ColorPicker from '../../editor/components/controls/ColorPicker'
import { useColorWindow } from './PresetColorEditor'
import Icon from '../../editor/components/controls/Icon'
import { Segmented } from '../../editor/components/ToolPanel'
import { colors } from '../../shared/theme'
import { clampWhole } from '../utils/paperChoice'
import { PanelScroll } from './Workbench'
import { GRID_COLUMNS, swatchGridLayout } from '../utils/swatchGridLayout'

// 새 다이어리 · 다이어리 수정 화면이 함께 쓰는 입력 부품.
// 숫자는 − [값] + 단위, 색은 견본 줄 + # HEX + 색 고르기, 켜고 끄는 요소는 줄 머리의 스위치.

export { Segmented }

/** 왼쪽 이름 + 오른쪽 입력 한 줄 */
export function OptionRow({ label, children }) {
  return <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.rowValue}>{children}</View>
  </View>
}

export function Toggle({ value, onChange, label, disabled = false }) {
  return <SettingSwitch label={label} on={value} disabled={disabled} onToggle={onChange} />
}

/** − [직접 입력] + 단위. 입력 중에는 글자를 그대로 두고, 칸을 떠나면 범위 안의 정수로 맞춘다. */
export function NumberField({ value, onChange, min, max, unit, label, disabled = false }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => {
    const next = clampWhole(text, min, max)
    if (next == null || next === value) setText(String(value))
    else onChange(next)
  }
  const step = delta => onChange(Math.min(max, Math.max(min, value + delta)))
  return <View style={[styles.number, disabled && styles.dim]} pointerEvents={disabled ? 'none' : 'auto'}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} 줄이기`} disabled={value <= min} onPress={() => step(-1)} style={({ pressed }) => [styles.step, value <= min && styles.dim, pressed && styles.pressed]}>
      <Icon name="minus" size={16} />
    </Pressable>
    <TextInput accessibilityLabel={`${label} (${min}~${max}${unit ?? ''})`} value={text} onChangeText={setText} onEndEditing={commit} onBlur={commit} onSubmitEditing={commit}
      keyboardType="number-pad" selectTextOnFocus maxLength={String(max).length} style={styles.numberInput} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} 늘리기`} disabled={value >= max} onPress={() => step(1)} style={({ pressed }) => [styles.step, value >= max && styles.dim, pressed && styles.pressed]}>
      <Icon name="plus" size={16} />
    </Pressable>
    {unit ? <Text style={styles.unit}>{unit}</Text> : null}
  </View>
}

/** 줄을 넘기면 다음 줄로 흐르는 칩 묶음. columns 를 주면 같은 폭 격자로 열을 맞춘다. 선택 = 흰 바탕 + 1.5 primary, 아님 = 회색 판 */
export function ChipGroup({ items, value, onChange, label, columns = 0 }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
    {items.map(item => {
      const on = item.id === value
      return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={item.a11y ?? item.label} accessibilityState={{ selected: on, checked: on }} hitSlop={6}
        onPress={() => onChange(item.id)} style={({ pressed }) => [styles.chip, columns > 0 && { flexBasis: `${100 / columns - 4}%`, flexGrow: 1, paddingHorizontal: 6 }, on && styles.chipOn, pressed && styles.pressed]}>
        <Text numberOfLines={1} style={[styles.chipText, on && styles.chipTextOn, item.textStyle]}>{item.label}</Text>
      </Pressable>
    })}
  </View>
}

/** 자주 쓰는 값 칩 (예: 10 · 30 · 50 · 100) */
/** values: 숫자, 또는 [값, 이름](예: [3, '2박 3일']) */
export function QuickValues({ values, value, onChange, label, unit = '' }) {
  return <ChipGroup label={label} items={values.map(item => Array.isArray(item) ? { id: item[0], label: item[1], a11y: `${label} ${item[1]} ${item[0]}${unit}` } : { id: item, label: String(item), a11y: `${label} ${item}${unit}` })} value={value} onChange={onChange} />
}

const dark = color => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
  return r * 0.299 + g * 0.587 + b * 0.114 < 150
}

// 색 견본 격자: 칸 크기를 맞춰 어느 팔레트든 열이 맞는다. 한 줄은 늘 7칸이다.
// 견본(최대 6) + 맨 끝 사용자 지정 칸이 한 줄, 그 아래 줄(그라데이션 등)도 같은 열에 놓인다.
export { GRID_COLUMNS }
const CellSize = createContext(36)
// 견본 터치 여유(hitSlop). 위아래 6, 좌우는 칸 사이 폭의 절반까지만(이웃 견본 터치 영역과 겹치지 않게, 리뷰 지적 2026-11-08)
const SwatchSlop = createContext({ top: 6, bottom: 6, left: 6, right: 6 })

// 칸 크기 · 사이는 utils/swatchGridLayout: 한 줄은 늘 7칸이고 좁은 폰에서는 줄을 바꾸지 않고 칸을 줄인다(지라 796).
// 줄 수는 폭과 상관없이 같아 잰 뒤 다시 그려도 아래 줄이 칸 크기 차이만큼만 움직인다.
/** 견본 격자 */
export function SwatchGrid({ label, children }) {
  const [width, setWidth] = useState(0)
  const onLayout = useCallback(event => {
    const next = event.nativeEvent.layout.width
    setWidth(prev => (Math.abs(prev - next) < 0.5 ? prev : next))
  }, [])
  const { cell, gap } = swatchGridLayout(width)
  const side = Math.max(0, Math.min(6, Math.floor(gap / 2)))
  const slop = useMemo(() => ({ top: 6, bottom: 6, left: side, right: side }), [side])
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.grid, { columnGap: gap }]} onLayout={onLayout}>
    <CellSize.Provider value={cell}><SwatchSlop.Provider value={slop}>{children}</SwatchSlop.Provider></CellSize.Provider>
  </View>
}

/** 견본 한 칸. color 로 칠하거나 children(그라데이션 등)을 채운다. */
export function Swatch({ on, onPress, label, color, children }) {
  const size = useContext(CellSize)
  const slop = useContext(SwatchSlop)
  const inner = size - 10
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: on, checked: on }} onPress={onPress} hitSlop={slop}
    style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, on && styles.ringOn]}>
    <View style={[styles.swatch, { width: inner, height: inner, borderRadius: inner / 2 }, color && { backgroundColor: color }]}>
      {children}
      {on && <View style={styles.checkWrap}><Icon name="check" size={14} color={!color || dark(color) ? '#FFFFFF' : colors.text} strokeWidth={2.6} /></View>}
    </View>
  </Pressable>
}

/** 맨 끝 사용자 지정 칸: 고르기 전에는 점선 + , 고른 뒤에는 그 색(또는 children)으로 채운다. 누르면 그 옆에 색 창을 띄운다. cellRef: 창 자리 기준 */
export function CustomSwatch({ on, open, onPress, label, color, children, cellRef }) {
  const size = useContext(CellSize)
  const slop = useContext(SwatchSlop)
  const inner = size - 10
  const filled = on && (color || children)
  return <Pressable ref={cellRef} collapsable={false} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on, expanded: open }} onPress={onPress} hitSlop={slop}
    style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, (on || open) && styles.ringOn]}>
    <View style={[styles.swatch, { width: inner, height: inner, borderRadius: inner / 2 }, filled ? color && { backgroundColor: color } : styles.custom]}>
      {filled ? children : <Icon name="plus" size={14} color={colors.textMuted} strokeWidth={2.4} />}
      {filled && <View style={styles.checkWrap}><Icon name="check" size={14} color={!color || dark(color) ? '#FFFFFF' : colors.text} strokeWidth={2.6} /></View>}
    </View>
  </Pressable>
}

/** 펼친 색 고르기 판 (# HEX 입력 포함) */
export function PickerPanel({ value, onChange, label }) {
  return <View style={styles.picker}><ColorPicker value={value} label={label} onChange={color => onChange(color.toUpperCase())} /></View>
}

/**
 * 견본 + 사용자 지정 한 줄. lead 는 맨 앞 칸(예: 고무줄 '맞춤'), after 는 같은 격자의 다음 줄(예: 바탕 그라데이션).
 * active = false 면 어느 견본도 고른 것으로 보이지 않는다(다른 줄에서 골랐을 때).
 * custom = false 면 맨 끝 사용자 지정 칸을 두지 않는다(기본 견본만 표시할 때).
 */
export function ColorRow({ value, onChange, swatches, label, active = true, custom = true, lead = null, after = null, picking: controlled, onPicking }) {
  const [own, setOwn] = useState(false)
  const picking = controlled ?? own
  const setPicking = onPicking ?? setOwn
  // 직접 고르기: 아래에 피커 판을 펼치지 않고 색 창을 띄운다(앱 안 색 창 통일, 2026-11-02)
  const customRef = useRef(null), colorWindow = useColorWindow()
  const openCustom = () => {
    setPicking(true)
    colorWindow.open(customRef, { title: label, value, original: value, onChange, onDone: color => { onChange(color); setPicking(false) }, onClose: () => setPicking(false) })
  }
  const listed = swatches.some(([, color]) => color.toUpperCase() === value.toUpperCase())
  return <View style={styles.colorBox}>
    <SwatchGrid label={label}>
      {lead}
      {swatches.map(([name, color]) => <Swatch key={color} label={`${label} ${name}`} color={color} on={active && color.toUpperCase() === value.toUpperCase()} onPress={() => { onChange(color); setPicking(false) }} />)}
      {custom && <CustomSwatch cellRef={customRef} label={`${label} 직접 고르기`} on={active && !listed} open={picking} color={active && !listed ? value : null} onPress={openCustom} />}
    </SwatchGrid>
    {after && <SwatchGrid label={`${label} 다른 견본`}>{after}</SwatchGrid>}
    {colorWindow.element}
  </View>
}

/**
 * 견본 줄 맨 앞의 '맞춤' 칸: color 로 칠하고 글자를 얹는다.
 * 글자는 기기의 글자 크기 설정을 따르지 않는다. 칸(26)이 고정이라 글자가 커지면 두 줄로 꺾여 "맞"만 남는다(안드로이드 글자 크기 1.3배에서 재현).
 */
export function AutoSwatch({ color, on, onPress, label }) {
  const size = useContext(CellSize)
  const slop = useContext(SwatchSlop)
  const inner = size - 10
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: on, checked: on }} onPress={onPress} hitSlop={slop}
    style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, on && styles.ringOn]}>
    <View style={[styles.swatch, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color }]}>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.autoText, { fontSize: Math.min(11, inner / 2), color: dark(color) ? '#FFFFFF' : colors.text }]}>맞춤</Text>
    </View>
  </Pressable>
}

/**
 * 요소 줄: 머리(스위치 · 이름 · 요약 · ›)를 누르면 그 자리에서 펼친다. 스위치는 펼치지 않고 켜고 끄기만 한다.
 */
export function ElementRow({ title, summary, open, onToggleOpen, toggle, action = null, children }) {
  const node = useRef(null)
  const scroll = useContext(PanelScroll)
  // 펼치면 줄이 패널 안에 보이도록 (아래쪽 줄을 펼쳤을 때 내용이 화면 밖에 남지 않게)
  useEffect(() => {
    if (!open || !scroll) return undefined
    const timer = setTimeout(() => scroll.reveal(node.current), 80)
    return () => clearTimeout(timer)
  }, [open, scroll])
  return <View ref={node} collapsable={false} style={[styles.element, open && styles.elementOpen]}>
    <View style={styles.elementHead}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} ${open ? '접기' : '펼치기'}`} accessibilityState={{ expanded: open }} onPress={onToggleOpen}
        style={({ pressed }) => [styles.elementHeadButton, pressed && styles.pressed]}>
        <Text style={styles.elementTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.elementSummary}>{summary}</Text>
        <View style={open && styles.chevronOpen}><Icon name="chevronRight" size={16} forText={13.5} color={colors.textMuted} /></View>
      </Pressable>
      {toggle ? <View style={styles.elementToggle}><Toggle label={`${title} ${toggle.value ? '끄기' : '켜기'}`} value={toggle.value} onChange={toggle.onChange} /></View> : null}
      {action}
    </View>
    {open && <View style={styles.elementBody}>{children}</View>}
  </View>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 7 },
  rowLabel: { width: 64, paddingTop: 11, color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
  rowValue: { flex: 1, minWidth: 0, gap: 8 },
  dim: { opacity: 0.4 },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  number: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { width: 40, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  numberInput: { width: 56, height: 40, borderRadius: 9, borderWidth: 1, borderColor: colors.border, textAlign: 'center', color: colors.text, fontSize: 14, fontWeight: '800', backgroundColor: colors.surface, padding: 0 },
  unit: { marginLeft: 2, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 },
  chip: { height: 36, paddingHorizontal: 13, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { backgroundColor: colors.surface, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
  chipTextOn: { color: colors.text, fontWeight: '800' },
  colorBox: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  ringOn: { borderColor: colors.primary },
  swatch: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(28,28,28,.14)', alignItems: 'center', justifyContent: 'center' },
  custom: { borderStyle: 'dashed', borderColor: colors.textMuted, backgroundColor: colors.surface },
  checkWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  autoText: { fontSize: 11, fontWeight: '800', textAlign: 'center', includeFontPadding: false },
  picker: { padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSoft },
  element: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  elementOpen: { borderColor: colors.primary },
  elementHead: { flexDirection: 'row', alignItems: 'center', paddingLeft: 10 },
  elementToggle: { paddingRight: 12 },
  elementHeadButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 4, paddingRight: 14 },
  elementTitle: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  elementSummary: { flex: 1, textAlign: 'right', color: colors.textMuted, fontSize: 12 },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  elementBody: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border },
})
