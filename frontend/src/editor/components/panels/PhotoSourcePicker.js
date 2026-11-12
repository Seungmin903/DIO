import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { ToolPanelHeader, toolPanelStyles } from '../ToolPanel'
import { padRows } from '../../utils/gridRows.js'
import Icon from '../controls/Icon'
import MediaImage from '../canvas/MediaImage'
import { useMediaUri } from '../../hooks/useMediaUri'
import { photoKey, useCustomDecor } from '../../hooks/useCustomDecor'
import { createMediaLibraryRuntime } from '../../../diary/services/mediaLibraryRuntime'
import { createMediaThumbnailPreview } from '../../../diary/services/mediaThumbnailPreview.js'
import { mediaLibraryError, mergeMediaPages, canSelectMediaPhoto } from '../../../diary/services/mediaLibraryApi.js'
import AppIcon from '../../../shared/AppIcon'
import { mediaTooLargeLabel } from '../../../shared/mediaLimits.js'
import { colors, radius, DISABLED_OPACITY } from '../../../shared/theme'

// 673: 마지막 줄이 모자라면 빈 칸으로 채워 모든 칸이 같은 폭 · 같은 x 에 놓이게 한다(칸마다 maxWidth 로 폭이 달라지던 것을 막는다)
const FILLER_KEY=item=>`filler-${item.__filler}`

function PhotoRow({row,api,busy,onSelect,visible}) {
  const supported=canSelectMediaPhoto(row)
  const [preview,setPreview]=useState(null)
  useEffect(()=>{
    setPreview(null)
    if(!visible||!supported)return
    const session=createMediaThumbnailPreview({api,row,onChange:setPreview})
    session.start()
    return()=>session.dispose()
  },[api,row,supported,visible])
  const current=visible&&preview?.owner===api&&preview.mediaFileId===row.mediaFileId?preview:null
  const src=current?.uri,failed=current?.failed
  return <Pressable accessibilityRole="button" accessibilityLabel={`사진 선택: ${row.originalFilename}`} accessibilityState={{disabled:busy||!supported}} disabled={busy||!supported} onPress={()=>onSelect(row)} style={[s.tile,(busy||!supported)&&s.disabled]}>
    <View style={s.thumbnail}>{src&&!failed?<MediaImage key={`${src}:${current.attempt}`} source={{uri:src}} accessibilityLabel={`사진 미리보기: ${row.originalFilename}`} resizeMode="contain" style={s.image} onError={current.onError}/>:<View style={s.placeholder}>{supported&&visible&&!failed?<ActivityIndicator size="small" color={colors.primaryStrong}/>:<AppIcon name="image" size={28} color={colors.textMuted}/>}<Text style={s.placeholderText}>{!supported?mediaTooLargeLabel(row.mimeType):failed?'미리보기 실패':'미리보기 불러오는 중'}</Text></View>}
      {row.mimeType==='image/gif'&&<View style={s.badge}><Text style={s.badgeText}>GIF</Text></View>}
    </View>
  </Pressable>
}

// 기기에 보관한 최근 사진. 파일이 없어져 보이지 않으면 고를 수 없다.
function RecentPhotoRow({photo,onSelect,columns}) {
  const src=useMediaUri(photo)
  const label=photo.name||'사진'
  return <Pressable accessibilityRole="button" accessibilityLabel={`사진 선택: ${label}`} accessibilityState={{disabled:!src}} disabled={!src} onPress={()=>onSelect(photo)} style={s.tile}>
    <View style={s.thumbnail}>{src?<MediaImage source={{uri:src}} animated={photo.extension==='gif'||/\.gif$/i.test(label)} resizeMode="contain" style={s.image}/>:<AppIcon name="image" size={28} color={colors.textMuted}/>}</View>
  </Pressable>
}

