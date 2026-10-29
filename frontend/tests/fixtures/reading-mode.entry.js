import { registerRootComponent } from 'expo'
import { useMemo } from 'react'
import { View, useWindowDimensions } from 'react-native'
import EditorScreen from '../../src/editor/screens/EditorScreen'
import { createDefaultDoc } from '../../src/editor/state/defaultDoc'
import { editorDocKey, rememberEditorDoc } from '../../src/editor/services/editorDocs'
import { createText } from '../../src/editor/utils/text'

const diary = {id:'reading-mode-qa',title:'읽기 모드 검증',color:'#6E92C6'}
const doc = createDefaultDoc(diary)
doc.pages = [0,1,2,3,4].map(i => ({...doc.pages[0],id:`reader-page-${i}`,objects:[createText({id:`reader-text-${i}`,x:180,y:140,width:700,text:`${i+1}번째 페이지`})]}))
doc.pages[0].objects.push(createText({id:'reader-link',x:300,y:320,width:300,text:'읽기 링크',styleRanges:[{start:0,end:5,href:'https://example.com'}]}))
rememberEditorDoc(editorDocKey(diary),doc)
function Fixture() {
  const {width,height} = useWindowDimensions()
  const controller = useMemo(() => ({onCommit(value) { window.__readerState = {...value,docJSON:JSON.stringify(value.doc)} }}),[])
  return <View style={{flex:1}}><EditorScreen diary={diary} compact={Math.min(width,height)<600} landscape={width>height} readOnly={window.location.search.includes('readonly')} qaController={controller} onHome={()=>{window.__readerHome=true}} /></View>
}
registerRootComponent(Fixture)
