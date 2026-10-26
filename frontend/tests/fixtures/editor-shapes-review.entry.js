// 앱 저장소와 분리된 도형 회귀 검증 화면.
import {useEffect,useRef,useState} from 'react'
import {registerRootComponent} from 'expo'
import {View} from 'react-native'
import ShapeSettings from '../../src/editor/components/ShapeSettings'
import MorePanel from '../../src/editor/components/panels/MorePanel'
import ShapeContent from '../../src/editor/components/canvas/ShapeContent'
import ShapeTextEditor from '../../src/editor/components/ShapeTextEditor'
import TextSettings from '../../src/editor/components/TextSettings'
import {createShape,shapeTextSettings,shapeTextFormatPatch,EDITOR_SHAPES} from '../../src/editor/utils/editorShapes'
function Fixture(){
 const [state,setState]=useState({mode:'insert',object:{...createShape({shape:'star'},{x:110,y:110}),text:'안녕 도형 ABC'}})
 const boundary=useRef(null)
 useEffect(()=>{window.__setShapeReview=patch=>setState(current=>({...current,...patch}));window.__reviewShapes=EDITOR_SHAPES},[])
 useEffect(()=>{window.__shapeReviewState=state},[state])
 const change=patch=>setState(current=>({...current,object:{...current.object,...patch}}))
 return <View style={{padding:20,flexDirection:'row',flexWrap:'wrap',gap:30,backgroundColor:'#CED9EE',minHeight:'100%'}}>
  <View style={{maxHeight:700,maxWidth:'100%'}}>
   {state.mode==='insert'&&<ShapeSettings settings={state.object} onChange={change} onAdd={()=>{}} onClose={()=>{}}/>}
   {state.mode==='options'&&<MorePanel objects={[state.object]} dispatch={action=>{if(action.patches?.[state.object.id])change(action.patches[state.object.id])}} onClose={()=>{}}/>}
   {state.mode==='format'&&<TextSettings verticalAlignment settings={shapeTextSettings(state.object)} onChange={patch=>change(shapeTextFormatPatch(state.object,patch))} onClose={()=>{}}/>}
  </View>
  <View testID="shape-stage" style={{width:500,height:700,position:'relative',backgroundColor:'#FFFFFF'}}>
   <View testID="shape-sample" style={{position:'absolute',left:100,top:130,width:state.object.w,height:state.object.h}}><ShapeContent object={state.object}/></View>
   {state.mode==='edit'&&<ShapeTextEditor object={{...state.object,x:100,y:130}} zoom={1} visibleTop={0} boundary={boundary} onSave={(text,colorRanges,styleRanges)=>setState(current=>({...current,mode:'sample',object:{...current.object,text,colorRanges,styleRanges}}))}/>}
  </View>
 </View>
}
registerRootComponent(Fixture)
