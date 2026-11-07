import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import ColorPicker from '../../editor/components/controls/ColorPicker'
import EyedropperOverlay from '../../editor/components/controls/EyedropperOverlay'
import EyedropperIcon from '../../editor/components/controls/EyedropperIcon'
import Icon from '../../editor/components/controls/Icon'
import { tapeColors } from '../../editor/hooks/usePalettes'
import { eyedropperMode, openBrowserEyedropper } from '../../editor/utils/eyedropper'
import { bubble, colors } from '../../shared/theme'
import PopoverMenu from './PopoverMenu'

// All color entry points share this UI. Normal close commits; rotation dismisses.
// defaultValue: 팔레트 칸의 처음 색. 지금 색이 그와 다르면 제목 줄 닫기(X) 왼쪽에 '원래대로'를 두고, 누르면 처음 색으로 되돌린다(닫을 때 저장)
export default function PresetColorEditor({ title, tape = false, slots = null, anchor = null, value, original = value, defaultValue = null, onDone, onClose, onChange, onEyedropper }) {
  const window = useWindowDimensions()
  const [keyboardTop,setKeyboardTop] = useState(null)
  useEffect(() => {
    const show = Keyboard?.addListener('keyboardDidShow', event => setKeyboardTop(event.endCoordinates?.screenY ?? null))
    const hide = Keyboard?.addListener('keyboardDidHide', () => setKeyboardTop(null))
    return () => { show?.remove(); hide?.remove() }
  }, [])
  const names = tape ? ['바탕색', '무늬색'] : slots
  const toList = v => tape ? (({ bg, fg }) => [bg, fg])(tapeColors(v)) : slots ? [...v] : [v]
  const fromList = list => tape ? `custom:${list[0]}:${list[1]}` : slots ? list : list[0]
  const [list, setList] = useState(() => toList(value)), latest = useRef(list)
  const [slot, setSlot] = useState(0), [dropping, setDropping] = useState(false)
  const [saving, setSaving] = useState(false), closing = useRef(false), [error, setError] = useState(null)
  const same = (a, b) => a.length === b.length && a.every((color, i) => String(color).toUpperCase() === String(b[i]).toUpperCase())
  const defaults = defaultValue == null ? null : toList(defaultValue)
  const changed = Boolean(defaults) && !same(list, defaults)
  const restore = () => { latest.current = defaults; setList(defaults); onChange?.(defaultValue) }
  const pick = hex => {
    const next = latest.current.map((color, i) => i === slot ? hex : color)
    latest.current = next; setList(next); onChange?.(fromList(next))
  }
  const close = async () => {
    if (closing.current) return
    const base = toList(original ?? value)
    if (original != null && same(latest.current, base)) { onClose(); return }
    closing.current = true; setSaving(true); setError(null)
    // 처음 색으로 되돌렸으면 처음 값 그대로 저장한다(테이프 기본 색은 id 라 'custom:…' 로 바꾸지 않는다)
    try { await onDone(defaults && same(latest.current, defaults) ? defaultValue : fromList(latest.current)) }
    catch { setError('색상을 저장하지 못했어요. 다시 시도해 주세요.') }
    finally { closing.current = false; setSaving(false) }
  }
  const dropper = async () => {
    // Wait for the keyboard to leave before taking the full-screen snapshot.
    if (Keyboard.isVisible?.()) await new Promise(resolve => {
      let timer
      const finish = () => { clearTimeout(timer); subscription.remove(); resolve() }
      const subscription = Keyboard.addListener('keyboardDidHide', finish)
      timer = setTimeout(finish, 800)
      Keyboard.dismiss()
    })
    else Keyboard.dismiss()
    if (onEyedropper) {
      setDropping(true)
      try { const color = await onEyedropper(); if (color) pick(color) }
      finally { setDropping(false) }
    } else if (eyedropperMode === 'browser') {
      const color = await openBrowserEyedropper(); if (color) pick(color)
    } else setDropping(true)
  }
  if (dropping) return onEyedropper ? null : <EyedropperOverlay original={list[slot]} onCancel={() => setDropping(false)} onPick={hex => { setDropping(false); pick(hex) }} />
  const width = Math.min(340, window.width - 24)
  const height = Math.min(names ? 460 : 410, Math.min(window.height, keyboardTop ?? window.height) - 24)
  return <PopoverMenu open keyboardAware availableHeight={keyboardTop} anchor={anchor ? { ...anchor, width } : null} width={width} height={height} label={title} style={s.bubble} onClose={close} onDismiss={onClose}>
    <View style={s.head}>
      <Text accessibilityRole="header" style={s.title} numberOfLines={1}>{title}</Text>
      {changed && <Pressable accessibilityRole="button" accessibilityLabel={`${title} 원래 색으로 되돌리기`} disabled={saving} onPress={restore} style={s.restore}><Text style={s.restoreText}>원래대로</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} 창 닫기`} disabled={saving} onPress={close} style={s.close}><Icon name="close" size={18} color={colors.primaryText} /></Pressable>
    </View>
    <ScrollView pointerEvents={saving ? 'none' : 'auto'} keyboardShouldPersistTaps="handled" style={{maxHeight:height-50}} contentContainerStyle={s.body}>
      {names && <View style={s.slots} accessibilityRole="radiogroup">{names.map((name,i) => <Pressable key={name} accessibilityRole="radio" accessibilityLabel={`${name} 바꾸기`} accessibilityState={{checked:slot===i}} onPress={() => setSlot(i)} style={[s.slot,slot===i&&s.slotOn]}>
        <View style={[s.slotDot,{backgroundColor:list[i]}]} /><Text style={s.slotText}>{name}</Text>
      </Pressable>)}</View>}
      <ColorPicker value={list[slot]} label={names ? `${title} ${names[slot]}` : title} onChange={pick}
        trailing={(onEyedropper || eyedropperMode) && <Pressable accessibilityRole="button" accessibilityLabel="스포이드로 화면에서 색 가져오기" disabled={saving} hitSlop={3} onPress={dropper} style={s.dropper}><EyedropperIcon size={18} color={colors.primaryText} /></Pressable>} />
      {saving && <Text style={s.notice}>저장 중이에요.</Text>}
      {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView>
  </PopoverMenu>
}
const s = StyleSheet.create({
 bubble:{...bubble,padding:0,overflow:'hidden'},head:{minHeight:50,flexDirection:'row',alignItems:'center',paddingLeft:20,paddingRight:4,borderBottomWidth:1,borderBottomColor:colors.border},title:{flex:1,fontSize:17,fontWeight:'700',color:colors.text},restore:{minHeight:48,paddingHorizontal:10,justifyContent:'center'},restoreText:{fontSize:14,fontWeight:'700',color:colors.primaryText},close:{width:48,height:48,alignItems:'center',justifyContent:'center'},body:{padding:20,gap:14},dropper:{width:38,height:38,alignItems:'center',justifyContent:'center',borderRadius:9,backgroundColor:colors.surfaceMuted},slots:{flexDirection:'row',gap:4,padding:4,borderRadius:12,backgroundColor:colors.surfaceMuted},slot:{flex:1,minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderRadius:9},slotOn:{backgroundColor:colors.surface},slotDot:{width:16,height:16,borderRadius:8,borderWidth:1,borderColor:colors.border},slotText:{fontSize:13,fontWeight:'700',color:colors.primaryText},notice:{fontSize:12,color:colors.textMuted},error:{fontSize:12,color:colors.dangerStrong}
})

/** 색 창 제목: '{대상} 색' 하나로(코덱스 2026-11-02). '테두리 색상' → '테두리 색', '채우기' → '채우기 색' */
export function colorTitle(label) {
  const name = String(label ?? '').trim().replace(/색상$/, '색');
  return /색$/.test(name) ? name : `${name} 색`;
}

/**
 * 견본 · 줄을 누르면 그 자리 옆에 색 창을 띄우는 훅. open(ref, props) 로 열고, element 를 화면에 둔다.
 * props 는 PresetColorEditor 와 같다(title 은 colorTitle 로 맞춘다). 닫히면 onDone/onClose 뒤에 스스로 닫힌다.
 */
export function useColorWindow() {
  const [state, setState] = useState(null), serial = useRef(0)
  const open = (ref, props) => {
    const id = ++serial.current
    setState({ ...props, anchor:null, id })
    ref?.current?.measureInWindow?.((x,y,width,height) => {
      if ([x,y,width,height].every(Number.isFinite) && width > 0 && height > 0)
        setState(current => current?.id === id ? {...current,anchor:{x,y,width,height}} : current)
    })
  }
  const dismiss = () => setState(current => current?.id === state.id ? null : current)
  const element = state && <PresetColorEditor {...state} title={colorTitle(state.title)}
    onDone={async value => { await state.onDone?.(value); dismiss() }}
    onClose={() => { state.onClose?.(); dismiss() }} />
  return { open, element, isOpen:Boolean(state) }
}
