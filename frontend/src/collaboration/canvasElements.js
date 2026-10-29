// All shared element content lives in the existing canvas element JSON snapshot.
const copy=value=>JSON.parse(JSON.stringify(value))
export const sharedTypes=new Set(['text','sticker','stroke','shape','tape'])
export const sharedObject=object=>sharedTypes.has(object?.type)&&!object.mediaFileId&&!object.src&&!object.collaborationMediaId
export const sharedElement=element=>sharedTypes.has(element?.elementType?.toLowerCase())&&!element.mediaFileId&&!element.propertiesJson?.mediaFileId&&!element.propertiesJson?.src
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export function encodeElement(object){
 const {id,type,x,y,w,h,rotation=0,opacity=1,locked=false,hidden=false,collaborationMediaId,collaborationSourceId,poster,...properties}=object
 if(!uuid(id)||!sharedTypes.has(type)||![x,y,w,h,rotation,opacity].every(Number.isFinite)||w<=0||h<=0)throw Error('공유할 요소의 크기와 내용을 확인해 주세요.')
 if(!sharedObject(object))throw Error('이미지 파일 공유는 에셋 API 연결 후 사용할 수 있어요.')
 const round=n=>Math.round(n*1000)/1000
 return {elementId:id,elementType:type.toUpperCase(),x:round(x),y:round(y),width:Math.max(.001,round(w)),height:Math.max(.001,round(h)),rotation:round(rotation),opacity:round(opacity),isLocked:locked,isHidden:hidden,propertiesJson:copy(properties)}
}
export function decodeElement(element){
 const type=element.elementType?.toLowerCase()
 if(!uuid(element.elementId)||!sharedTypes.has(type)||![element.x,element.y,element.width,element.height,element.version].every(Number.isFinite)||!Number.isSafeInteger(element.version)||element.version<0||element.width<=0||element.height<=0||!element.propertiesJson||typeof element.propertiesJson!=='object'||Array.isArray(element.propertiesJson))throw Error('서버의 캔버스 요소를 확인하지 못했어요.')
 return {...copy(element.propertiesJson),id:element.elementId,type,x:element.x,y:element.y,w:element.width,h:element.height,rotation:element.rotation??0,opacity:element.opacity??1,locked:element.isLocked??false,hidden:element.isHidden??false}
}
