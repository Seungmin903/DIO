import {registerRootComponent} from 'expo'
import {useState} from 'react'
import {View,Text,Pressable} from 'react-native'
import PhotoSourcePicker from '../../src/editor/components/panels/PhotoSourcePicker'
import {createMediaThumbnailCache} from '../../src/diary/services/mediaThumbnailCache.js'
import {createMediaThumbnailFiles} from '../../src/diary/services/mediaThumbnailFiles.web.js'

// Browser-only QA: real Blob/IndexedDB/cache/row lifetimes, synthetic images instead of user data.
const metrics={requests:new Set(),loads:0,retries:0,invalidations:0}
globalThis.__thumbnailScroll=metrics
const canvas=document.createElement('canvas');canvas.width=32;canvas.height=24
const paint=canvas.getContext('2d');paint.fillStyle='#745CA6';paint.fillRect(0,0,32,24)
const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),character=>character.charCodeAt(0))
const cache=createMediaThumbnailCache({files:createMediaThumbnailFiles(`scroll-qa-${Date.now()}`),active:()=>{},request:async id=>{metrics.requests.add(id);return bytes}})
const row=n=>({mediaFileId:String(n),mediaType:'IMAGE',mimeType:'image/png',fileSize:bytes.length,originalFilename:`사진 ${n}`})
const runtime={
 list:async({cursor}={})=>{const offset=Number(cursor??0);return {items:Array.from({length:30},(_,i)=>row(offset+i+1)),nextCursor:offset+30<180?String(offset+30):null}},
 retainThumbnail:item=>cache.retain(item.mediaFileId),
 previewThumbnail:async item=>{const uri=await cache.load(item.mediaFileId);metrics.loads++;return uri},
 retryThumbnail:(item,uri)=>{metrics.retries++;return cache.refresh(item.mediaFileId,uri)},
 invalidateThumbnail:(item,uri)=>{metrics.invalidations++;return cache.invalidate(item.mediaFileId,uri)},
 selectPhoto:async item=>item,
}
function App(){
 const [open,setOpen]=useState(true)
 return <View style={{flex:1,padding:12,backgroundColor:'#F8F7FD'}}>
  <Pressable accessibilityRole="button" accessibilityLabel="다시 열기" onPress={()=>setOpen(true)}><Text>다시 열기</Text></Pressable>
  {open&&<View style={{flex:1,maxWidth:540}}><PhotoSourcePicker runtime={runtime} diary={{source:'member-api',memberAccountId:'qa'}} onClose={()=>setOpen(false)} onDevice={()=>{}} onSelect={()=>{}}/></View>}
 </View>
}
registerRootComponent(App)
