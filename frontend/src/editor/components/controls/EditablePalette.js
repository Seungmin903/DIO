import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { colors } from '../../../shared/theme'
import { glassColors, glassEntry, tapeColors, usePalette } from '../../hooks/usePalettes'
import { glitterColorOf, sheenAutoColor } from '../../utils/glassInk'
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
// 유리펜 칸에 쓸 색 셋. 'auto' 는 잉크색에서 자동 계산한 값으로 채운다(칸이 실제 그림과 같게).
export const glassResolved = (entry) => {
  const { ink, glitter, sheen } = glassColors(entry)
  const rgb = [1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16) / 255)
  const hex = v => '#' + v.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0').toUpperCase()).join('')
  return { ink, glitter: glitter ?? hex(glitterColorOf(rgb)), sheen: sheen ?? hex(sheenAutoColor(rgb)) }
}
// 칸 안의 유리펜 미리보기: 바깥 고리가 테, 안쪽 면이 잉크, 그 위에 글리터 몇 점.
// 자리는 고정이라 어느 칸이든 같은 모양으로 비교된다.
const GLASS_SPECKS = [[8, 7], [17, 10], [11, 16], [6, 14]]
export function GlassDot({ look }) {
  return <>
    <View style={[s.glassBody, { backgroundColor: look.ink }]} />
    {GLASS_SPECKS.map(([x, y], i) => <View key={i} style={[s.glassSpeck, { left: x, top: y, backgroundColor: look.glitter, opacity: i % 2 ? 0.95 : 0.7 }]} />)}
  </>
}

