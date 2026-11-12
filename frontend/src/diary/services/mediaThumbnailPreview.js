// One visible row owns one lease. Old image events and late requests cannot change a replacement row.
export function createMediaThumbnailPreview({api,row,onChange}) {
  let alive=true,started=false,loading=false,retried=false,attempt=0,currentUri=null,release
  const publish=(uri,failed)=>{
    if(!alive)return
    const version=attempt
    onChange({uri,failed,attempt:version,owner:api,mediaFileId:row.mediaFileId,onError:()=>fail(version,uri)})
  }
  const read=async(retry=false,failedUri)=>{
    loading=true;currentUri=null;publish(null,false)
    try{
      const uri=await (retry&&api.retryThumbnail?api.retryThumbnail(row,failedUri):api.previewThumbnail(row))
      if(alive){currentUri=uri;publish(uri,false)}
    }catch{publish(null,true)}finally{loading=false}
  }
  const fail=(version,uri)=>{
    if(!alive||loading||version!==attempt||!uri||uri!==currentUri)return
    currentUri=null
    if(!retried){retried=true;attempt++;return read(true,uri)}
    publish(null,true)
    // Only a second actual image-render failure invalidates persisted bytes, never a network error.
    return Promise.resolve().then(()=>{if(alive)return api.invalidateThumbnail?.(row,uri)}).catch(()=>{})
  }
  return {
    start(){
      if(started||!alive)return
      started=true
      try{release=api.retainThumbnail?.(row)}catch{publish(null,true);return}
      return read()
    },
    dispose(){if(!alive)return;alive=false;release?.();release=null},
  }
}
