import {registerRootComponent} from 'expo'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import {StudioContent} from '../../src/handwriting/HandwritingStudio'
import {createFontWorkflow} from '../../src/handwriting/workflow.js'
import {PROMPTS} from '../../src/handwriting/protocol.js'
const samples=Object.fromEntries(PROMPTS.map(character=>[character,{coordinateSize:1024,strokes:Array.from({length:16},(_,j)=>({width:9,points:Array.from({length:32},(_,i)=>({x:100+i*20,y:100+j*20+Math.sin(i)*20,time:i*10,pressure:.5}))}))}]))
const entry={id:'perf-font',status:'draft',name:'입력 성능 확인',draft:{schema:1,id:'perf-draft',samples,updatedAt:'2026-11-03'},createdAt:1}
window.__handwritingPerf={saves:0}
const controller=createFontWorkflow({repository:{load:async()=>[entry],save:async entries=>{window.__handwritingPerf.saves++;localStorage.setItem('fontperf.snapshot',JSON.stringify(entries));window.__handwritingPerf.draft=entries[0].draft}},engine:{capabilities:async()=>({available:false,reason:'생성 검증 대상 아님'})},uuid:()=>String(Date.now())})
controller.init()
function Fixture(){return <SafeAreaProvider><StudioContent controller={controller} options={{open:'perf-font'}} /></SafeAreaProvider>}
registerRootComponent(Fixture)
