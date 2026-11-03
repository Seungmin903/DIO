import { registerRootComponent } from 'expo'
import { useMemo } from 'react'
import { View } from 'react-native'
import EditorScreen from '../../src/editor/screens/EditorScreen'
import { createDefaultDoc } from '../../src/editor/state/defaultDoc'
import { editorDocKey, rememberEditorDoc } from '../../src/editor/services/editorDocs'
import { createStroke } from '../../src/editor/utils/strokes'
import { ReadingPreviewEnabled } from '../../src/editor/components/canvas/ReadingPreviewContext'

const diary = {id:'render-lag-qa',title:'필기 많은 페이지',color:'#6E92C6'}
const doc = createDefaultDoc(diary)
const count = Number(new URLSearchParams(location.search).get('count') || 500)
doc.pages = Array.from({length:5},(_,pageIndex)=>({...doc.pages[0],id:'heavy-'+pageIndex,objects:Array.from({length:count},(_,i)=>createStroke([
 {x:60+(i%25)*40,y:100+Math.floor(i/25)*24,pressure:.9},
 {x:75+(i%25)*40,y:112+Math.floor(i/25)*24,pressure:1.1},
 {x:89+(i%25)*40,y:101+Math.floor(i/25)*24,pressure:.95},
],{id:`p${pageIndex}-s${i}`,kind:i%3===0?'highlighter':'fountain',width:2,color:['#18224D','#A52252','#155D90'][pageIndex%3]}))}))
rememberEditorDoc(editorDocKey(diary),doc)
function Fixture(){
 const controller=useMemo(()=>({onCommit(value){window.__heavyReader=value}}),[])
 return <ReadingPreviewEnabled.Provider value={!location.search.includes('vectors=1')}><View style={{flex:1}}><EditorScreen diary={diary} readOnly={!location.search.includes('editing=1')} qaController={controller} /></View></ReadingPreviewEnabled.Provider>
}
registerRootComponent(Fixture)
