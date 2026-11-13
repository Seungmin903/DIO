import React, { useState } from 'react'
import { registerRootComponent } from 'expo'
import { Text, View } from 'react-native'
import TopBar from '../../src/editor/components/chrome/TopBar'
import { renameEditorDiary } from '../../src/diary/services/renameEditorDiary'
function App() {
 const [active,setActive]=useState({id:'diary',title:'기존 이름'})
 const [calls,setCalls]=useState(0), [notice,setNotice]=useState('')
 return <View><TopBar compact doc={active} exportEnabled={false} onRename={title => renameEditorDiary({diaryId:active.id,title,setActive,notify:(heading,message)=>setNotice(heading+': '+message),renameDiary:async()=>{setCalls(n=>n+1); await new Promise(resolve=>setTimeout(resolve,100)); if(globalThis.location.search.includes('fail')) throw new Error('저장 실패'); return {title}}})}/><Text testID="calls">{calls}</Text><Text testID="saved">{active.title}</Text><Text testID="notice">{notice}</Text></View>
}
registerRootComponent(App)