export default function PhotoSourcePicker({diary,onClose,onDevice,onSelect,onSelectRecent,runtime,sheet=null}) {
  const columns=3
  const member=diary?.source==='member-api'
  const recentPhotos=useCustomDecor().items.recentPhotos??[]
  const [api,setApi]=useState(null),[items,setItems]=useState([]),[cursor,setCursor]=useState(null)
  const ownedApis=useRef(new WeakSet())
  const [visibleIds,setVisibleIds]=useState(()=>new Set())
  const viewabilityConfig=useRef({itemVisiblePercentThreshold:1}).current
  const onViewableItemsChanged=useRef(({viewableItems})=>setVisibleIds(new Set(viewableItems.map(({item})=>item.mediaFileId).filter(Boolean)))).current
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[loaded,setLoaded]=useState(false)
  const alive=useRef(true),pending=useRef(false),current=useRef({onSelect});current.current={onSelect}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const run=async work=>{
    if(pending.current)return
    pending.current=true;setBusy(true);setError(null)
    try{await work()}catch(e){if(alive.current)setError(mediaLibraryError(e))}
    finally{pending.current=false;if(alive.current)setBusy(false)}
  }
  const load=(more=false)=>run(async()=>{
    let client=api??runtime
    if(!client){client=createMediaLibraryRuntime(diary);ownedApis.current.add(client)}
    const result=await client.list(more?{cursor}:{})
    if(!alive.current){if(ownedApis.current.has(client))client.dispose?.();return}
    setApi(client);setItems(previous=>more?mergeMediaPages(previous,result.items):result.items);setCursor(result.nextCursor);setLoaded(true)
  })
  // 회원 다이어리는 패널을 열면 바로 서버 목록을 읽는다
  useEffect(()=>{if(member)load()},[member]) // eslint-disable-line react-hooks/exhaustive-deps
  // A runtime supplied by the parent may be reused when the panel is reopened.
  useEffect(()=>()=>{if(api&&ownedApis.current.has(api))api.dispose?.()},[api])
  const choose=row=>run(async()=>{
    const image=await api.selectPhoto(row,diary)
    if(alive.current)current.current.onSelect(image)
  })
  const gridProps={numColumns:columns,style:s.list,contentContainerStyle:s.grid,columnWrapperStyle:s.gridRow,initialNumToRender:12,windowSize:3}
  const showGrid=member||recentPhotos.length>0
  return <View accessibilityLabel="사진 패널" style={[toolPanelStyles.card,showGrid&&s.galleryCard,sheet&&toolPanelStyles.sheetCard,sheet&&s.sheetCard]}>
      <ToolPanelHeader icon="image" title="사진" onClose={onClose} closeLabel="닫기" dragHandlers={sheet?.dragHandlers}/>
      <View style={[toolPanelStyles.content,s.sources]}>
        <SourceOption label="새 사진 추가" forward onPress={onDevice}/>
      </View>
      {showGrid&&<Text accessibilityRole="header" style={s.section}>최근 추가한 사진</Text>}
      {member?<>
        {error&&<View accessibilityRole="alert" style={s.notice}><Text style={s.error}>{error}</Text><SourceOption label="다시 불러오기" disabled={busy} onPress={()=>load()}/></View>}
        {busy&&<ActivityIndicator style={s.loading} accessibilityLabel="사진 불러오는 중" color={colors.primaryStrong}/>}
        <FlatList key={columns} {...gridProps} extraData={visibleIds} viewabilityConfig={viewabilityConfig} onViewableItemsChanged={onViewableItemsChanged} data={padRows(items.filter(row=>row.mediaType==='IMAGE'),columns)} keyExtractor={row=>row.__filler!==undefined?FILLER_KEY(row):row.mediaFileId}
          renderItem={({item})=>item.__filler!==undefined?<View style={s.tile}/>:<PhotoRow row={item} api={api} busy={busy} onSelect={choose} visible={visibleIds.has(item.mediaFileId)}/>}
          ListEmptyComponent={loaded&&!busy&&!error?<View style={s.empty}><AppIcon name="image" size={36} color={colors.textMuted}/><Text style={s.emptyText}>올린 사진이 없어요</Text></View>:null}
          ListFooterComponent={cursor?<SourceOption label="더 불러오기" disabled={busy} onPress={()=>load(true)}/>:null}/>
      </>:recentPhotos.length>0&&<FlatList key={columns} {...gridProps} data={padRows(recentPhotos,columns)} keyExtractor={photo=>photo.__filler!==undefined?FILLER_KEY(photo):photoKey(photo)}
        renderItem={({item})=>item.__filler!==undefined?<View style={s.tile}/>:<RecentPhotoRow photo={item} onSelect={onSelectRecent} columns={columns}/>}/>}
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
  section:{paddingHorizontal:16,paddingTop:14,fontSize:12.5,fontWeight:'700',color:colors.text},
  sources:{paddingTop:10},source:{minHeight:48,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:colors.cardBorder,borderRadius:radius.md},
  sourceTitle:{flex:1,fontSize:12.5,fontWeight:'600',color:colors.text},
  list:{flex:1},grid:{paddingHorizontal:16,paddingTop:10,paddingBottom:12,gap:6},gridRow:{gap:6},tile:{flex:1,flexBasis:0,minWidth:0},
  thumbnail:{aspectRatio:1,width:'100%',backgroundColor:colors.surfaceSoft,borderRadius:radius.sm,overflow:'hidden',alignItems:'center',justifyContent:'center'},image:{width:'100%',height:'100%'},
  placeholder:{alignItems:'center',gap:8},placeholderText:{fontSize:12,color:colors.textMuted},
  muted:{fontSize:12,color:colors.textMuted,lineHeight:18},
  notice:{paddingHorizontal:16,paddingVertical:10,gap:8},error:{fontSize:12,color:colors.danger},loading:{marginVertical:10},disabled:{opacity:DISABLED_OPACITY},
  badge:{position:'absolute',bottom:6,left:6,paddingHorizontal:6,paddingVertical:2,borderRadius:radius.sm,backgroundColor:colors.surface},badgeText:{fontSize:11,fontWeight:'700',color:colors.text},
  empty:{paddingVertical:32,alignItems:'center',gap:10},emptyText:{fontSize:13,fontWeight:'700',color:colors.text},
})
