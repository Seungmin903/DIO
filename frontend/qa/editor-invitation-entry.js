// 독립 브라우저 QA 진입점. 일반 App에서는 import하지 않는다.
import React, {useCallback,useRef,useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {registerRootComponent} from 'expo';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import EditorScreen from '../src/editor/screens/EditorScreen';
import {createDefaultDoc} from '../src/editor/state/defaultDoc';
import {rememberEditorDoc,editorDocKey} from '../src/editor/services/editorDocs';
const diary={id:'qa-invitation-guard',title:'이탈 보호 테스트',color:'#9DABD8',format:'free'};
rememberEditorDoc(editorDocKey(diary),createDefaultDoc(diary));
function App(){
 const guard=useRef(null);const [result,setResult]=useState('대기');
 const register=useCallback(fn=>{guard.current=fn;return()=>{if(guard.current===fn)guard.current=null;}},[]);
 return <SafeAreaProvider><View style={{flex:1}}><Pressable accessibilityRole="button" accessibilityLabel="초대 다이어리 이동 검사" onPress={()=>setResult(guard.current?.()?'이동 허용':'이동 차단')} style={{padding:16}}><Text>초대 다이어리 이동 검사</Text></Pressable><Text testID="guard-result">{result}</Text><EditorScreen diary={diary} registerInvitationLeaveGuard={register}/></View></SafeAreaProvider>;
}
registerRootComponent(App);
