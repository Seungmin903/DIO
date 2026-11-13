import React,{useState} from 'react'
import {registerRootComponent} from 'expo'
import {View,Text} from 'react-native'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import CoverArt from '../../src/diary/components/CoverArt'
import {newDiaryCover} from '../../src/diary/utils/coverDesign'
const scenario=new URL(globalThis.location.href).searchParams.get('scenario')
function App(){
 const[cover,setCover]=useState(()=>{const base=newDiaryCover();return {...base,band:{...base.band,on:false},plate:'none',title:{...base.title,useName:false,text:''},subtitle:{...base.subtitle,on:false},stickers:[
  {id:'a',name:'위 스티커',builtin:'heart',x:50,y:scenario==='above'?88:40,size:18,rotation:0},
  {id:'b',name:'아래 스티커',builtin:'heart',x:50,y:scenario==='above'?64:scenario==='exact'?40:55,size:22,rotation:0},
 ]}})
 const[selected,setSelected]=useState(null)
 return <SafeAreaProvider><View style={{padding:40,width:380}}><View testID="cover" style={{width:300,height:400}}><CoverArt cover={cover} name="겹침 검증" width={300} height={400} edit={{onChange:setCover,onSelectSticker:setSelected}}/></View><Text testID="state">{JSON.stringify({stickers:cover.stickers,selected})}</Text></View></SafeAreaProvider>
}
registerRootComponent(App)

