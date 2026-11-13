import React, { useEffect, useState } from 'react'
import { registerRootComponent } from 'expo'
import { Text, View } from 'react-native'
import ObjectContent from '../../src/editor/components/canvas/ObjectView'
import PageImageSurface from '../../src/editor/components/PageImageSurface'
import { KeepFont } from '../../src/shared/fontScope'
import { createExportSnapshot, prepareExportSnapshot } from '../../src/editor/utils/pageExport'

const title = new URL(globalThis.location.href).searchParams.get('title') ?? '기념일'
const object = {id:'stamp',type:'sticker',x:16,y:16,w:168,h:168,rotation:0,widget:{kind:'dday',style:'stamp',title,date:'2026-12-01'}}
globalThis.__stampQA = {png:null,error:null}
function App() {
  const [job, setJob] = useState(null)
  useEffect(() => {
    let active = true
    const snapshot = createExportSnapshot({id:'page',canvasWidth:200,canvasHeight:200,paper:'plain',paperAppearance:{backgroundColor:'#FFFFFF'},objects:[object]})
    prepareExportSnapshot(snapshot, () => { throw Error('Unexpected media request') }).then(prepared => {
      if(!active) { prepared.dispose(); return }
      setJob({snapshot:prepared,signal:new AbortController().signal,onCaptureStart() {},
        async resolve(result) {
          try {
            globalThis.__stampQA.png = await new Promise((resolve,reject) => { const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(result.blob) })
          } catch(error) { globalThis.__stampQA.error=error.message }
          finally { result.dispose();prepared.dispose() }
        },reject(error) { globalThis.__stampQA.error=error.message },
      })
    }).catch(error => { globalThis.__stampQA.error=error.message })
    return () => { active=false }
  }, [])
  return <View style={{padding:12,gap:12}}>
    {[0.1,0.25,0.4,0.5,1,2].map(zoom => <View key={zoom}>
      <Text>zoom {zoom}</Text>
      <View testID={`edit-${zoom}`} style={{width:200*zoom,height:200*zoom,backgroundColor:'#FFFFFF',overflow:'hidden'}}>
        <View testID={`stamp-${zoom}`} style={{position:'absolute',left:16*zoom,top:16*zoom,width:168*zoom,height:168*zoom}}>
          <KeepFont><ObjectContent object={object} zoom={zoom}/></KeepFont>
        </View>
      </View>
    </View>)}
    <View style={{width:200,height:200}}>{job&&<PageImageSurface job={job}/>}</View>
  </View>
}
registerRootComponent(App)
