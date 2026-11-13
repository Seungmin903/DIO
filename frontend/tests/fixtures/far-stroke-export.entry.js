import React, { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import PageImageSurface from '../../src/editor/components/PageImageSurface'
import { createExportSnapshot, prepareExportSnapshot } from '../../src/editor/utils/pageExport'
import { createStroke } from '../../src/editor/utils/strokes'
import { boundedStraightEnd } from '../../src/editor/utils/strokeAssist'
const width=128,height=96,start={x:64,y:48,pressure:1}
const cases=[{name:'legacy-left',end:{x:-1e6,y:48}},{name:'legacy-right',end:{x:1e6,y:48}},{name:'legacy-top',end:{x:64,y:-1e6}},{name:'bounded-diagonal',end:{x:1e12,y:1e12},bounded:true}]
const index=Number(new URL(globalThis.location.href).searchParams.get('case')||0)
globalThis.__farStrokeExports={results:[],error:null,phase:'initial'}
function App(){
 const[job,setJob]=useState(null)
 useEffect(()=>{
  let active=true
  const item=cases[index],tip={...item.end,pressure:1}
  const end=item.bounded?boundedStraightEnd(start,tip,width,height):tip
  const object=createStroke([start,end],{id:'far-stroke',kind:'ball',width:4,color:'#000000'})
  const snapshot=createExportSnapshot({id:'page',canvasWidth:width,canvasHeight:height,paper:'plain',objects:[object]},{scale:2})
  globalThis.__farStrokeExports.phase='preparing'
  prepareExportSnapshot(snapshot,()=>{throw Error('Unexpected image fetch')}).then(prepared=>{
   if(!active)return
   globalThis.__farStrokeExports.phase='rendering'
   setJob({snapshot:prepared,signal:new AbortController().signal,onCaptureStart(){globalThis.__farStrokeExports.phase='capturing'},
    async resolve(result){try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(result.blob)});globalThis.__farStrokeExports.results.push({name:item.name,png:data,width:result.width,height:result.height});globalThis.__farStrokeExports.phase='done';result.dispose();prepared.dispose()}catch(error){globalThis.__farStrokeExports.error=error.message}},
    reject(error){globalThis.__farStrokeExports.error=error.message},
   })
  }).catch(error=>{globalThis.__farStrokeExports.error=error.message})
  return()=>{active=false}
 },[])
 return job?<PageImageSurface job={job}/>:null
}
registerRootComponent(App)
