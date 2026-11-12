import {registerRootComponent} from 'expo'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import {useEffect,useState} from 'react'
import {View,Text,Pressable} from 'react-native'
import {authService,apiBaseUrl} from '../../src/auth/authService'
import PhotoSourcePicker from '../../src/editor/components/panels/PhotoSourcePicker'

function App(){
 const [diary,setDiary]=useState(null),[error,setError]=useState(''),[open,setOpen]=useState(true),[selected,setSelected]=useState('')
 useEffect(()=>{
  if(!__DEV__||apiBaseUrl!=='http://127.0.0.1:18567/api/v1'){setError('Loopback thumbnail QA only');return}
  let alive=true
  authService.login({email:'thumbnail-qa@example.test',password:'DioThumbnail123!'}).then(()=>{
   if(alive)setDiary({id:'thumbnail-browser-qa',source:'member-api',memberAccountId:authService.getCurrentUserId()})
  }).catch(e=>{if(alive)setError(e.message)})
  return()=>{alive=false}
 },[])
 return <View style={{flex:1,backgroundColor:'#F8F7FD',padding:12}}>
  <Pressable accessibilityRole="button" accessibilityLabel="사진 다시 열기" onPress={()=>setOpen(true)}><Text>사진 다시 열기</Text></Pressable>
  <Text>{error||selected}</Text>
  {diary&&open&&<View style={{flex:1,maxWidth:540}}><PhotoSourcePicker diary={diary} onClose={()=>setOpen(false)} onDevice={()=>{}}
   onSelect={image=>{setSelected(`원본 선택 완료: ${image.mediaFileId}`);setOpen(false)}}/></View>}
 </View>
}
registerRootComponent(()=> <SafeAreaProvider><App/></SafeAreaProvider>)
