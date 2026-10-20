import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '../../shared/theme'
import { usePan } from '../hooks/usePan'
import { EDITOR_COLORS, HIGHLIGHTER_COLORS, normalizeHex, PEN_TYPES, penPressure } from '../utils/penSettings'
import { createStroke } from '../utils/strokes'
import ObjectContent from './canvas/ObjectView'

const PRESET_KEY = 'dio-editor-color-presets-v1'

export function PenSample({ settings, small = false }) {
  const points = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40
    return { x: 12 + t * 240, y: settings.kind === 'highlighter' ? 24 : 24 + Math.sin(t * Math.PI * 2) * 12, pressure: penPressure(settings.kind, 0.5 + Math.sin(t * Math.PI) * 1.1) }
  })
  const stroke = createStroke(points, settings)
  return <View pointerEvents="none" style={{ height: small ? 26 : 54, justifyContent: 'center', alignItems: 'center' }}>
    <ObjectContent object={stroke} zoom={small ? 0.2 : 0.95} />
  </View>
}

function Thickness({ value, onChange, highlighter = false }) {
  const min = highlighter ? 8 : 1, max = highlighter ? 40 : 16
  const limit = (n) => Math.max(min, Math.min(max, n))
  const width = useRef(1), start = useRef(0)
  const update = (x) => onChange(limit(Math.round((min + x / width.current * (max - min)) * 2) / 2))
  const handlers = usePan({
    onStart: (event) => { start.current = event.locationX; update(start.current) },
    onMove: (dx) => update(start.current + dx),
  })
  return <View accessibilityRole="adjustable" accessibilityLabel={highlighter ? '형광펜 굵기' : '펜 굵기'} accessibilityValue={{ min, max, now: value }}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
    {...(Platform.OS === 'web' && { onKeyDown: (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
      e.preventDefault()
      onChange(e.key === 'Home' ? min : e.key === 'End' ? max : limit(value + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 0.5 : -0.5)))
    } })}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={(e) => onChange(limit(value + (e.nativeEvent.actionName === 'increment' ? 0.5 : -0.5)))}
    onLayout={(e) => { width.current = e.nativeEvent.layout.width }} style={styles.slider} {...handlers}>
    <View pointerEvents="none" style={styles.track} />
    <View pointerEvents="none" style={[styles.thumb, { left: `${(value - min) / (max - min) * 100}%` }]} />
  </View>
}

