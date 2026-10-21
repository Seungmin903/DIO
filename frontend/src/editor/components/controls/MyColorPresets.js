import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '../../../shared/theme'
import { normalizeHex } from '../../utils/penSettings'
import ColorPicker from './ColorPicker'
import Icon from './Icon'

// 펜 설정의 '내 색상 프리셋'과 같은 저장소를 쓴다. 펜·형광펜·글자·마스킹테이프에서 저장한 색을 함께 쓴다.
const PRESET_KEY = 'dio-editor-color-presets-v1'
const MAX_PRESETS = 20

let cache = null
const listeners = new Set()
const publish = (next) => {
  cache = next
  listeners.forEach((listener) => listener(next))
}

/** 저장한 색 목록과 저장·삭제 함수 */
export function useColorPresets() {
  const [presets, setPresets] = useState(cache ?? [])
  const [loaded, setLoaded] = useState(cache != null)
  useEffect(() => {
    listeners.add(setPresets)
    if (cache == null) {
      AsyncStorage.getItem(PRESET_KEY)
        .then((raw) => {
          const stored = raw ? JSON.parse(raw) : []
          publish(Array.isArray(stored) ? [...new Set(stored.filter((c) => typeof c === 'string').map(normalizeHex).filter(Boolean))].slice(0, MAX_PRESETS) : [])
        })
        .catch(() => publish([]))
        .finally(() => setLoaded(true))
    }
    return () => listeners.delete(setPresets)
  }, [])
  const save = (next) => {
    publish(next)
    AsyncStorage.setItem(PRESET_KEY, JSON.stringify(next)).catch(() => {})
  }
  return {
    presets,
    loaded,
    add: (color) => {
      const hex = color ? normalizeHex(color) : null
      if (!hex || (cache ?? []).includes(hex) || (cache ?? []).length >= MAX_PRESETS) return false
      save([...(cache ?? []), hex])
      return true
    },
    remove: (color) => save((cache ?? []).filter((c) => c !== color)),
  }
}

/**
 * '내 색상' 줄: 저장한 색을 누르면 그 색으로 바꾸고, ×로 지운다.
 * 맨 끝 + 를 누르면 색 피커가 열려 새 색을 고르고(바로 적용), '내 색상에 저장' 으로 목록에 넣는다.
 * value: 지금 색, onPick(color)
 */
export default function MyColorPresets({ value, onPick, label = '색상' }) {
  const { presets, loaded, add, remove } = useColorPresets()
  const [pickerOpen, setPickerOpen] = useState(false)
  const current = value ? normalizeHex(value) : null // 아직 내 색을 고르지 않았으면 null (예: 기본 색 테이프)
  const saved = Boolean(current && presets.includes(current))
  const full = presets.length >= MAX_PRESETS
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        {presets.map((color) => (
          <View key={color} style={styles.wrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`저장한 ${label} ${color}`}
              accessibilityState={{ selected: current === color }}
              onPress={() => onPick(color)}
              style={[styles.swatch, { backgroundColor: color }, current === color && styles.chosen]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={`${color} 저장한 색 지우기`} hitSlop={6} onPress={() => remove(color)} style={styles.remove}>
              <Icon name="close" size={9} strokeWidth={2.6} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`새 ${label} 고르기`}
          accessibilityState={{ expanded: pickerOpen }}
          disabled={!loaded}
          onPress={() => setPickerOpen(!pickerOpen)}
          style={[styles.swatch, styles.add, pickerOpen && styles.addOpen]}
        >
          <Icon name={pickerOpen ? 'close' : 'plus'} size={14} color={colors.textMuted} />
        </Pressable>
      </View>
      {pickerOpen && (
        <>
          <ColorPicker value={current ?? '#000000'} label={label} onChange={onPick} />
          <Pressable
            accessibilityRole="button"
            disabled={saved || full || !current}
            onPress={() => { if (add(value)) setPickerOpen(false) }}
            style={[styles.saveButton, (saved || full) && styles.dim]}
          >
            <Text style={styles.saveText}>{saved ? '이미 저장한 색이에요' : full ? `최대 ${MAX_PRESETS}개까지 저장해요` : '내 색상에 저장'}</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  wrap: { position: 'relative' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  chosen: { borderWidth: 3, borderColor: colors.primary },
  remove: { position: 'absolute', right: -5, top: -5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  add: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', backgroundColor: colors.surface },
  addOpen: { backgroundColor: '#EEF2F9' },
  saveButton: { height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.primary },
  saveText: { fontSize: 13, fontWeight: '800', color: colors.surface },
  dim: { opacity: 0.4 },
})
