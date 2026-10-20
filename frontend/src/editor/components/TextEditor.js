import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, StyleSheet, TextInput, View } from 'react-native'
import { colors } from '../../shared/theme'
import { TEXT_FONT_SIZE, TEXT_LINE_HEIGHT } from '../utils/text'

// 캔버스 안의 임시 입력층. 조합 중 문서와 controlled value를 다시 쓰지 않는다.
export default function TextEditor({ object, zoom, onSave, onCancel, boundary }) {
  const input = useRef(null), draft = useRef(object.text ?? ''), composing = useRef(false), saving = useRef(false)
  const cancelled = useRef(false)
  const bounds = useRef(null)
  const measure = () => input.current?.measureInWindow?.((x, y, width, height) => { bounds.current = { x, y, width, height } })
  useEffect(() => {
    boundary.current = (event) => {
      const b = bounds.current
      if (!b) return false
      const { pageX: x, pageY: y } = event.nativeEvent
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
    onSave(value)
  }
  useEffect(() => { const frame = requestAnimationFrame(measure); return () => cancelAnimationFrame(frame) }, [height, zoom, object.x, object.y])
  const top = object.y * zoom
  return <View style={{ position: 'absolute', left: object.x * zoom, top, width: (object.w ?? 320) * zoom, transform: [{ rotate: `${object.rotation ?? 0}deg` }] }}>
    <TextInput ref={input} autoFocus multiline defaultValue={object.text ?? ''} accessibilityLabel="캔버스 텍스트 내용"
      placeholder="텍스트 입력" textAlignVertical="top" scrollEnabled={false} showSoftInputOnFocus
      submitBehavior="newline" returnKeyType="default"
      onLayout={measure} onFocus={measure}
      style={[styles.input, { height, fontSize: TEXT_FONT_SIZE * scale, lineHeight: TEXT_LINE_HEIGHT * scale, color: object.color ?? colors.text }]}
      onContentSizeChange={(event) => setHeight(Math.max(40, event.nativeEvent.contentSize.height))}
      onChangeText={(value) => { draft.current = value }}
      onEndEditing={(event) => { draft.current = event.nativeEvent.text; if (!cancelled.current) { composing.current = false; save() } }}
      {...(Platform.OS === 'web' && {
        onCompositionStart: () => { composing.current = true },
        onCompositionEnd: (event) => { composing.current = false; draft.current = event.target.value },
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
      })} />
  </View>
}

const styles = StyleSheet.create({
  input: { width: '100%', borderWidth: 1, borderColor: colors.primary, padding: 0, margin: 0, includeFontPadding: false, backgroundColor: 'white' },
})
