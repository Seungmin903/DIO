import { useEffect, useRef, useState } from 'react'
import { BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadow, DISABLED_OPACITY } from '../../shared/theme'
import ColorPicker from './controls/ColorPicker'
import Icon from './controls/Icon'
import { MAX_PRESETS, useColorPresets } from './controls/MyColorPresets'
import { colorPickerPlacement } from '../utils/colorPickerPlacement.js'

export default function PenColorPicker({ anchor, scope, value, onPick, onClose, onEyedropper, sampling = false, interactionHandlers, keyboardTop }) {
  const screen = useWindowDimensions()
  const root = useRef(null), [frame, setFrame] = useState(() => ({ x: 0, y: 0, width: screen.width, height: screen.height })), insets = useSafeAreaInsets()
  const { presets, loaded, add } = useColorPresets(scope)
  const label = scope === 'highlighter' ? '형광펜' : '펜'
  const saved = presets.includes(value), full = presets.length >= MAX_PRESETS
  useEffect(() => {
    if (sampling) return
    const back = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true })
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose() } }
    if (Platform.OS === 'web') document.addEventListener('keydown', escape, true)
    return () => { back.remove(); if (Platform.OS === 'web') document.removeEventListener('keydown', escape, true) }
  }, [sampling, onClose])
  const localAnchor = anchor && { ...anchor, x: anchor.x - frame.x, y: anchor.y - frame.y }
  return <View ref={root} collapsable={false} {...interactionHandlers} pointerEvents={sampling ? 'none' : 'box-none'} style={[s.root, sampling && { display: 'none' }]}
    onLayout={event => {
      const { width, height } = event.nativeEvent.layout
      if (!(width > 0 && height > 0)) return
      setFrame(previous => ({ ...previous, width, height }))
      root.current?.measureInWindow?.((x, y) => { if ([x, y].every(Number.isFinite)) setFrame({ x, y, width, height }) })
    }}>
    {!sampling && <Pressable accessibilityLabel="색 선택 창 밖 닫기" onPress={() => { Keyboard.dismiss(); onClose() }} style={StyleSheet.absoluteFill} />}
    <View testID="pen-color-picker" accessibilityLabel={`${label} 색 선택 창`} style={[s.card, colorPickerPlacement(localAnchor, frame.width, Math.min(frame.height, keyboardTop == null ? frame.height : keyboardTop - frame.y), insets)]}>
      <View style={s.header}>
        <Text accessibilityRole="header" style={s.title}>색상</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} 스포이트`} onPress={onEyedropper} style={s.icon}>
          <Icon name="eyedropper" size={21} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="색 선택 창 닫기" onPress={() => { Keyboard.dismiss(); onClose() }} style={s.icon}>
          <Icon name="close" size={18} />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <ColorPicker value={value} label={`${label} 색상`} onChange={onPick} />
        <Pressable accessibilityRole="button" disabled={!loaded || saved || full} onPress={() => { if (add(value)) { Keyboard.dismiss(); onClose() } }}
          style={[s.save, (!loaded || saved || full) && { opacity: DISABLED_OPACITY }]}>
          <Text style={s.saveText}>{saved ? '이미 저장한 색이에요' : full ? `최대 ${MAX_PRESETS}개까지 저장해요` : '내 색상에 저장'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  </View>
}
const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 90 },
  card: { position: 'absolute', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, ...shadow.float, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  save: { height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong, borderRadius: 11 },
  saveText: { color: colors.surface, fontSize: 13, fontWeight: '700' },
})
