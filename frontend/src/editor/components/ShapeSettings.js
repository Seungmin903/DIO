import { useCallback, useContext, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '../../shared/theme'
import { DEFAULT_SHAPE_STYLE, EDITOR_SHAPES, SHAPE_CATEGORIES, SHAPE_BORDER_STYLES, shapeBorderDash } from '../utils/editorShapes'
import { Segmented, ToolPanelHeader, toolPanelStyles as p } from './ToolPanel'
import ColorPicker, { PaletteInteractionContext } from './controls/ColorPicker'
import Slider from './controls/Slider'

// 코덱스 18번: 첫 화면은 자주 쓰는 도형 12개(4×3)만, '더 보기'에서 분류와 나머지 도형
const COMMON_SHAPE_COUNT = 12
// 도형 채우기 기본 색(코덱스 2026-10-31): 테이프 · 형광펜과 같은 뽀얀 톤 7색 + 흰색
const SWATCHES = ['#F8E5A1', '#F6D3C6', '#F3CDD6', '#E2D5F0', '#D5DDF3', '#CFE8E8', '#DCE8CA', '#FFFFFF']
// 메모 무늬 색: 종이 바탕에 보이게 마스킹테이프 무늬 색(진한 쪽) 7색 + 글 남색
const MEMO_LINE_SWATCHES = ['#C96B7B', '#D8A93E', '#65A889', '#5F9BBC', '#818AC3', '#8A6650', '#666D7A', '#0B1766']
export default function ShapeSettings({ settings, onChange, onCheckpoint, onCommit, onAdd, onClose, embedded = false, showShapePicker = true }) {
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
  const [category, setCategory] = useState('all'), [picker, setPicker] = useState(null), [moreShapes, setMoreShapes] = useState(false)
  const palette = (key, label, disabled = false) => <View style={[styles.section,disabled && p.dim]}>
    <Text style={p.label}>{label}</Text>
    <View style={styles.palette}>
      {key === 'fill' && !value.art && <Pressable accessibilityRole="button" accessibilityLabel="채우기 없음" accessibilityState={{selected:value.fill==='none'}} onPress={()=>onChange({fill:'none'})} style={[styles.swatch,styles.noFill,value.fill==='none'&&styles.chosen]}><Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M5 19L19 5" stroke={colors.textMuted} strokeWidth={1.5} /></Svg></Pressable>}
      {(key === 'borderColor' && value.art ? MEMO_LINE_SWATCHES : SWATCHES).map(color => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`${label} ${color}`} disabled={disabled} accessibilityState={{ selected: value[key] === color, disabled }} onPress={() => onChange({ [key]: color })} style={[styles.swatch, { backgroundColor: color }, value[key] === color && styles.chosen]} />)}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} 직접 선택`} disabled={disabled} accessibilityState={{ expanded: !disabled && picker === key, disabled }} onPress={() => setPicker(picker === key ? null : key)} style={styles.customColor}><Text style={styles.plus}>+</Text></Pressable>
    </View>
    {!disabled && picker === key && <ColorPicker onInteractionChange={onPaletteInteraction} label={label} value={value[key] === 'none' ? '#FFFFFF' : value[key]} onStart={onCheckpoint} onEnd={onCommit} onChange={color => onChange({ [key]: color }, false)} />}
  </View>
  return <View style={embedded ? {marginTop:14} : p.card}>
    {!embedded && <ToolPanelHeader icon="shape" title="도형" onClose={onClose} />}
    <Content ref={scroll} {...(embedded ? {style:{gap:12}} : {scrollEnabled:!paletteDragging,keyboardShouldPersistTaps:"handled",contentContainerStyle:p.content,showsVerticalScrollIndicator:false})}>
      {showShapePicker && <>
      <Text style={p.label}>모양</Text>
      {moreShapes && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.segment}>
        {SHAPE_CATEGORIES.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:category===item.id}} onPress={()=>setCategory(item.id)} style={[p.segmentItem,styles.categoryTab,category===item.id&&p.segmentActive]}><Text numberOfLines={1} style={[p.segmentText,category===item.id&&p.segmentTextActive]}>{item.label}</Text></Pressable>)}
      </ScrollView>}
      {(() => {
        const list = moreShapes ? EDITOR_SHAPES.filter(item => category === 'all' || item.category === category) : EDITOR_SHAPES.slice(0, COMMON_SHAPE_COUNT)
        const grid = list.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: value.shape === item.id }} onPress={() => onChange({ shape: item.id })} style={[styles.shape, value.shape === item.id && styles.selected]}>
          <Svg width={26*Math.min(1,item.ratio??1)} height={26/Math.max(1,item.ratio??1)} viewBox="-5 -5 110 110" preserveAspectRatio="none"><Path d={item.path} fill={value.fill === 'none' ? 'none' : value.fill} stroke={colors.textMuted} strokeWidth={4} /></Svg>
        </Pressable>)
        return moreShapes
          ? <ScrollView nestedScrollEnabled style={styles.shapeList} contentContainerStyle={styles.shapes}>{grid}</ScrollView>
          : <View style={styles.shapes}>{grid}</View>
      })()}
      <Pressable accessibilityRole="button" accessibilityLabel={moreShapes ? '도형 접기' : '도형 더 보기'} accessibilityState={{expanded:moreShapes}} onPress={()=>setMoreShapes(open=>!open)} style={styles.moreButton}><Text style={styles.moreText}>{moreShapes ? '접기' : '더 보기'}</Text></Pressable>
      </>}
      {/* 메모 종이: 종이 한 색 + 무늬 한 색만 바꾼다 (테두리 두께 · 모양은 종이 그림이 정한다) */}
      {value.art ? <>
        {palette('fill', '종이 색')}
        {palette('borderColor', '무늬 색')}
      </> : <>
      {palette('fill', '채우기')}
      <Text style={p.label}>테두리 두께</Text>
      <Slider centerValue label="테두리 두께" value={value.borderWidth} min={0} max={16} step={1} onStart={onCheckpoint} onEnd={onCommit} onChange={borderWidth => onChange({ borderWidth }, false)} />
      {palette('borderColor', '테두리 색상', !value.borderWidth)}
      <Text style={p.label}>테두리 모양</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[p.segment,!value.borderWidth&&p.dim]}>
        {SHAPE_BORDER_STYLES.map(item=><Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`테두리 ${item.label}`} accessibilityState={{checked:value.borderStyle===item.id,disabled:!value.borderWidth}} disabled={!value.borderWidth} onPress={()=>onChange({borderStyle:item.id})} style={[p.segmentItem,styles.borderPreview,value.borderStyle===item.id&&p.segmentActive]}>
          <Svg width={52} height={22}><Path d="M2 11H50" stroke={value.borderStyle===item.id?colors.text:colors.textMuted} strokeWidth={2} strokeDasharray={shapeBorderDash(item.id,2)} /></Svg>
          <Text style={[styles.borderPreviewLabel,value.borderStyle===item.id&&p.segmentTextActive]}>{item.label}</Text>
        </Pressable>)}
      </ScrollView>
      </>}
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
  moreButton:{minHeight:40,borderRadius:10,borderWidth:1,borderColor:colors.cardBorder,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},moreText:{color:colors.text,fontSize:13,fontWeight:'700'},
  categoryTab:{flex:0,flexGrow:0,flexShrink:0,flexBasis:'auto',minWidth:64,minHeight:44,paddingHorizontal:12},
  noFill:{alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},
  palette:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},chosen:{borderWidth:3,borderColor:colors.primaryStrong},customColor:{width:28,height:28,borderRadius:14,borderWidth:1,borderStyle:'dashed',borderColor:colors.cardBorder,alignItems:'center',justifyContent:'center'},
  category:{minHeight:44,paddingHorizontal:12,borderRadius:11,borderWidth:1.5,borderColor:'transparent',backgroundColor:colors.surfaceMuted,justifyContent:'center'},
  section:{gap:8}, shapes:{flexDirection:'row',flexWrap:'wrap',gap:0}, shape:{width:'25%',height:56,alignItems:'center',justifyContent:'center',borderRadius:10,borderWidth:1,borderColor:'transparent'},
  selected:{borderColor:colors.primaryStrong,borderWidth:2}, swatches:{flexDirection:'row',flexWrap:'wrap',gap:4}, swatch:{width:28,height:28,borderRadius:14,borderWidth:1,borderColor:colors.cardBorder,alignItems:'center',justifyContent:'center'},
  none:{color:colors.textMuted,fontSize:18},plus:{color:colors.text,fontSize:18},add:{minHeight:48,borderRadius:10,backgroundColor:colors.primaryStrong,alignItems:'center',justifyContent:'center'},secondary:{minHeight:44,borderRadius:12,backgroundColor:colors.surfaceMuted,alignItems:'center',justifyContent:'center'},buttonText:{color:colors.text,fontSize:13,fontWeight:'700'},hint:{color:colors.textMuted,fontSize:11,fontWeight:'600'},
})
