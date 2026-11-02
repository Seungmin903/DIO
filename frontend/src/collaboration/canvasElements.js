// File bytes and device URIs stay out of canvas JSON; only existing media IDs are shared.
const copy=value=>JSON.parse(JSON.stringify(value))
export const isUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const uuid=isUuid
export const sharedTypes=new Set(['text','sticker','stroke','shape','tape','photo'])
const image=value=>!value?.src||uuid(value.mediaFileId)&&value.src===`media:${value.mediaFileId}`
export const sharedObject=object=>sharedTypes.has(object?.type)&&!object.collaborationMediaId&&image(object)&&(!object.mediaFileId||uuid(object.mediaFileId))&&(!object.cells||Array.isArray(object.cells)&&object.cells.every(cell=>!cell||typeof cell==='object'&&!Array.isArray(cell)&&image(cell)&&(!cell.mediaFileId||uuid(cell.mediaFileId))))
export const sharedElement=element=>sharedTypes.has(element?.elementType?.toLowerCase())&&(!element.mediaFileId||uuid(element.mediaFileId))&&!element.propertiesJson?.src&&(!element.propertiesJson?.cells||Array.isArray(element.propertiesJson.cells)&&element.propertiesJson.cells.every(cell=>!cell||typeof cell==='object'&&!Array.isArray(cell)&&!cell.src&&(!cell.mediaFileId||uuid(cell.mediaFileId))))
const cleanCell=cell=>{if(!cell)return cell;const {src,poster,...properties}=cell;return properties}
export function encodeElement(object){
 const {id,type,x,y,w,h,rotation=0,opacity=1,locked=false,hidden=false,collaborationMediaId,collaborationSourceId,poster,src,mediaFileId,...properties}=object
 if(!uuid(id)||!sharedObject(object)||![x,y,w,h,rotation,opacity].every(Number.isFinite)||w<=0||h<=0)throw Error('공유할 요소의 크기와 내용을 확인해 주세요.')
 if(properties.cells)properties.cells=properties.cells.map(cleanCell)
 const round=n=>Math.round(n*1000)/1000
 return {elementId:id,elementType:type.toUpperCase(),x:round(x),y:round(y),width:Math.max(.001,round(w)),height:Math.max(.001,round(h)),rotation:round(rotation),opacity:round(opacity),isLocked:locked,isHidden:hidden,...(mediaFileId?{mediaFileId}:{}),propertiesJson:copy(properties)}
}
export function decodeElement(element){
 const type=element.elementType?.toLowerCase()
 if(!uuid(element.elementId)||!sharedElement(element)||![element.x,element.y,element.width,element.height,element.version].every(Number.isFinite)||!Number.isSafeInteger(element.version)||element.version<0||element.width<=0||element.height<=0||!element.propertiesJson||typeof element.propertiesJson!=='object'||Array.isArray(element.propertiesJson))throw Error('서버의 캔버스 요소를 확인하지 못했어요.')
 const properties=copy(element.propertiesJson)
 if(properties.cells)properties.cells=properties.cells.map(cell=>cell?.mediaFileId?{...cell,src:`media:${cell.mediaFileId}`}:cell)
 return {...properties,...(element.mediaFileId?{mediaFileId:element.mediaFileId,src:`media:${element.mediaFileId}`}:{ }),id:element.elementId,type,x:element.x,y:element.y,w:element.width,h:element.height,rotation:element.rotation??0,opacity:element.opacity??1,locked:element.isLocked??false,hidden:element.isHidden??false}
}
