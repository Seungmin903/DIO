import { useCallback, useContext, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '../../shared/theme'
import { DEFAULT_SHAPE_STYLE, EDITOR_SHAPES, SHAPE_CATEGORIES, SHAPE_BORDER_STYLES, shapeBorderDash } from '../utils/editorShapes'
import { Segmented, ToolPanelHeader, toolPanelStyles as p } from './ToolPanel'
import ColorPicker, { PaletteInteractionContext } from './controls/ColorPicker'
import Slider from './controls/Slider'

const SWATCHES = ['#F8EBA7', '#F4CDD5', '#D4E6CF', '#CED9EE', '#DFD4EE', '#FFFFFF']
export default function ShapeSettings({ settings, onChange, onCheckpoint, onAdd, onClose, embedded = false, showShapePicker = true }) {
  const parentPaletteInteraction = useContext(PaletteInteractionContext)
  const Content = embedded ? View : ScrollView
  const scroll = useRef(null)
  const [paletteDragging,setPaletteDragging] = useState(false)
  const onPaletteInteraction = useCallback(active => {
    if (!embedded) scroll.current?.setNativeProps?.({scrollEnabled:!active})
    setPaletteDragging(active)
    if (embedded) parentPaletteInteraction?.(active)
  },[embedded,parentPaletteInteraction])
  const value = { ...DEFAULT_SHAPE_STYLE, ...settings }
  const [category, setCategory] = useState('all'), [picker, setPicker] = useState(null)
  const palette = (key, label, disabled = false) => <View style={[styles.section,disabled && p.dim]}>
    <Text style={p.label}>{label}</Text>
    <View style={styles.palette}>
      {key === 'fill' && <Pressable accessibilityRole="button" accessibilityLabel="채우기 없음" accessibilityState={{selected:value.fill==='none'}} onPress={()=>onChange({fill:'none'})} style={[styles.swatch,styles.noFill,value.fill==='none'&&styles.chosen]}><Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M5 19L19 5" stroke={colors.textMuted} strokeWidth={1.5} /></Svg></Pressable>}
      {SWATCHES.map(color => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`${label} ${color}`} disabled={disabled} accessibilityState={{ selected: value[key] === color, disabled }} onPress={() => onChange({ [key]: color })} style={[styles.swatch, { backgroundColor: color }, value[key] === color && styles.chosen]} />)}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 직접 선택`} disabled={disabled} accessibilityState={{ expanded: !disabled && picker === key, disabled }} onPress={() => setPicker(picker === key ? null : key)} style={styles.customColor}><Text style={styles.plus}>+</Text></Pressable>
    </View>
    {!disabled && picker === key && <ColorPicker onInteractionChange={onPaletteInteraction} label={label} value={value[key] === 'none' ? '#FFFFFF' : value[key]} onStart={onCheckpoint} onChange={color => onChange({ [key]: color }, false)} />}
  </View>
  return <View style={embedded ? {marginTop:14} : p.card}>
    {!embedded && <ToolPanelHeader icon="shape" title="도형" onClose={onClose} />}
    <Content ref={scroll} {...(embedded ? {style:{gap:12}} : {scrollEnabled:!paletteDragging,keyboardShouldPersistTaps:"handled",contentContainerStyle:p.content,showsVerticalScrollIndicator:false})}>
      {showShapePicker && <>
      <Text style={p.label}>모양</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.segment}>
        {SHAPE_CATEGORIES.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:category===item.id}} onPress={()=>setCategory(item.id)} style={[p.segmentItem,styles.categoryTab,category===item.id&&p.segmentActive]}><Text numberOfLines={1} style={[p.segmentText,category===item.id&&p.segmentTextActive]}>{item.label}</Text></Pressable>)}
      </ScrollView>
      <ScrollView nestedScrollEnabled style={styles.shapeList} contentContainerStyle={styles.shapes}>
        {EDITOR_SHAPES.filter(item => category === 'all' || item.category === category).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: value.shape === item.id }} onPress={() => onChange({ shape: item.id })} style={[styles.shape, value.shape === item.id && styles.selected]}>
          <Svg width={26*Math.min(1,item.ratio??1)} height={26/Math.max(1,item.ratio??1)} viewBox="-5 -5 110 110" preserveAspectRatio="none"><Path d={item.path} fill={value.fill === 'none' ? 'none' : value.fill} stroke={colors.textMuted} strokeWidth={4} /></Svg>
        </Pressable>)}
      </ScrollView>
      </>}
      {palette('fill', '채우기')}
      <Text style={p.label}>테두리 두께</Text>
      <Slider centerValue label="테두리 두께" value={value.borderWidth} min={0} max={16} step={1} onStart={onCheckpoint} onChange={borderWidth => onChange({ borderWidth }, false)} />
      {palette('borderColor', '테두리 색상', !value.borderWidth)}
      <Text style={p.label}>테두리 모양</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[p.segment,!value.borderWidth&&p.dim]}>
        {SHAPE_BORDER_STYLES.map(item=><Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`테두리 ${item.label}`} accessibilityState={{checked:value.borderStyle===item.id,disabled:!value.borderWidth}} disabled={!value.borderWidth} onPress={()=>onChange({borderStyle:item.id})} style={[p.segmentItem,styles.borderPreview,value.borderStyle===item.id&&p.segmentActive]}>
          <Svg width={52} height={22}><Path d="M2 11H50" stroke={value.borderStyle===item.id?colors.text:colors.textMuted} strokeWidth={2} strokeDasharray={shapeBorderDash(item.id,2)} /></Svg>
          <Text style={[styles.borderPreviewLabel,value.borderStyle===item.id&&p.segmentTextActive]}>{item.label}</Text>
        </Pressable>)}
      </ScrollView>
      <Text style={styles.hint}>글 입력은 선택 사항 · 도형을 두 번 눌러 입력해요.</Text>
    </Content>
    {onAdd && <View style={styles.footer}>
      <Pressable accessibilityRole="button" accessibilityLabel="도형 캔버스에 추가" onPress={onAdd} style={styles.add}><Text style={[styles.buttonText,styles.addText]}>캔버스에 추가</Text></Pressable>
    </View>}
  </View>
}
const styles = StyleSheet.create({
  addText: { color: colors.surface },
  borderPreview:{flex:0,minWidth:76,minHeight:56,paddingHorizontal:8,paddingVertical:4},borderPreviewLabel:{color:colors.textMuted,fontSize:11,fontWeight:'600'},
  footer:{paddingHorizontal:16,paddingBottom:16,paddingTop:8},shapeList:{maxHeight:176,flexShrink:0},
  categoryTab:{flex:0,flexGrow:0,flexShrink:0,flexBasis:'auto',minWidth:64,minHeight:44,paddingHorizontal:12},
  noFill:{alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},
  palette:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},chosen:{borderWidth:3,borderColor:colors.primary},customColor:{width:30,height:30,borderRadius:15,borderWidth:1,borderStyle:'dashed',borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  category:{minHeight:44,paddingHorizontal:12,borderRadius:11,borderWidth:1.5,borderColor:'transparent',backgroundColor:colors.surfaceMuted,justifyContent:'center'},
  section:{gap:8}, shapes:{flexDirection:'row',flexWrap:'wrap',gap:0}, shape:{width:'16.666%',height:44,alignItems:'center',justifyContent:'center',borderRadius:10,borderWidth:1.5,borderColor:'transparent'},
  selected:{borderColor:colors.primary,backgroundColor:colors.primarySoft}, swatches:{flexDirection:'row',flexWrap:'wrap',gap:4}, swatch:{width:30,height:30,borderRadius:15,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  none:{color:colors.textMuted,fontSize:18},plus:{color:colors.text,fontSize:18},add:{minHeight:44,borderRadius:14,backgroundColor:colors.primaryStrong,alignItems:'center',justifyContent:'center'},secondary:{minHeight:44,borderRadius:14,backgroundColor:colors.surfaceMuted,alignItems:'center',justifyContent:'center'},buttonText:{color:colors.text,fontSize:13,fontWeight:'700'},hint:{color:colors.textMuted,fontSize:11,fontWeight:'600'},
})