export default function PenSettings({ settings, onChange, onClose }) {
  const highlighter = settings.kind === 'highlighter'
  const label = highlighter ? '형광펜' : '펜'
  const [hex, setHex] = useState(settings.color)
  const [presets, setPresets] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState('')
  const saving = useRef(false)
  useEffect(() => { setHex(settings.color) }, [settings.color])
  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(PRESET_KEY).then((raw) => {
      const stored = raw ? JSON.parse(raw) : []
      if (alive) setPresets(Array.isArray(stored) ? [...new Set(stored.filter((c) => typeof c === 'string').map(normalizeHex).filter(Boolean))].slice(0, 20) : [])
    }).catch(() => { if (alive) setNotice('저장한 색상을 불러오지 못했어요.') })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])
  const chooseColor = (color) => { onChange({ ...settings, color }); setNotice('') }
  const savePresets = async (next) => {
    if (saving.current || !loaded) return
    saving.current = true
    try { await AsyncStorage.setItem(PRESET_KEY, JSON.stringify(next)); setPresets(next); setNotice('') }
    catch { setNotice('색상을 저장하지 못했어요. 다시 시도해 주세요.') }
    finally { saving.current = false }
  }
  const swatch = (color, preset = false) => <View key={color} style={styles.swatchWrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${preset ? '저장한 ' : ''}색상 ${color}`} accessibilityState={{ selected: settings.color === color }}
      onPress={() => chooseColor(color)} style={[styles.swatch, { backgroundColor: color }, settings.color === color && styles.chosen]} />
    {preset && <Pressable accessibilityRole="button" accessibilityLabel={`${color} 프리셋 삭제`} onPress={() => savePresets(presets.filter((c) => c !== color))} style={styles.remove}><Text>×</Text></Pressable>}
  </View>
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>{label} 설정</Text><Pressable accessibilityRole="button" accessibilityLabel={`${label} 설정 닫기`} onPress={onClose} style={styles.close}><Text style={styles.title}>×</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.label}>{highlighter ? '획 끝 모양' : '펜 종류'}</Text>
      <View style={styles.types}>{highlighter ? [{ id: 'round', label: '라운드' }, { id: 'square', label: '스퀘어' }].map((cap) => <Pressable key={cap.id} accessibilityRole="button" accessibilityLabel={cap.label} accessibilityState={{ selected: settings.lineCap === cap.id }} onPress={() => onChange({ ...settings, lineCap: cap.id })} style={[styles.type, settings.lineCap === cap.id && styles.typeSelected]}><PenSample settings={{ ...settings, lineCap: cap.id }} small /><Text style={styles.typeText}>{cap.label}</Text></Pressable>) : PEN_TYPES.map((type) => <Pressable key={type.id} accessibilityRole="button" accessibilityLabel={type.label} accessibilityState={{ selected: settings.kind === type.id }}
        onPress={() => onChange({ ...settings, kind: type.id })} style={[styles.type, settings.kind === type.id && styles.typeSelected]}>
        <PenSample settings={{ ...settings, kind: type.id, width: 10 }} small /><Text style={styles.typeText}>{type.label}</Text>
      </Pressable>)}</View>
      <View accessibilityLabel={`${label} 미리보기`} style={styles.preview}><PenSample settings={settings} /></View>
      {highlighter && <Text style={styles.empty}>끝점에서 잠시 누르면 직선으로 바뀌어요.</Text>}
      <View style={styles.row}><Text style={styles.label}>굵기</Text><Thickness highlighter={highlighter} value={settings.width} onChange={(width) => onChange({ ...settings, width })} /><Text style={styles.value}>{settings.width}</Text></View>
      <Text style={styles.label}>기본 색상</Text><View style={styles.palette}>{(highlighter ? HIGHLIGHTER_COLORS : EDITOR_COLORS).map((c) => swatch(c))}</View>
      <Text style={styles.label}>내 색상 프리셋</Text>
      <View style={styles.palette}>{presets.length ? presets.map((c) => swatch(c, true)) : <Text style={styles.empty}>{loaded ? '아직 저장한 색상이 없어요.' : '색상을 불러오는 중…'}</Text>}</View>
      <View style={styles.row}>
        <View style={[styles.colorChip, { backgroundColor: settings.color }]} />
        <TextInput accessibilityLabel={`${label} 색상 HEX 코드`} value={hex} maxLength={7} autoCapitalize="characters" autoCorrect={false} style={styles.input}
          onChangeText={(value) => { setHex(value); if (/^#?[0-9a-f]{6}$/i.test(value)) onChange({ ...settings, color: normalizeHex(value) }) }}
          onBlur={() => { const color = normalizeHex(hex); if (color) chooseColor(color); else { setHex(settings.color); setNotice('HEX 색상 코드를 확인해 주세요.') } }} />
        <Pressable accessibilityRole="button" disabled={!loaded} style={styles.save} onPress={() => {
          const color = normalizeHex(hex)
          if (!color) { setNotice('HEX 색상 코드를 확인해 주세요.'); return }
          if (presets.includes(color)) { setNotice('이미 저장한 색상이에요.'); return }
          if (presets.length >= 20) { setNotice('색상은 최대 20개까지 저장할 수 있어요.'); return }
          chooseColor(color); savePresets([...presets, color])
        }}><Text style={styles.typeText}>프리셋 저장</Text></Pressable>
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.empty}>{notice}</Text> : null}
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  card: { width: 320, maxWidth: '100%', flexShrink: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, elevation: 8, shadowColor: colors.text, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 5 } },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 6, paddingTop: 4 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' }, close: { padding: 12 },
  content: { padding: 16, paddingTop: 0, gap: 12 }, label: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  types: { flexDirection: 'row', gap: 4 }, type: { flex: 1, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 12, paddingVertical: 7 },
  typeSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, typeText: { textAlign: 'center', color: colors.text, fontSize: 11, fontWeight: '700' },
  preview: { backgroundColor: '#FAFAF7', borderRadius: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  slider: { flex: 1, height: 40, justifyContent: 'center', marginHorizontal: 8 }, track: { height: 5, borderRadius: 4, backgroundColor: colors.textMuted }, thumb: { position: 'absolute', width: 20, height: 20, marginLeft: -10, borderRadius: 10, backgroundColor: colors.primary },
  value: { width: 28, color: colors.text, fontWeight: '700', fontSize: 12 }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchWrap: { position: 'relative' }, swatch: { width: 31, height: 31, borderRadius: 18, borderWidth: 1, borderColor: colors.border }, chosen: { borderWidth: 3, borderColor: colors.text },
  remove: { position: 'absolute', right: -5, top: -7, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted, fontSize: 11 }, input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.text, fontSize: 12 },
  colorChip: { width: 28, height: 28, borderRadius: 15, borderWidth: 1, borderColor: colors.border }, save: { padding: 10, borderRadius: 10, backgroundColor: colors.surfaceSoft },
})
