import { mediaId, mediaReference } from '../../editor/utils/mediaReferences.js'

const clone=value=>JSON.parse(JSON.stringify(value))
const slots=cover=>[cover.photo,...(Array.isArray(cover.stickers)?cover.stickers.filter(item=>item&&!item.asset&&!item.builtin):[])].filter(Boolean)

/** Resolve every image before saving; never share a creator's file/blob URL. */
export function createSharedCover(media) {
  return {
    async prepare(cover) {
      const result=clone(cover),items=slots(result)
      if(items.length&&!media)throw new Error('표지 사진을 공유 서버에 올릴 수 없어요. 다시 시도해 주세요.')
      if(items.length) {
        const rows=items.map(item=>{
          const id=mediaId(item)
          if(!id)throw new Error('표지 사진 원본을 확인해 주세요. 사진을 다시 선택해 주세요.')
          return {elementType:'IMAGE',mediaFileId:id}
        })
        const prepared=await media.prepare({changes:{creates:rows}})
        items.forEach((item,index)=>{item.mediaFileId=prepared.changes.creates[index].mediaFileId;item.src=mediaReference(item.mediaFileId)})
      }
      return result
    },
    hydrate(cover) {
      if(cover&&media)media.hydrate(slots(cover).map(mediaId).filter(Boolean).map(mediaFileId=>({mediaFileId}))).catch(()=>{})
      return cover
    },
  }
}
