import {registerRootComponent} from 'expo'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import {useState} from 'react'
import {useWindowDimensions} from 'react-native'
import PhoneSheet from '../../src/editor/components/chrome/PhoneSheet'
import EditorScreen from '../../src/editor/screens/EditorScreen'
import {createDefaultDoc} from '../../src/editor/state/defaultDoc'
import {editorDocKey,rememberEditorDoc} from '../../src/editor/services/editorDocs'
import {View,Text} from 'react-native'
import PhotoSourcePicker from '../../src/editor/components/panels/PhotoSourcePicker'
import DioButton from '../../src/shared/DioButton'
const row=n=>({mediaFileId:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,mediaType:n===2?'DOCUMENT':'IMAGE',originalFilename:`사진 ${n}`,mimeType:'image/png',fileSize:n===4?6*1024*1024:1024})
const runtime={list:async({cursor}={})=>({items:cursor?[row(3)]:[row(1),row(2),row(4)],nextCursor:cursor?null:'next'}),previewCached:async()=>false,selectPhoto:async row=>row}
const editorDiary={id:'photo-panel-layout-qa',title:'사진 패널 배치',firstPage:'blank'}
rememberEditorDoc(editorDocKey(editorDiary),createDefaultDoc(editorDiary))
function App(){
 const [open,setOpen]=useState(true),[result,setResult]=useState(''),{width,height}=useWindowDimensions()
 const compact=Math.min(width,height)<600,portrait=height>width
 if(new URLSearchParams(location.search).has('editor'))return <View style={{flex:1}}><EditorScreen diary={editorDiary} compact={compact} landscape={!portrait}/></View>
 const panel=sheet=><PhotoSourcePicker sheet={sheet} runtime={runtime} diary={{source:'member-api',memberAccountId:'1'}} onClose={()=>setOpen(false)} onDevice={()=>{setOpen(false);setResult('기기 선택됨')}} onSelect={row=>{setOpen(false);setResult(`${row.originalFilename} 선택됨`)}}/>
 return <View style={{flex:1}}><DioButton label="사진 열기" onPress={()=>setOpen(true)}/><Text>{result}</Text>{open&&(compact&&portrait?<PhoneSheet fixedHeight onClose={()=>setOpen(false)}>{panel}</PhoneSheet>:<View style={{position:'absolute',top:64,left:8,right:8,bottom:60,alignItems:'center'}}>{panel(null)}</View>)}</View>
}
registerRootComponent(()=> <SafeAreaProvider><App/></SafeAreaProvider>)
