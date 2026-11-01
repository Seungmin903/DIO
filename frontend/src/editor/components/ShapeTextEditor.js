import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Keyboard, Platform, Text, TextInput, View } from 'react-native'
import { colors } from '../../shared/theme'
import { useTextFont } from '../hooks/useTextFont'
import { shapeTextStyle, shapeTextBox } from '../utils/editorShapes'
import { textPatch, textSettings } from '../utils/text'
import { shapeInputHeight, shapeRevealDelta } from '../utils/shapeTextViewport'
import ShapeContent from './canvas/ShapeContent'
import TextActionBar, { TextRangePanel } from './TextActionBar'
import { colorTextRange, normalizeRanges, remapTextRanges } from '../utils/textRanges'
import { normalizeTextFormats, remapTextFormats, resizeTextRange, richTextSegments, safeTextSelection, segmentTextStyle, applyInputSelection } from '../utils/textFormats'
import { copyText, readText, useTextClipboardAvailable } from '../services/textClipboard'

// 도형 크기는 글의 길이와 무관하게 유지한다. 빈 글을 저장해도 도형 자체는 지우지 않는다.
export default function ShapeTextEditor({ commitRef, object, zoom, onSave, boundary, onReveal, visibleTop = 0, onPaletteChange, paletteBounds, onToast }) {
  useTextFont(object.font)
  const input = useRef(null), draft = useRef(object.text ?? ''), box = useRef(null), committed = useRef(false)
  const latest = useRef(null), frame = useRef(null), revision = useRef(0), mounted = useRef(true)
  const ranges = useRef(normalizeRanges(object.text ?? '',object.colorRanges))
  const formats = useRef(normalizeTextFormats(object.text ?? '',object.styleRanges))
  const selection = useRef({start:0,end:0}), pasting = useRef(false), composing = useRef(false)
  const [rendered,setRendered] = useState({text:draft.current,ranges:ranges.current,formats:formats.current})
  const [selected,setSelected] = useState(false), [anchor,setAnchor] = useState(null)
  const canPaste = useTextClipboardAvailable(), palette = useRef(null)
  const refresh = () => setRendered({text:draft.current,ranges:ranges.current,formats:formats.current})
  // 고른 글자에 서식을 입히면 앱이 선택을 풀어 버린다. 그 알림이 오면 서식 전 범위로 되돌린다(TextEditor 와 같다)
  const keptSelection = useRef(null)
  const restoreSelection = next => {
    const kept=keptSelection.current
    if (!kept||next.start!==next.end) return false
    keptSelection.current=null;selection.current=kept
    applyInputSelection(input.current,kept)
    return true
  }
  const updateDraft = value => {
    ranges.current=remapTextRanges(draft.current,value,ranges.current)
    formats.current=remapTextFormats(draft.current,value,formats.current)
    draft.current=value
    refresh()
  }
  const replaceSelection = text => {
    const {start,end}=safeTextSelection(draft.current,selection.current)
    const next=draft.current.slice(0,start)+text+draft.current.slice(end)
    updateDraft(next)
    selection.current={start:start+text.length,end:start+text.length}
    setSelected(false)
    if (Platform.OS==='web' && input.current) {input.current.value=next;input.current.setSelectionRange?.(selection.current.start,selection.current.end)}
    else input.current?.setNativeProps?.({text:next,selection:selection.current})
    input.current?.focus()
  }
  // 시스템 글자 메뉴 대신 쓰는 잘라내기 · 모두 선택
  const cut = () => {
    if (composing.current) return
    const {start,end}=safeTextSelection(draft.current,selection.current)
    copyText(draft.current.slice(start,end)).then(()=>{replaceSelection('');onToast?.('선택한 글자를 잘라냈어요.')}).catch(()=>onToast?.('잘라내지 못했어요.'))
  }
  const selectAll = () => {
    if (composing.current||!draft.current) return
    selection.current={start:0,end:draft.current.length}
    setSelected(true)
    if (Platform.OS==='web' && input.current) input.current.setSelectionRange?.(0,draft.current.length)
    else input.current?.setNativeProps?.({selection:selection.current})
    input.current?.focus()
  }
  const paste = async () => {
    if (pasting.current || composing.current || committed.current) return
    const before=draft.current, range=safeTextSelection(before,selection.current)
    pasting.current=true
    try {
      const text=await readText(), current=safeTextSelection(draft.current,selection.current)
      if (!mounted.current || committed.current || composing.current || before!==draft.current || range.start!==current.start || range.end!==current.end) return
      if (text) replaceSelection(text)
    } catch {onToast?.('붙여넣지 못했어요.')} finally {pasting.current=false}
  }
  const textBox = shapeTextBox(object,zoom)
  const [contentHeight, setContentHeight] = useState(() => textPatch(object.text ?? '', textBox.width/zoom,object).h*zoom)
  const [keyboardTop, setKeyboardTop] = useState(null)
  const revealAttempt = useRef(null)
  latest.current = { onSave, onReveal, keyboardTop, visibleTop }
  const inputHeight = shapeInputHeight(Infinity, contentHeight, keyboardTop, visibleTop)
  const save = () => { if (!committed.current) { committed.current = true; latest.current.onSave(draft.current,normalizeRanges(draft.current,ranges.current),normalizeTextFormats(draft.current,formats.current)) } }
  useEffect(() => {
    if (!commitRef) return
    const commit = () => { if (composing.current) return false; save(); return true }
    commitRef.current = commit
    return () => { if (commitRef.current === commit) commitRef.current = null }
  }, [commitRef, save])
  const measure = () => {
    const current = ++revision.current
    input.current?.measureInWindow?.((x,y,width,height) => {
      if (!mounted.current || current !== revision.current) return
      const measured = {x,y,width,height}
      box.current = measured
      setAnchor(previous=>previous&&Object.keys(measured).every(key=>previous[key]===measured[key])?previous:measured)
      const {keyboardTop:bottom,visibleTop:top} = latest.current
      const delta = shapeRevealDelta(measured,bottom,top)
      const attempt = [y,height,bottom,top].join(':')
      if (Math.abs(delta)>1 && revealAttempt.current!==attempt) {
        revealAttempt.current=attempt
        box.current=null
        latest.current.onReveal?.(delta)
      }
    })
  }
  const scheduleMeasure = () => {
    box.current = null
    revision.current++
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => { frame.current = null; measure() })
  }
  // 부모 캔버스 transform은 입력창의 onLayout을 발생시키지 않을 수 있다.
  // 키보드 회피를 포함한 렌더 커밋 뒤 실제 화면 좌표를 다시 읽는다.
  useLayoutEffect(() => { scheduleMeasure() })
  useEffect(() => {
    mounted.current = true
    const keyboardChanged = event => {
      setKeyboardTop(event.endCoordinates.screenY)
      latest.current.keyboardTop = event.endCoordinates.screenY
      scheduleMeasure()
    }
    const keyboard = Keyboard.addListener('keyboardDidShow', keyboardChanged)
    const changed = Keyboard.addListener('keyboardDidChangeFrame', keyboardChanged)
    const hidden = Keyboard.addListener('keyboardDidHide', () => { setKeyboardTop(null); latest.current.keyboardTop=null; revealAttempt.current=null; scheduleMeasure() })
    boundary.current = event => {
      const b = box.current
      if (!b) return false
      const {pageX:x,pageY:y} = event.nativeEvent
      const p=paletteBounds?.current
      if (p && x>=p.x && x<=p.x+p.width && y>=p.y && y<=p.y+p.height) return false
      if (x >= b.x && x <= b.x+b.width && y >= b.y && y <= b.y+b.height) return false
      save(); Keyboard.dismiss(); return true
    }
    return () => {
      mounted.current = false
      revision.current++
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      keyboard.remove()
      changed.remove()
      hidden.remove()
      boundary.current = null
    }
  }, [boundary])
  useEffect(()=>{
    if (!onPaletteChange || !paletteBounds) return undefined
    // 앱은 시스템 글자 메뉴 + 고른 글자일 때만 '선택한 글자' 창(TextEditor 와 같다), 웹은 말풍선
    const systemMenu=Platform.OS!=='web'
    if ((systemMenu?!selected:(!selected&&!canPaste&&!draft.current))||!anchor) {paletteBounds.current=null;onPaletteChange(null);return undefined}
    // 서식 직후 선택이 풀리면 되돌린다(TextEditor 와 같다)
    const keepSelection=()=>{if(!systemMenu)return;keptSelection.current={...selection.current};setTimeout(()=>{keptSelection.current=null},400)}
    const resize=delta=>{if(composing.current)return;formats.current=resizeTextRange(draft.current,formats.current,selection.current,object.fontSize??20,delta);refresh();keepSelection()}
    const onColor=color=>{if(composing.current)return;ranges.current=colorTextRange(draft.current,ranges.current,selection.current,color);refresh();keepSelection()}
    const collapse=()=>{const {end}=safeTextSelection(draft.current,selection.current);selection.current={start:end,end};setSelected(false);applyInputSelection(input.current,selection.current)}
    onPaletteChange({anchor,placement:systemMenu?'panel':'bubble',content:<View ref={palette} onLayout={()=>palette.current?.measureInWindow?.((x,y,width,height)=>{paletteBounds.current={x,y,width,height}})}>
      {systemMenu
        ? <TextRangePanel onColor={onColor} onIncrease={()=>resize(2)} onDecrease={()=>resize(-2)} onClose={collapse} />
        : <TextActionBar hasSelection={selected} hasText={Boolean(draft.current)} canPaste={canPaste} onPaste={paste} onCut={cut} onSelectAll={selectAll} colorLabel="선택 문자열 색상"
            onColor={onColor} onIncrease={()=>resize(2)} onDecrease={()=>resize(-2)}
            onDelete={()=>{if(!composing.current)replaceSelection('')}}
            onCopy={()=>{const {start,end}=safeTextSelection(draft.current,selection.current);copyText(draft.current.slice(start,end)).then(()=>onToast?.('선택한 글자를 복사했어요.')).catch(()=>onToast?.('복사하지 못했어요.'))}} />}
    </View>})
    return undefined
  },[selected,canPaste,anchor,rendered,onPaletteChange,paletteBounds])
  useEffect(()=>()=>{if(paletteBounds)paletteBounds.current=null;onPaletteChange?.(null)},[onPaletteChange,paletteBounds])
  return <View onLayout={scheduleMeasure} style={{ position:'absolute',left:object.x*zoom,top:object.y*zoom,width:object.w*zoom,height:object.h*zoom,transform:[{rotate:`${object.rotation ?? 0}deg`}] }}>
    <ShapeContent object={object} zoom={zoom} hideText />
    <TextInput ref={input} autoFocus multiline scrollEnabled {...(Platform.OS!=='android'&&{defaultValue:object.text??''})} accessibilityLabel="도형 내부 글" placeholder="글 입력" placeholderTextColor={colors.textMuted} onChangeText={updateDraft}
      onSelectionChange={event=>{if(restoreSelection(event.nativeEvent.selection))return;selection.current=event.nativeEvent.selection;setSelected(selection.current.start!==selection.current.end);scheduleMeasure()}}
      {...(Platform.OS==='web'&&{onCompositionStart:()=>{composing.current=true},onCompositionEnd:event=>{composing.current=false;updateDraft(event.target.value)}})}
      onContentSizeChange={event => { const height=event.nativeEvent.contentSize.height; if (Number.isFinite(height)&&height>0) setContentHeight(previous=>Math.abs(previous-height)>1?height:previous) }} onEndEditing={event=>{updateDraft(event.nativeEvent.text);composing.current=false;save()}}
      {...(Platform.OS==='web'&&{onBlur:event=>{if(typeof event.target?.value==='string')updateDraft(event.target.value);composing.current=false;save()}})} textAlignVertical="top" style={[shapeTextStyle(object,zoom,Platform.OS),{position:'absolute',padding:0,top:textBox.top+(object.verticalAlign==='top'?0:object.verticalAlign==='bottom'?textBox.height-inputHeight:(textBox.height-inputHeight)/2),left:textBox.left,width:textBox.width,height:inputHeight,borderWidth:1,borderColor:colors.primary,backgroundColor:'transparent',...(Platform.OS === 'web' && {outlineStyle:'none'})}]}>
      {Platform.OS==='android'?<Text>{richTextSegments(rendered.text,rendered.ranges,rendered.formats).map((segment,index)=><Text key={index} style={segmentTextStyle(segment,zoom,textSettings(object).lineSpacing)}>{segment.text}</Text>)}</Text>:null}
    </TextInput>
  </View>
}