// flushEdit: '팔레트 편집' 글자 오른쪽 끝을 줄 끝(위 구분선 끝)에 맞춘다 — 누르는 자리 여백(6)은 바깥으로 뺀다(공방 도구 · 속지 탭)
// showHeading=false: '○○ 색상' 작은 제목 줄을 그리지 않는다. 그때는 '팔레트 편집' 을 부모가 제목 줄에
// 올려 두므로, 편집 상태도 부모가 쥔다(editing · onEditingChange). 공방 도구 · 속지 탭이 이렇게 쓴다.
export default function EditablePalette({ scope, label, value, onPick, onOpenEditor, initiallyEditing = false, allowDirect = false, heading, flushEdit = false, showHeading = true, editing: controlledEditing, onEditingChange }) {
  const palette = usePalette(scope)
  const [ownEditing, setOwnEditing] = useState(initiallyEditing), [request, setRequest] = useState(null), [error, setError] = useState(false)
  const editing = controlledEditing ?? ownEditing
  const setEditing = onEditingChange ?? setOwnEditing
  // 편집 중 굵은 점선(포커스)은 지금 고치고 있는 칸으로 옮긴다(지라 605). 아직 연 칸이 없으면 지금 고른 색의 칸
  const [editIndex, setEditIndex] = useState(null)
  // 색 창에서 고치는 동안 그 칸을 바로 바꿔 보여 준다({ index, color }). 저장하거나 닫으면 저장된 색으로 돌아간다
  const [preview, setPreview] = useState(null)
  const toggleEditing = () => { setEditing(!editing); setEditIndex(null) }
  const refs = useRef({}), anchors = useRef({})
  const openDirect = () => {
    // 유리펜의 value 는 '잉크:글리터:테' 묶음이라 색 창에는 잉크색만 넘긴다(고른 색도 잉크색으로 돌려준다)
    const start = scope === 'glass' ? glassColors(value).ink : value
    const spec = {title:`${label} 색`,value: start, onDone:color => onPick?.(color),anchor:anchors.current.direct ?? null}
    ;(onOpenEditor ?? setRequest)(spec)
  }
  // 유리펜 칸은 색 셋이다(잉크 · 글리터 · 테). 'auto' 는 펜 색에서 자동 계산한 색을 보여 주고,
  // 거기서 고치면 그 색이 칸에 박힌다(마스킹 테이프가 바탕 · 무늬 둘을 고치는 것과 같은 방식).
  const glassSlots = (entry) => {
    const { ink, glitter, sheen } = glassColors(entry)
    const rgb = [1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16) / 255)
    const hex = v => '#' + v.map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0').toUpperCase()).join('')
    return [ink, glitter ?? hex(glitterColorOf(rgb)), sheen ?? hex(sheenAutoColor(rgb))]
  }
  const open = (index) => {
    setEditIndex(index)
    const entry = palette.colors[index]
    const glass = scope === 'glass'
    const spec = { title: `${label} 색`, tape: scope === 'tape',
      ...(glass && { slots: ['잉크색', '글리터색', '테색'] }),
      value: glass ? glassSlots(entry) : entry,
      defaultValue: glass ? null : palette.defaults?.[index] ?? null,
      onChange: color => setPreview({ index, color }), onClose: () => setPreview(null),
      onDone: async color => {
        const saved = glass ? glassEntry({ ink: color[0], glitter: color[1], sheen: color[2] }) : color
        await palette.replace(index, saved); setPreview(null); onPick?.(saved)
      } }
    ;(onOpenEditor ?? setRequest)({ ...spec, anchor: anchors.current[index] ?? null })
  }
  return <View style={s.box}>
    {showHeading && <View style={s.heading}>
      <Text style={s.label}>{heading ?? `${label} 색상`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 팔레트 편집`} accessibilityState={{ selected: editing }} hitSlop={6} onPress={toggleEditing} style={[s.edit, flushEdit && s.editFlush]}>
        <Text style={s.editText}>{editing ? '편집 끝내기' : '팔레트 편집'}</Text>
      </Pressable>
    </View>}
    <View style={paletteSwatchStyles.row} accessibilityLabel={`${label} 기본 팔레트`}>
      {palette.colors.map((entry, index) => {
        const shown = preview?.index === index ? preview.color : entry
        const {bg, fg} = scope === 'tape' ? tapeColors(shown)
          : scope === 'glass' ? (({ ink, sheen }) => ({ bg: sheen ?? ink, fg: null }))(glassResolved(shown))
          : { bg: shown }
        const glassLook = scope === 'glass' ? glassResolved(shown) : null
        return <Pressable key={index} ref={node => { refs.current[index] = node }} collapsable={false}
          onLayout={() => refs.current[index]?.measureInWindow?.((x,y,width,height) => {
            if ([x,y,width,height].every(Number.isFinite) && width > 0 && height > 0) anchors.current[index] = {x,y,width,height}
          })}
          accessibilityRole="button" accessibilityLabel={editing ? `${label} 팔레트 ${index + 1}번 색 편집` : `${label} 색상 ${entry}`}
          accessibilityState={{ selected: value === entry, disabled: editing && !palette.loaded }} disabled={editing && !palette.loaded}
          hitSlop={1} onPress={() => editing ? open(index) : onPick?.(entry)} style={paletteSwatchStyles.cell}>
          {/* key: 안드로이드는 점선 → 실선으로 borderStyle 을 되돌리면 다시 그리지 않아, 편집을 끝내도 점선이 남았다(지라 604). 상태가 바뀌면 새로 그린다 */}
          <View key={editing ? 'edit' : 'pick'} style={[paletteSwatchStyles.dot, {backgroundColor:bg}, editing ? [s.editing, (editIndex ?? palette.colors.indexOf(value)) === index && s.editFocus] : [s.solid, value === entry && paletteSwatchStyles.chosen]]}>{fg && <View style={[s.inner,{backgroundColor:fg}]} />}{glassLook && <GlassDot look={glassLook} />}{editing && (editIndex ?? palette.colors.indexOf(value)) === index && <FocusRing />}</View>
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
 glassBody:{position:'absolute',left:3,top:3,right:3,bottom:3,borderRadius:11},
 glassSpeck:{position:'absolute',width:2.4,height:2.4,borderRadius:1.2},
 box:{gap:8},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
 label:{fontSize:13,fontWeight:'700',color:colors.text},edit:{minHeight:36,justifyContent:'center',paddingHorizontal:6},editText:{fontSize:12,fontWeight:'700',color:colors.primaryText},editFlush:{marginRight:-6},
 direct:{borderStyle:'dashed',alignItems:'center',justifyContent:'center'},editing:{borderStyle:'dashed',borderColor:colors.textMuted},editFocus:{borderWidth:0},ring:{position:'absolute',left:0,top:0},solid:{borderStyle:'solid'},inner:{position:'absolute',right:3,bottom:3,width:9,height:9,borderRadius:5},notice:{fontSize:12,color:colors.textMuted}
})
// 색 줄 제목 옆의 글자 단추(팔레트 편집 · 기본 색으로)는 같은 모양이어야 한다 → 공방이 이것을 쓴다
export const paletteLinkStyles = { button: s.edit, text: s.editText }
