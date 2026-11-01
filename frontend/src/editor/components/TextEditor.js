import { useEffect, useRef, useState } from 'react'
import { findNodeHandle, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, UIManager, View } from 'react-native'
import { startTextKeyboard } from '../utils/textKeyboard'
import { colors } from '../../shared/theme'
import { colorTextRange, normalizeRanges, remapTextRanges, textSegments } from '../utils/textRanges'
import { TEXT_AUTO_MAX_WIDTH, TEXT_AUTO_MIN_WIDTH, TEXT_COLORS, textStyle, TEXT_FRAME_PAD } from '../utils/text'
import { autoWidthInputLayout, loadedFontFamily, textSettings, textInputHeight } from '../utils/text'

import { formatTextRange, normalizeTextFormats, remapTextFormats, resizeTextRange, richTextSegments, safeTextSelection, segmentTextStyle, applyInputSelection } from '../utils/textFormats'
import { copyText, readText, useTextClipboardAvailable } from '../services/textClipboard'
import TextActionBar, { TextRangePanel } from './TextActionBar'
import TextLinkDialog from './TextLinkDialog'
import { useTextFont } from '../hooks/useTextFont'

// Android는 TextInput의 styled children으로 선택 범위 색상을 즉시 표시한다.
export default function TextEditor({ commitRef, object, zoom, onSave, onCancel, boundary, onPaletteChange, paletteBounds, onToast, onReveal }) {
  const fontStatus = useTextFont(object.font)
  const fontPending = object.font?.startsWith('personal-') && !loadedFontFamily(object.font)
  const input = useRef(null), draft = useRef(object.text ?? ''), composing = useRef(false), saving = useRef(false)
  const cancelled = useRef(false)
  const keyboardStartup = useRef(null)
  const canPaste = useTextClipboardAvailable()
  const mounted = useRef(true), pasting = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const ranges = useRef(normalizeRanges(object.text ?? '', object.colorRanges))
  const formats = useRef(normalizeTextFormats(object.text ?? '', object.styleRanges))
  const linkEditing = useRef(false)
  const [linkSelection, setLinkSelection] = useState(null)
  const selection = useRef({ start: 0, end: 0 })
  const [selected, setSelected] = useState(false)
  const palette = useRef(null)
  const [rendered, setRendered] = useState({ text: draft.current, ranges: ranges.current, formats: formats.current })
  const [anchor, setAnchor] = useState(null)
  const refresh = () => setRendered({ text: draft.current, ranges: ranges.current, formats: formats.current })
  // 고른 글자에 서식을 입히면 글자를 다시 그리면서 앱이 선택을 풀어 버린다. 이어서 다른 서식도 입힐 수 있게,
  // 서식 직후 선택이 풀렸다는 알림이 오면 그 범위로 되돌린다(새 구조 RN 은 setNativeProps 로 선택을 못 바꿔 setSelection 을 쓴다)
  const keptSelection = useRef(null), keptTimer = useRef(null)
  const keepSelection = () => {
    if (Platform.OS === 'web') return
    keptSelection.current = { ...selection.current }
    // 서식을 연달아 누르면 앞 타이머가 새 범위를 일찍 지우지 않게 새로 건다
    clearTimeout(keptTimer.current)
    keptTimer.current = setTimeout(() => { keptSelection.current = null }, 400)
  }
  const restoreSelection = (next) => {
    const kept = keptSelection.current
    if (!kept || next.start !== next.end) return false
    keptSelection.current = null
    selection.current = kept
    applyInputSelection(input.current, kept)
    return true
  }
  const updateDraft = (value) => { ranges.current = remapTextRanges(draft.current, value, ranges.current); formats.current = remapTextFormats(draft.current, value, formats.current); draft.current = value; refresh() }
  const resizeSelected = (delta) => {
    if (composing.current) return
    formats.current = resizeTextRange(draft.current, formats.current, selection.current, textSettings(object).fontSize, delta)
    refresh()
    keepSelection()
  }
  const deleteSelected = () => {
    if (composing.current) return
    const { start, end } = safeTextSelection(draft.current, selection.current)
    const next = draft.current.slice(0, start) + draft.current.slice(end)
    updateDraft(next)
    selection.current = { start, end: start }
    setSelected(false)
    if (Platform.OS === 'web' && input.current) {
      input.current.value = next; input.current.setSelectionRange?.(start, start)
    } else input.current?.setNativeProps?.({ text: next, selection: selection.current })
  }
  // 시스템 글자 메뉴 대신 쓰는 잘라내기 · 모두 선택
  const cutSelected = () => {
    if (composing.current) return
    // 복사가 끝나는 사이 선택이 바뀌어도 복사한 범위만 지운다. 그사이 글이 바뀌었으면 지우지 않는다
    const before = draft.current, range = safeTextSelection(before, selection.current)
    copyText(before.slice(range.start, range.end)).then(() => {
      if (draft.current !== before) return
      selection.current = range
      deleteSelected()
      onToast?.('선택한 글자를 잘라냈어요.')
    }).catch(() => onToast?.('잘라내지 못했어요.'))
  }
  const selectAll = () => {
    if (composing.current || !draft.current) return
    selection.current = { start: 0, end: draft.current.length }
    setSelected(true)
    if (Platform.OS === 'web' && input.current) input.current.setSelectionRange?.(0, draft.current.length)
    else input.current?.setNativeProps?.({ selection: selection.current })
    input.current?.focus?.()
  }
  const pasteText = async () => {
    if (composing.current || saving.current || pasting.current) return
    const before = draft.current
    const { start, end } = safeTextSelection(before, selection.current)
    pasting.current = true
    try {
      const text = await readText()
      if (!mounted.current || cancelled.current || saving.current || composing.current) return
      const current = safeTextSelection(draft.current, selection.current)
      if (draft.current !== before || current.start !== start || current.end !== end) {
        onToast?.('입력 위치가 바뀌었어요. 붙여넣기를 다시 눌러 주세요.')
        return
      }
      if (!text) { onToast?.('붙여넣을 텍스트가 없어요.'); return }
      const next = before.slice(0, start) + text + before.slice(end)
      updateDraft(next)
      selection.current = { start: start + text.length, end: start + text.length }
      setSelected(false)
      if (Platform.OS === 'web' && input.current) {
        input.current.value = next
        input.current.setSelectionRange?.(selection.current.start, selection.current.end)
      } else input.current?.setNativeProps?.({ text: next, selection: selection.current })
      input.current?.focus()
      onToast?.('텍스트를 붙여넣었어요.')
    } catch {
      if (mounted.current) onToast?.('텍스트를 붙여넣지 못했어요. 클립보드 접근을 확인해 주세요.')
    } finally { pasting.current = false }
  }
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
  // 글자만큼 넓어지는 상자는 입력창이 상자보다 넓어서, 보이는 상자(자르는 틀)를 잰다
  const clip = useRef(null)
  const measure = () => (clip.current ?? input.current)?.measureInWindow?.((x, y, width, height) => { bounds.current = { x, y, width, height }; updateAnchor() })
  useEffect(() => {
    boundary.current = (event) => {
      const b = bounds.current
      // 링크 창이 떠 있으면 그 안의 터치(취소 · 적용)는 창이 받는다. 창은 화면 위에 따로 뜨지만 터치는 편집 화면을 거쳐 와서, 여기서 가로채면 버튼이 눌리지 않았다
      if (!b || linkEditing.current) return false
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
    if (fontPending) return
    const stop = startTextKeyboard({
      platform: Platform.OS, getInput: () => input.current,
      canFocus: () => mounted.current && !cancelled.current && !saving.current && !linkEditing.current,
      isVisible: () => Boolean(Keyboard.isVisible?.() || keyboardTop.current != null),
      findNodeHandle, dispatchCommand: (tag, command, args) => UIManager.dispatchViewManagerCommand(tag, command, args),
    })
    keyboardStartup.current = stop
    return () => { stop(); keyboardStartup.current = null; Keyboard.dismiss() }
  }, [fontPending])
  const cancel = () => { cancelled.current = true; keyboardStartup.current?.(); Keyboard.dismiss(); onCancel() }
  const [height, setHeight] = useState(() => textInputHeight(object, zoom))

  const scale = (object.w ?? 320) / (object.baseWidth ?? object.w ?? 320) * zoom
  // 글자만큼 넓어지는 상자: 줄바꿈 없이 잰 가장 긴 줄 폭(화면 px)에 맞추고 최대 폭에서 줄을 바꾼다
  const [naturalWidth, setNaturalWidth] = useState(null)
  const autoMax = Math.min(TEXT_AUTO_MAX_WIDTH, object.maxWidth ?? TEXT_AUTO_MAX_WIDTH) * zoom
  const boxWidth = object.autoWidth && naturalWidth != null
    ? Math.min(autoMax, Math.max(TEXT_AUTO_MIN_WIDTH * zoom, naturalWidth + 2))
    : (object.w ?? 320) * zoom
  // 글자만큼 넓어지는 상자: 입력창은 최대 폭에서만 줄을 바꾸게 넓혀 두고 상자 폭 밖은 자른다 (폭이 한 박자 늦게 따라와도 두 줄로 접히지 않는다)
  const inputWidth = object.autoWidth ? autoWidthInputLayout(boxWidth, autoMax, textStyle(object, scale, Platform.OS).textAlign) : null
  const wrapInput = (node) => object.autoWidth
    ? <View ref={clip} collapsable={false} onLayout={measure} style={styles.inputClip}>{node}</View>
    : node
  // 키보드가 글상자를 가리면 그만큼 화면을 올린다 (onReveal(dy): 화면 px)
  const keyboardTop = useRef(null)
  const reveal = () => {
    if (keyboardTop.current == null || !onReveal) return
    (clip.current ?? input.current)?.measureInWindow?.((x, y, width, h) => {
      const overlap = y + h + TEXT_FRAME_PAD + 80 - keyboardTop.current
      if (overlap > 0) onReveal(overlap)
    })
  }
  useEffect(() => {
    const show = Keyboard.addListener?.('keyboardDidShow', (event) => { keyboardStartup.current?.(); keyboardTop.current = event.endCoordinates?.screenY ?? null; reveal() })
    const hide = Keyboard.addListener?.('keyboardDidHide', () => { keyboardTop.current = null })
    return () => { show?.remove?.(); hide?.remove?.() }
  }, [])
  const save = () => {
    if (composing.current || saving.current || linkEditing.current) return
    saving.current = true
    keyboardStartup.current?.()
    const value = Platform.OS === 'web' && typeof input.current?.value === 'string' ? input.current.value : draft.current
    Keyboard.dismiss()
    const finalRanges = remapTextRanges(draft.current, value, ranges.current)
    const finalFormats = remapTextFormats(draft.current, value, formats.current)
    // 실제로 그려진 글자 높이(페이지 좌표). 글자 수로 어림한 높이는 아래에 빈칸이 남아서 편집을 마칠 때 잰 값으로 맞춘다.
    const lines = textLines.current
    const measured = lines.length ? Math.max(...lines.map((line) => line.y + line.height)) / zoom : null
    // 잰 높이, 글자만큼 넓어지는 상자면 그 폭(페이지 좌표)도 넘긴다
    const width = object.autoWidth ? boxWidth / zoom : null
    onSave(value, finalRanges, finalFormats, ...(measured || width ? [measured ?? null] : []), ...(width ? [width] : []))
  }
  useEffect(() => {
    if (!commitRef) return
    const commit = () => { if (composing.current || linkEditing.current) return false; save(); return true }
    commitRef.current = commit
    return () => { if (commitRef.current === commit) commitRef.current = null }
  }, [commitRef, save])
  useEffect(() => { const frame = requestAnimationFrame(() => { measure(); reveal() }); return () => cancelAnimationFrame(frame) }, [height, zoom, object.x, object.y])
  // 웹: 선택 끝 글자가 있는 줄에 말풍선(TextActionBar)을 붙인다.
  // 앱: 고르기 · 복사 · 붙여넣기는 시스템 글자 메뉴가 맡고, 글자를 골랐을 때만 도구줄 아래에 '선택한 글자' 창(TextRangePanel)을 띄운다.
  useEffect(() => {
    const systemMenu = Platform.OS !== 'web'
    if (systemMenu ? !selected : (!selected && !canPaste && !draft.current)) { paletteBounds.current = null; onPaletteChange(null); return }
    const linked = formats.current.some(r => r.href && r.start < selection.current.end && r.end > selection.current.start)
    const onColor = (color) => {
      if (composing.current) return
      ranges.current = colorTextRange(draft.current, ranges.current, selection.current, color)
      refresh()
      keepSelection()
    }
    const onLink = () => { if (composing.current) return; linkEditing.current = true; setLinkSelection(safeTextSelection(draft.current, selection.current)) }
    const collapse = () => {
      const { end } = safeTextSelection(draft.current, selection.current)
      selection.current = { start: end, end }
      setSelected(false)
      applyInputSelection(input.current, selection.current)
    }
    onPaletteChange({ anchor, placement: systemMenu ? 'panel' : 'bubble', content: (<View ref={palette} onLayout={() => palette.current?.measureInWindow?.((x, y, width, height) => { paletteBounds.current = { x, y, width, height } })} style={styles.palette}>
      {systemMenu
        ? <TextRangePanel linked={linked} onColor={onColor} onIncrease={() => resizeSelected(2)} onDecrease={() => resizeSelected(-2)} onLink={onLink} onClose={collapse} />
        : <TextActionBar hasSelection={selected} hasText={Boolean(draft.current)} canPaste={canPaste} onPaste={pasteText} onCut={cutSelected} onSelectAll={selectAll} colorLabel="선택 문자열 색상" linked={linked}
            onColor={onColor} onIncrease={() => resizeSelected(2)} onDecrease={() => resizeSelected(-2)} onDelete={deleteSelected}
            onCopy={() => { const { start, end } = safeTextSelection(draft.current, selection.current); copyText(draft.current.slice(start, end)).then(() => onToast?.('선택한 글자를 복사했어요.')).catch(() => onToast?.('복사하지 못했어요.')) }}
            onLink={onLink} />}
    </View>) })
  }, [selected, canPaste, anchor, rendered, onPaletteChange, paletteBounds])
  useEffect(() => () => { paletteBounds.current = null; onPaletteChange(null) }, [onPaletteChange, paletteBounds])
  const top = object.y * zoom
  if (fontPending) return <View style={{ position: 'absolute', left: object.x * zoom, top, padding: 12, backgroundColor: colors.surface }}>
    <Text style={{ color: colors.text }}>{fontStatus.includes(':loading') ? '내 폰트를 준비하고 있어요…' : '내 폰트 파일을 가져온 뒤 편집해 주세요.'}</Text>
    <Pressable accessibilityRole="button" onPress={onCancel} style={{ paddingVertical: 12 }}><Text style={{ color: colors.primary }}>닫기</Text></Pressable>
  </View>
  return <View style={{ position: 'absolute', left: object.x * zoom, top, width: boxWidth, transform: [{ rotate: `${object.rotation ?? 0}deg` }] }}>
    {object.autoWidth && <View pointerEvents="none" style={styles.widthProbe}>
      <Text accessible={false} onLayout={(event) => setNaturalWidth(event.nativeEvent.layout.width)} style={[styles.widthProbeText, textStyle(object, scale, Platform.OS)]}>
        {rendered.text ? richTextSegments(rendered.text, rendered.ranges, rendered.formats).map((segment, index) => <Text key={index} style={segmentTextStyle(segment, scale, textSettings(object).lineSpacing)}>{segment.text}</Text>) : '텍스트 입력'}
      </Text>
    </View>}
    <Text pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants"
      onTextLayout={(event) => { textLines.current = event.nativeEvent.lines; updateAnchor() }}
      style={[styles.measureText, textStyle(object, scale, Platform.OS)]}>
      {richTextSegments(rendered.text, rendered.ranges, rendered.formats).map((segment, index) => <Text key={index} style={segmentTextStyle(segment, scale, textSettings(object).lineSpacing)}>{segment.text}</Text>)}
    </Text>
    {wrapInput(<TextInput ref={input} autoFocus multiline {...(Platform.OS !== 'android' && { defaultValue: object.text ?? '' })} accessibilityLabel="캔버스 텍스트 내용"
      placeholder="텍스트 입력" textAlignVertical="top" scrollEnabled={false} showSoftInputOnFocus
      submitBehavior="newline" returnKeyType="default"
      onLayout={measure} onFocus={measure}
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.primary}
      cursorColor={colors.primary}
      style={[styles.input, { height, ...inputWidth, ...textStyle(object, scale, Platform.OS) }]}
      onContentSizeChange={(event) => setHeight(textInputHeight(object, zoom, event.nativeEvent.contentSize.height))}
      onSelectionChange={(event) => { if (restoreSelection(event.nativeEvent.selection)) return; selection.current = event.nativeEvent.selection; setSelected(selection.current.start !== selection.current.end); measure() }}
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
      {/* 안드로이드 입력창은 글자 조각을 직접 넣으므로 밑줄 · 취소선도 조각마다 준다(입력창 스타일의 장식이 조각에 이어지지 않는다) */}
      {Platform.OS === 'android' ? <Text>{richTextSegments(rendered.text, rendered.ranges, rendered.formats).map((segment, index) => <Text key={index} style={{ textDecorationLine: textStyle(object, scale, Platform.OS).textDecorationLine, ...segmentTextStyle(segment, scale, textSettings(object).lineSpacing) }}>{segment.text}</Text>)}</Text> : null}
    </TextInput>)}
    {linkSelection && <TextLinkDialog initialValue={formats.current.find(r => r.href && r.start < linkSelection.end && r.end > linkSelection.start)?.href ?? ''}
      onCancel={() => { linkEditing.current = false; setLinkSelection(null); input.current?.focus() }}
      onSave={(href) => {
        formats.current = formatTextRange(draft.current, formats.current, linkSelection, { href: href || null })
        refresh(); linkEditing.current = false; setLinkSelection(null); input.current?.focus()
      }} />}
    <View pointerEvents="none" style={styles.editFrame} />
  </View>
}

