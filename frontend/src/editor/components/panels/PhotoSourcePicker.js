import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { ToolPanelHeader, toolPanelStyles } from '../ToolPanel'
import Icon from '../controls/Icon'
import MediaImage from '../canvas/MediaImage'
import { useMediaUri } from '../../hooks/useMediaUri'
import { createMediaLibraryRuntime } from '../../../diary/services/mediaLibraryRuntime'
import { mediaLibraryError, mergeMediaPages, canSelectMediaPhoto } from '../../../diary/services/mediaLibraryApi.js'
import AppIcon from '../../../shared/AppIcon'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'

function PhotoRow({row,api,busy,onSelect,columns}) {
  const supported=canSelectMediaPhoto(row)
  const src=useMediaUri({mediaFileId:row.mediaFileId})
  const [failed,setFailed]=useState(false)
  useEffect(()=>{if(!supported)return;let alive=true;api.previewCached(row).catch(()=>{if(alive)setFailed(true)});return()=>{alive=false}},[api,row,supported])
  return <Pressable accessibilityRole="button" accessibilityLabel={`사진 선택: ${row.originalFilename}`} accessibilityState={{disabled:busy||!supported}} disabled={busy||!supported} onPress={()=>onSelect(row)} style={[s.tile,{maxWidth:`${100/columns}%`},(busy||!supported)&&s.disabled]}>
    <View style={s.thumbnail}>{src&&!failed?<MediaImage source={{uri:src}} animated={row.mimeType==='image/gif'} resizeMode="contain" style={s.image} onError={()=>setFailed(true)}/>:<View style={s.placeholder}><AppIcon name="image" size={28} color={colors.textMuted}/><Text style={s.placeholderText}>{!supported?'5MB 초과':failed?'미리보기 실패':'선택해 불러오기'}</Text></View>}
      {row.mimeType==='image/gif'&&<View style={s.badge}><Text style={s.badgeText}>GIF</Text></View>}
    </View>
    <Text numberOfLines={1} style={s.name}>{row.originalFilename}</Text>
  </Pressable>
}

