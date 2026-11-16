import React,{useState} from 'react'
import {registerRootComponent} from 'expo'
import {Image,Text,View} from 'react-native'
import {SafeAreaProvider} from 'react-native-safe-area-context'
import {ProfileCropper} from '../../src/auth/ProfileCropHost'
const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800
const context=canvas.getContext('2d'),pixels=context.createImageData(1200,800)
for(let y=0;y<800;y++)for(let x=0;x<1200;x++){const i=(y*1200+x)*4;pixels.data[i]=Math.round(x/1200*255);pixels.data[i+1]=Math.round(y/800*255);pixels.data[i+2]=80;pixels.data[i+3]=255}
context.putImageData(pixels,0,0)
const asset={uri:canvas.toDataURL('image/png')}
globalThis.__profileQA={source:asset.uri,result:null}
function App(){
 const [result,setResult]=useState(null)
 return <SafeAreaProvider initialMetrics={{frame:{x:0,y:0,width:window.innerWidth,height:window.innerHeight},insets:{top:0,bottom:0,left:0,right:0}}}>
 <View style={{flex:1}}>{result?<><Text>저장 완료</Text><Image testID="saved-profile" source={{uri:result}} style={{width:200,height:200}} /></>:<ProfileCropper asset={asset} onDone={uri=>{globalThis.__profileQA.result=uri;setResult(uri)}}/>}</View>
 </SafeAreaProvider>
}
registerRootComponent(App)