const styles = StyleSheet.create({
  palette: { maxWidth: '100%' },
  label: { color: colors.textMuted, fontSize: 12 }, swatches: { flexDirection: 'row', gap: 10 }, swatch: { width: 30, height: 30, borderRadius: 15 },
  // 글자 폭 재기: 아주 넓은 칸에 줄바꿈 없이 그려 가장 긴 줄 폭을 잰다 (보이지 않음)
  widthProbe: { position: 'absolute', left: 0, top: 0, width: 4000, opacity: 0 },
  widthProbeText: { alignSelf: 'flex-start', includeFontPadding: false },
  inputClip: { width: '100%', overflow: 'hidden' },
  measureText: { position: 'absolute', top: 1, left: 1, right: 1, opacity: 0, padding: 0, includeFontPadding: false },
  // 입력 중에도 뒤의 속지·요소가 비치도록 채우지 않는다. 테두리는 editFrame 이 글자 바깥에 따로 그린다 (웹 기본 포커스 테두리도 끈다)
  input: { width: '100%', borderWidth: 0, padding: 0, margin: 0, includeFontPadding: false, backgroundColor: 'transparent', ...(Platform.OS === 'web' && { outlineStyle: 'none' }) },
  editFrame: { position: 'absolute', left: -TEXT_FRAME_PAD, top: -TEXT_FRAME_PAD, right: -TEXT_FRAME_PAD, bottom: -TEXT_FRAME_PAD, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 6 },
})