export default function PhotoSourcePicker({diary,onClose,onDevice,onSelect,runtime,sheet=null}) {
  const columns=2
  const [api,setApi]=useState(null),[items,setItems]=useState([]),[cursor,setCursor]=useState(null)
  const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null),[loaded,setLoaded]=useState(false)
  const alive=useRef(true),pending=useRef(false),current=useRef({onSelect});current.current={onSelect}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const run=async work=>{
    if(pending.current)return
    pending.current=true;setBusy(true);setError(null)
    try{await work()}catch(e){if(alive.current)setError(mediaLibraryError(e))}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  const load=(more=false)=>run(async()=>{
    const client=api??runtime??createMediaLibraryRuntime(diary)
    const result=await client.list(more?{cursor}:{})
    if(!alive.current)return
    setApi(client);setItems(previous=>more?mergeMediaPages(previous,result.items):result.items);setCursor(result.nextCursor);setLoaded(true)
  })
  const choose=row=>run(async()=>{
    const image=await api.selectPhoto(row,diary)
    if(alive.current)current.current.onSelect(image)
  })
  return <View accessibilityLabel="사진 패널" style={[toolPanelStyles.card,saved&&s.galleryCard,sheet&&toolPanelStyles.sheetCard,sheet&&s.sheetCard]}>
      <ToolPanelHeader icon="image" title={saved?'최근 추가한 사진':'사진'} onClose={onClose} closeLabel="닫기" dragHandlers={sheet?.dragHandlers}>
        {saved&&<Pressable accessibilityRole="button" accessibilityLabel="사진 추가로 돌아가기" onPress={()=>setSaved(false)} hitSlop={6} style={s.backButton}><Icon name="chevronLeft" size={14}/><Text style={s.backText}>뒤로</Text></Pressable>}
      </ToolPanelHeader>
      {!saved?<View style={[toolPanelStyles.content,s.sources]}>
        <SourceOption label="새 사진 추가" forward onPress={onDevice}/>
        <SourceOption label="최근 추가한 사진" forward disabled={diary?.source!=='member-api'} onPress={()=>{setSaved(true);load()}}/>
        {diary?.source!=='member-api'&&<Text style={s.muted}>로그인한 서버 다이어리에서 올린 사진을 사용할 수 있어요.</Text>}
      </View>:<>
        {error&&<View accessibilityRole="alert" style={s.notice}><Text style={s.error}>{error}</Text><SourceOption label="다시 불러오기" disabled={busy} onPress={()=>load()}/></View>}
        {busy&&<ActivityIndicator style={s.loading} accessibilityLabel="사진 불러오는 중" color={colors.primaryStrong}/>}
        <FlatList key={columns} numColumns={columns} style={s.list} contentContainerStyle={s.grid} columnWrapperStyle={s.gridRow}
          data={items.filter(row=>row.mediaType==='IMAGE')} keyExtractor={row=>row.mediaFileId} initialNumToRender={6} windowSize={3}
          renderItem={({item})=><PhotoRow row={item} api={api} busy={busy} onSelect={choose} columns={columns}/>}
          ListEmptyComponent={loaded&&!busy?<View style={s.empty}><AppIcon name="image" size={36} color={colors.textMuted}/><Text style={s.emptyText}>{cursor?'아직 사진이 없어요':'올린 사진이 없어요'}</Text><Text style={s.muted}>{cursor?'더 불러와서 사진을 찾아보세요.':'기기에서 사진을 선택해 먼저 넣어보세요.'}</Text></View>:null}
          ListFooterComponent={cursor?<SourceOption label="더 불러오기" disabled={busy} onPress={()=>load(true)}/>:null}/>
      </>}
  </View>
}

function SourceOption({label,forward=false,disabled=false,onPress}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.source,disabled&&s.disabled]}>
    <Text style={s.sourceTitle}>{label}</Text>
    {forward&&<Icon name="chevronRight" size={14} color={colors.textMuted}/>}
  </Pressable>
}

const s=StyleSheet.create({
  galleryCard:{height:480,maxHeight:'100%'},
  sheetCard:{flex:1,height:'100%',minHeight:0},
  backButton:{height:32,flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8},backText:{fontSize:12,fontWeight:'600',color:colors.textMuted},
  sources:{paddingTop:10},source:{minHeight:44,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:colors.cardBorder,borderRadius:radius.md},
  sourceTitle:{flex:1,fontSize:12.5,fontWeight:'600',color:colors.text},
  list:{flex:1},grid:{paddingHorizontal:16,paddingTop:10,paddingBottom:12,gap:12},gridRow:{gap:10},tile:{flex:1,gap:6,minWidth:0},
  thumbnail:{aspectRatio:1,width:'100%',backgroundColor:colors.surfaceSoft,borderRadius:radius.sm,overflow:'hidden',alignItems:'center',justifyContent:'center'},image:{width:'100%',height:'100%'},
  placeholder:{alignItems:'center',gap:8},placeholderText:{fontSize:12,color:colors.textMuted},
  name:{fontSize:12,color:colors.text},muted:{fontSize:12,color:colors.textMuted,lineHeight:18},
  notice:{paddingHorizontal:16,paddingVertical:10,gap:8},error:{fontSize:12,color:colors.danger},loading:{marginVertical:10},disabled:{opacity:DISABLED_OPACITY},
  badge:{position:'absolute',bottom:6,left:6,paddingHorizontal:6,paddingVertical:2,borderRadius:radius.sm,backgroundColor:colors.surface},badgeText:{fontSize:10,fontWeight:'700',color:colors.text},
  empty:{paddingVertical:32,alignItems:'center',gap:10},emptyText:{fontSize:13,fontWeight:'700',color:colors.text},
})
