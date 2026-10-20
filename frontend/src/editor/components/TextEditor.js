import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { colors } from '../../shared/theme'
import { colorTextRange, normalizeRanges, remapTextRanges, textSegments } from '../utils/textRanges'
import { TEXT_COLORS, TEXT_LINE_HEIGHT, textStyle } from '../utils/text'

// Android는 TextInput의 styled children으로 선택 범위 색상을 즉시 표시한다.
export default function TextEditor({ object, zoom, onSave, onCancel, boundary, onPaletteChange, paletteBounds }) {
  const input = useRef(null), draft = useRef(object.text ?? ''), composing = useRef(false), saving = useRef(false)
  const cancelled = useRef(false)
  const ranges = useRef(normalizeRanges(object.text ?? '', object.colorRanges))
  const selection = useRef({ start: 0, end: 0 })
  const [selected, setSelected] = useState(false)
  const palette = useRef(null)
  const [rendered, setRendered] = useState({ text: draft.current, ranges: ranges.current })
  const [anchor, setAnchor] = useState(null)
  const updateDraft = (value) => { ranges.current = remapTextRanges(draft.current, value, ranges.current); draft.current = value; setRendered({ text: value, ranges: ranges.current }) }
  const bounds = useRef(null), textLines = useRef([])
  const updateAnchor = () => {
    const box = bounds.current
    if (!box) return
    const target = Math.max(0, Math.max(selection.current.start, selection.current.end) - 1)
    let offset = 0, selectedLine = null
    for (const line of textLines.current) {
      const start = draft.current.indexOf(line.text, offset)
      const end = (start < 0 ? offset : start) + line.text.length
      selectedLine = line
      if (target < end) break
      offset = end
    }
    const next = selectedLine ? {
      x: box.x + selectedLine.x, y: box.y + selectedLine.y,
      width: selectedLine.width, height: selectedLine.height,
    } : box
    setAnchor((previous) => previous && Object.keys(next).every((key) => previous[key] === next[key]) ? previous : next)
  }
  const measure = () => input.current?.measureInWindow?.((x, y, width, height) => { bounds.current = { x, y, width, height }; updateAnchor() })
  useEffect(() => {
    boundary.current = (event) => {
      const b = bounds.current
      if (!b) return false
      const { pageX: x, pageY: y } = event.nativeEvent
      const p = paletteBounds.current
      if (p && x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height) return false
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return false
      input.current?.blur()
      return true
    }
    return () => { boundary.current = null }
  }, [boundary])
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => { cancelAnimationFrame(frame); Keyboard.dismiss() }
  }, [])
  const cancel = () => { cancelled.current = true; Keyboard.dismiss(); onCancel() }
  const [height, setHeight] = useState(Math.max(40, (object.h ?? TEXT_LINE_HEIGHT) * zoom))
  const scale = (object.w ?? 320) / (object.baseWidth ?? object.w ?? 320) * zoom
  const save = () => {
    if (composing.current || saving.current) return
    saving.current = true
    const value = Platform.OS === 'web' && typeof input.current?.value === 'string' ? input.current.value : draft.current
    Keyboard.dismiss()
    const finalRanges = remapTextRanges(draft.current, value, ranges.current)
    onSave(value, finalRanges)
  }
  useEffect(() => { const frame = requestAnimationFrame(measure); return () => cancelAnimationFrame(frame) }, [height, zoom, object.x, object.y])
  // 선택 끝 글자가 있는 줄에 붙이되 화면 오버레이로 표시한다.
  useEffect(() => {
    if (!selected) paletteBounds.current = null
    onPaletteChange(selected ? { anchor, content: (<View ref={palette} onLayout={() => palette.current?.measureInWindow?.((x, y, width, height) => { paletteBounds.current = { x, y, width, height } })} style={styles.palette}>
      <Text style={styles.label}>선택 글자 색상</Text>
      <View style={styles.swatches}>{TEXT_COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`선택 문자열 색상 ${color}`}
        {...(Platform.OS === 'web' && { onMouseDown: (event) => event.preventDefault() })}
        onPress={() => {
          if (composing.current) return
          ranges.current = colorTextRange(draft.current, ranges.current, selection.current, color)
          setRendered({ text: draft.current, ranges: ranges.current })
        }} style={[styles.swatch, { backgroundColor: color }]} />)}</View>
    </View>) } : null)
  }, [selected, anchor, onPaletteChange, paletteBounds])
  useEffect(() => () => { paletteBounds.current = null; onPaletteChange(null) }, [onPaletteChange, paletteBounds])
  const top = object.y * zoom
  return <View style={{ position: 'absolute', left: object.x * zoom, top, width: (object.w ?? 320) * zoom, transform: [{ rotate: `${object.rotation ?? 0}deg` }] }}>
    <Text pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      onTextLayout={(event) => { textLines.current = event.nativeEvent.lines; updateAnchor() }}
      style={[styles.measureText, textStyle(object, scale, Platform.OS)]}>
      {textSegments(rendered.text, rendered.ranges).map((segment, index) => <Text key={index} style={segment.color ? { color: segment.color } : undefined}>{segment.text}</Text>)}
    </Text>
    <TextInput ref={input} autoFocus multiline {...(Platform.OS !== 'android' && { defaultValue: object.text ?? '' })} accessibilityLabel="캔버스 텍스트 내용"
      placeholder="텍스트 입력" textAlignVertical="top" scrollEnabled={false} showSoftInputOnFocus
      submitBehavior="newline" returnKeyType="default"
      onLayout={measure} onFocus={measure}
      style={[styles.input, { height, ...textStyle(object, scale, Platform.OS) }]}
      onContentSizeChange={(event) => setHeight(Math.max(40, event.nativeEvent.contentSize.height))}
      onSelectionChange={(event) => { selection.current = event.nativeEvent.selection; setSelected(selection.current.start !== selection.current.end); measure() }}
      onChangeText={updateDraft}
      onEndEditing={(event) => { updateDraft(event.nativeEvent.text); if (!cancelled.current) { composing.current = false; save() } }}
      {...(Platform.OS === 'web' && {
        // react-native-web은 onEndEditing을 호출하지 않으므로 blur에서 완료한다.
        onBlur: (event) => {
          if (cancelled.current) return
          updateDraft(event.target.value)
          composing.current = false
          save()
        },
        onCompositionStart: () => { composing.current = true },
        onCompositionEnd: (event) => { composing.current = false; updateDraft(event.target.value) },
        onKeyDown: (event) => {
          event.stopPropagation()
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault()
            event.target.select()
            return
          }
          if (composing.current || event.nativeEvent?.isComposing || event.nativeEvent?.keyCode === 229) return
          if (event.key === 'Escape') cancel()
        },
      })} >
      {Platform.OS === 'android' ? <Text>{textSegments(rendered.text, rendered.ranges).map((segment, index) => <Text key={index} style={segment.color ? { color: segment.color } : undefined}>{segment.text}</Text>)}</Text> : null}
    </TextInput>
  </View>
}

const styles = StyleSheet.create({
  palette: { width: 260, maxWidth: '100%', padding: 12, gap: 8, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 8 },
  label: { color: colors.textMuted, fontSize: 12 }, swatches: { flexDirection: 'row', gap: 10 }, swatch: { width: 30, height: 30, borderRadius: 15 },
  measureText: { position: 'absolute', top: 1, left: 1, right: 1, opacity: 0, padding: 0, includeFontPadding: false },
  input: { width: '100%', borderWidth: 1, borderColor: colors.primary, padding: 0, margin: 0, includeFontPadding: false, backgroundColor: 'white' },
})
