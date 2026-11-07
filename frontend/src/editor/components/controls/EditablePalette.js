import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import { tapeColors, usePalette } from '../../hooks/usePalettes'
import Icon from './Icon'
import PresetColorEditor from '../../../diary/components/PresetColorEditor'

// 고치는 칸의 굵은 점선(3 primaryText). View 점선은 굵기로 간격이 정해져(3 → 9 · 9) 성글어, 원 둘레를 6조각으로 나눈 점선을 SVG 로 그린다
const RING_R = 12.5, RING_STEP = (2 * Math.PI * RING_R) / 6
function FocusRing() {
  return <Svg pointerEvents="none" width={28} height={28} style={s.ring}>
    <Circle cx={14} cy={14} r={RING_R} fill="none" stroke={colors.primaryText} strokeWidth={3} strokeDasharray={`${RING_STEP * 0.6} ${RING_STEP * 0.4}`} />
  </Svg>
}

// One immutable slot is edited at a time. No add/delete/custom collection.
export default function EditablePalette({ scope, label, value, onPick, onOpenEditor, initiallyEditing = false, allowDirect = false }) {
  const palette = usePalette(scope)
  const [editing, setEditing] = useState(initiallyEditing), [request, setRequest] = useState(null), [error, setError] = useState(false)
  // 편집 중 굵은 점선(포커스)은 지금 고치고 있는 칸으로 옮긴다(지라 605). 아직 연 칸이 없으면 지금 고른 색의 칸
  const [editIndex, setEditIndex] = useState(null)
  // 색 창에서 고치는 동안 그 칸을 바로 바꿔 보여 준다({ index, color }). 저장하거나 닫으면 저장된 색으로 돌아간다
  const [preview, setPreview] = useState(null)
  const toggleEditing = () => { setEditing(!editing); setEditIndex(null) }
  const refs = useRef({}), anchors = useRef({})
  const openDirect = () => {
    const spec = {title:`${label} 색`,value, onDone:color => onPick?.(color),anchor:anchors.current.direct ?? null}
    ;(onOpenEditor ?? setRequest)(spec)
  }
  const open = (index) => {
    setEditIndex(index)
    const entry = palette.colors[index]
    const spec = { title: `${label} 색`, tape: scope === 'tape', value: entry, defaultValue: palette.defaults?.[index] ?? null,
      onChange: color => setPreview({ index, color }), onClose: () => setPreview(null),
      onDone: async color => { await palette.replace(index, color); setPreview(null); onPick?.(color) } }
    ;(onOpenEditor ?? setRequest)({ ...spec, anchor: anchors.current[index] ?? null })
  }
  return <View style={s.box}>
    <View style={s.heading}>
      <Text style={s.label}>{label} 색상</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 팔레트 편집`} accessibilityState={{ selected: editing }} hitSlop={6} onPress={toggleEditing} style={s.edit}>
        <Text style={s.editText}>{editing ? '편집 끝내기' : '팔레트 편집'}</Text>
      </Pressable>
    </View>
    <View style={paletteSwatchStyles.row} accessibilityLabel={`${label} 기본 팔레트`}>
      {palette.colors.map((entry, index) => {
        const shown = preview?.index === index ? preview.color : entry
        const {bg, fg} = scope === 'tape' ? tapeColors(shown) : { bg: shown }
        return <Pressable key={index} ref={node => { refs.current[index] = node }} collapsable={false}
          onLayout={() => refs.current[index]?.measureInWindow?.((x,y,width,height) => {
            if ([x,y,width,height].every(Number.isFinite) && width > 0 && height > 0) anchors.current[index] = {x,y,width,height}
          })}
          accessibilityRole="button" accessibilityLabel={editing ? `${label} 팔레트 ${index + 1}번 색 편집` : `${label} 색상 ${entry}`}
          accessibilityState={{ selected: value === entry, disabled: editing && !palette.loaded }} disabled={editing && !palette.loaded}
          hitSlop={1} onPress={() => editing ? open(index) : onPick?.(entry)} style={paletteSwatchStyles.cell}>
          {/* key: 안드로이드는 점선 → 실선으로 borderStyle 을 되돌리면 다시 그리지 않아, 편집을 끝내도 점선이 남았다(지라 604). 상태가 바뀌면 새로 그린다 */}
          <View key={editing ? 'edit' : 'pick'} style={[paletteSwatchStyles.dot, {backgroundColor:bg}, editing ? [s.editing, (editIndex ?? palette.colors.indexOf(value)) === index && s.editFocus] : [s.solid, value === entry && paletteSwatchStyles.chosen]]}>{fg && <View style={[s.inner,{backgroundColor:fg}]} />}{editing && (editIndex ?? palette.colors.indexOf(value)) === index && <FocusRing />}</View>
        </Pressable>
      })}
      {allowDirect && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 색 직접 지정`} hitSlop={1} onPress={openDirect} style={paletteSwatchStyles.cell}>
        <View style={[paletteSwatchStyles.dot,s.direct]}><Icon name="plus" size={17} color={colors.primaryText} /></View>
      </Pressable>}
    </View>
    {!palette.loaded && <Pressable accessibilityRole="button" accessibilityLabel={`${label} 팔레트 다시 불러오기`} onPress={async () => { setError(false); try { await palette.retry() } catch { setError(true) } }}><Text style={s.notice}>팔레트 불러오기 · 재시도</Text></Pressable>}
    {error && <Text accessibilityRole="alert" style={s.notice}>팔레트를 불러오지 못했어요.</Text>}
    {request && <PresetColorEditor {...request} onDone={async color => { await request.onDone(color); setRequest(null) }} onClose={() => { request.onClose?.(); setRequest(null) }} />}
  </View>
}
export const paletteSwatchStyles=StyleSheet.create({
 row:{flexDirection:'row',flexWrap:'wrap'},cell:{width:'12.5%',height:48,alignItems:'center',justifyContent:'center'},
 dot:{width:28,height:28,borderRadius:14,borderWidth:1,borderColor:colors.cardBorder},chosen:{borderWidth:3,borderColor:colors.primaryText}
})
const s=StyleSheet.create({
 box:{gap:8},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
 label:{fontSize:13,fontWeight:'700',color:colors.text},edit:{minHeight:36,justifyContent:'center',paddingHorizontal:6},editText:{fontSize:12,fontWeight:'700',color:colors.primaryText},
 direct:{borderStyle:'dashed',alignItems:'center',justifyContent:'center'},editing:{borderStyle:'dashed',borderColor:colors.textMuted},editFocus:{borderWidth:0},ring:{position:'absolute',left:0,top:0},solid:{borderStyle:'solid'},inner:{position:'absolute',right:3,bottom:3,width:9,height:9,borderRadius:5},notice:{fontSize:12,color:colors.textMuted}
})
