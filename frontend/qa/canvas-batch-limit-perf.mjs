import {performance} from 'node:perf_hooks'
import {collaborationReducer} from '../src/collaboration/collaborationReducer.js'
import {createInitialState,editorReducer} from '../src/editor/state/editorReducer.js'
const pageId='10000000-0000-4000-8000-000000000001'
const all=Array.from({length:1000},(_,i)=>({id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,type:'text',text:'A'.repeat(64),x:i,y:2,w:40,h:20}))
const reduce=(s,a)=>collaborationReducer(editorReducer,s,{collaborationId:'bench',...a})
for(const size of [1,101]){
 const measurements=[]
 for(let run=0;run<4;run++){
  let state=reduce(createInitialState({pages:[{id:pageId,objects:all}]}),{type:'checkpoint'})
  const started=performance.now()
  for(let frame=0;frame<100;frame++)state=reduce(state,{type:'updateMany',patches:Object.fromEntries(all.slice(0,size).map(o=>[o.id,{x:o.x+frame+1,y:5}]))})
  const elapsed=performance.now()-started
  if(run)measurements.push(elapsed/100)
 }
 console.log(JSON.stringify({elements:1000,selected:size,events:100,runs:3,medianMsPerEvent:measurements.sort((a,b)=>a-b)[1]}))
}
