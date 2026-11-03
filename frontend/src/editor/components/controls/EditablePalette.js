import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { tapeColors, usePalette } from '../../hooks/usePalettes'
import Icon from './Icon'
import PresetColorEditor from '../../../diary/components/PresetColorEditor'

// One immutable slot is edited at a time. No add/delete/custom collection.
export default function EditablePalette({ scope, label, value, onPick, onOpenEditor, initiallyEditing = false, allowDirect = false }) {
  const palette = usePalette(scope)
  const [editing, setEditing] = useState(initiallyEditing), [request, setRequest] = useState(null), [error, setError] = useState(false)
  const refs = useRef({}), anchors = useRef({})
  const openDirect = () => {
    const spec = {title:`${label} 색`,value, onDone:color => onPick?.(color),anchor:anchors.current.direct ?? null}
    ;(onOpenEditor ?? setRequest)(spec)
  }
  const open = (index) => {
    const entry = palette.colors[index]
    const spec = { title: `${label} 색`, tape: scope === 'tape', value: entry,
      onDone: async color => { await palette.replace(index, color); onPick?.(color) } }
    ;(onOpenEditor ?? setRequest)({ ...spec, anchor: anchors.current[index] ?? null })
  }
  return <View style={s.box}>
    <View style={s.heading}>
      <Text style={s.label}>{label} 색상</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 팔레트 편집`} accessibilityState={{ selected: editing }} onPress={() => setEditing(!editing)} style={s.edit}>
        <Text style={s.editText}>{editing ? '편집 끝내기' : '팔레트 편집'}</Text>
      </Pressable>
    </View>
    <View style={paletteSwatchStyles.row} accessibilityLabel={`${label} 기본 팔레트`}>
      {palette.colors.map((entry, index) => {
        const {bg, fg} = scope === 'tape' ? tapeColors(entry) : { bg: entry }
        return <Pressable key={index} ref={node => { refs.current[index] = node }} collapsable={false}
          onLayout={() => refs.current[index]?.measureInWindow?.((x,y,width,height) => {
            if ([x,y,width,height].every(Number.isFinite) && width > 0 && height > 0) anchors.current[index] = {x,y,width,height}
          })}
          accessibilityRole="button" accessibilityLabel={editing ? `${label} 팔레트 ${index + 1}번 색 편집` : `${label} 색상 ${entry}`}
          accessibilityState={{ selected: value === entry, disabled: editing && !palette.loaded }} disabled={editing && !palette.loaded}
          onPress={() => editing ? open(index) : onPick?.(entry)} style={paletteSwatchStyles.cell}>
          <View style={[paletteSwatchStyles.dot, {backgroundColor:bg}, value === entry && paletteSwatchStyles.chosen, editing && s.editing]}>{fg && <View style={[s.inner,{backgroundColor:fg}]} />}</View>
        </Pressable>
      })}
      {allowDirect && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 색 직접 지정`} onPress={openDirect} style={paletteSwatchStyles.cell}>
        <View style={[paletteSwatchStyles.dot,s.direct]}><Icon name="plus" size={17} color={colors.primaryText} /></View>
      </Pressable>}
    </View>
    {!palette.loaded && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 팔레트 다시 불러오기`} onPress={async () => { setError(false); try { await palette.retry() } catch { setError(true) } }}><Text style={s.notice}>팔레트 불러오기 · 재시도</Text></Pressable>}
    {error && <Text accessibilityRole="alert" style={s.notice}>팔레트를 불러오지 못했어요.</Text>}
    {request && <PresetColorEditor {...request} onDone={async color => { await request.onDone(color); setRequest(null) }} onClose={() => setRequest(null)} />}
  </View>
}
export const paletteSwatchStyles=StyleSheet.create({
 row:{flexDirection:'row',flexWrap:'wrap'},cell:{width:'12.5%',height:38,alignItems:'center',justifyContent:'center'},
 dot:{width:28,height:28,borderRadius:14,borderWidth:1,borderColor:colors.cardBorder},chosen:{borderWidth:3,borderColor:colors.primaryText}
})
const s=StyleSheet.create({
 box:{gap:8},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
 label:{fontSize:13,fontWeight:'700',color:colors.text},edit:{minHeight:36,justifyContent:'center',paddingHorizontal:6},editText:{fontSize:12,fontWeight:'700',color:colors.primaryText},
 direct:{borderStyle:'dashed',alignItems:'center',justifyContent:'center'},editing:{borderStyle:'dashed'},inner:{position:'absolute',right:3,bottom:3,width:9,height:9,borderRadius:5},notice:{fontSize:12,color:colors.textMuted}
})
