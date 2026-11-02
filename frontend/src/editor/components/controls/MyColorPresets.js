import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, DISABLED_OPACITY } from '../../../shared/theme'
import { normalizeHex } from '../../utils/penSettings'
import ColorPicker from './ColorPicker'
import Icon from './Icon'

// 내 색상은 쓰는 곳(scope)마다 따로 저장한다. 펜은 예전부터 쓰던 저장소를 그대로 이어 쓴다.
const PRESET_KEYS = {
  pen: 'dio-editor-color-presets-v1',
  highlighter: 'dio-editor-color-presets-v1:highlighter',
  text: 'dio-editor-color-presets-v1:text',
  tape: 'dio-editor-color-presets-v1:tape',
  // 꾸미기 공방 기본 속지 설정의 종이 색 · 선과 글씨 색
  paper: 'dio-editor-color-presets-v1:paper',
  paperLine: 'dio-editor-color-presets-v1:paper-line',
}
// 도구마다 최대 14개(꾸미기 공방 프리셋에서 7개씩 두 줄, 2026-11-01)
export const MAX_PRESETS = 14

// 저장 값은 '#RRGGBB' 하나, 또는 마스킹테이프처럼 두 색 '#바탕/#무늬' 한 쌍
const normalizeEntry = (value) => {
  if (typeof value !== 'string') return null
  const parts = value.split('/').map(normalizeHex)
  return parts.length <= 2 && parts.every(Boolean) ? parts.join('/') : null
}

// scope 별 목록 캐시와 구독자. 같은 scope 를 쓰는 창끼리만 바로 맞춰진다.
const stores = {}
const storeOf = (scope) => (stores[scope] ??= { cache: null, listeners: new Set() })
const publish = (store, next) => {
  store.cache = next
  store.listeners.forEach((listener) => listener(next))
}

/** scope(pen·highlighter·text·tape)에 저장한 색 목록과 저장 · 바꾸기 · 삭제 함수 */
export function useColorPresets(scope = 'pen') {
  const store = storeOf(scope)
  const key = PRESET_KEYS[scope] ?? PRESET_KEYS.pen
  const [presets, setPresets] = useState(store.cache ?? [])
  const [loaded, setLoaded] = useState(store.cache != null)
  useEffect(() => {
    setPresets(store.cache ?? [])
    store.listeners.add(setPresets)
    if (store.cache == null) {
      AsyncStorage.getItem(key)
        .then((raw) => {
          const stored = raw ? JSON.parse(raw) : []
          // 예전에 20개까지 저장한 색은 지우지 않고 그대로 둔다(화면에는 앞 14개만 보인다)
          publish(store, Array.isArray(stored) ? [...new Set(stored.map(normalizeEntry).filter(Boolean))] : [])
        })
        .catch(() => publish(store, []))
        .finally(() => setLoaded(true))
    } else setLoaded(true)
    return () => store.listeners.delete(setPresets)
  }, [store, key])
  const save = (next) => {
    publish(store, next)
    AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {})
  }
  return {
    presets: presets.slice(0, MAX_PRESETS),
    loaded,
    add: (color) => {
      const hex = color ? normalizeEntry(color) : null
      const current = store.cache ?? []
      if (!hex || current.includes(hex) || current.length >= MAX_PRESETS) return false
      save([...current, hex])
      return true
    },
    remove: (color) => save((store.cache ?? []).filter((c) => c !== color)),
    // 저장한 색 하나를 다른 색으로 바꾼다(자리는 그대로). 바꾼 색이 이미 있으면 겹치지 않게 하나만 남긴다
    replace: (color, next) => {
      const hex = normalizeEntry(next)
      if (!hex) return false
      save([...new Set((store.cache ?? []).map((c) => (c === color ? hex : c)))])
      return true
    },
  }
}

/**
 * '내 색상' 줄: 저장한 색을 누르면 그 색으로 바꾸고, ×로 지운다.
 * 맨 끝 + 를 누르면 색 피커가 열려 새 색을 고르고(바로 적용), '내 색상에 저장' 으로 목록에 넣는다.
 * value: 지금 색, onPick(color), scope: 저장 목록 구분 (pen·highlighter·text·tape)
 * pickerTop: 피커가 열렸을 때 피커 위에 둘 것 (예: 마스킹테이프의 바탕색·무늬색 고르기). onPickerOpenChange(open)
 * entry: 저장·선택 표시에 쓰는 값 (기본은 value). 두 색 '#바탕/#무늬' 이면 기본 테이프 색처럼 원 안에 작은 원으로 보인다.
 *   저장한 두 색을 누르면 onPick('#바탕/#무늬'), 피커에서 고르면 onPick('#색')
 */
export default function MyColorPresets({ value, entry = value, onPick, label = '색상', scope = 'pen', pickerTop = null, onPickerOpenChange }) {
  const { presets, loaded, add, remove } = useColorPresets(scope)
  const [pickerOpen, setOpen] = useState(false)
  const setPickerOpen = (open) => { setOpen(open); onPickerOpenChange?.(open) }
  const current = entry ? normalizeEntry(entry) : null // 아직 내 색을 고르지 않았으면 null (예: 기본 색 테이프)
  const pickerColor = value ? normalizeHex(value) : null
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
              style={[styles.swatch, { backgroundColor: color.split('/')[0] }, current === color && styles.chosen]}
            >
              {color.includes('/') && <View style={[styles.inner, { backgroundColor: color.split('/')[1] }]} />}
            </Pressable>
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
          {pickerTop}
          <ColorPicker value={pickerColor ?? '#000000'} label={label} onChange={onPick} />
          <Pressable
            accessibilityRole="button"
            disabled={saved || full || !current}
            onPress={() => { if (add(entry)) setPickerOpen(false) }}
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
  // 두 색(바탕/무늬) 값의 무늬색: 기본 테이프 색 동그라미와 같은 자리·크기
  inner: { position: 'absolute', right: 3, bottom: 3, width: 8, height: 8, borderRadius: 4 },
  remove: { position: 'absolute', right: -5, top: -5, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  add: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', backgroundColor: colors.surface },
  addOpen: { backgroundColor: colors.surfaceMuted },
  saveButton: { height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.primaryStrong },
  saveText: { fontSize: 13, fontWeight: '700', color: colors.surface },
  dim: { opacity: DISABLED_OPACITY },
})
