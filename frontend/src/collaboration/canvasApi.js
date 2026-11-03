import {encodeElement,decodeElement,sharedObject,sharedElement} from './canvasElements.js'
import {assertCanvasBatchLimits} from './canvasBatchLimits.js'
export {sharedObject} from './canvasElements.js'
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const fail=()=>{throw new Error('공동 편집 응답을 확인하지 못했어요.')}
const rows=value=>{
  if(!Array.isArray(value))fail()
  const result=value.filter(sharedElement);result.forEach(decodeElement)
  if(new Set(result.map(e=>e.elementId)).size!==result.length)fail()
  // Preserve ordering bounds for unsupported elements such as audio as well.
  Object.defineProperty(result,'sortKeys',{value:value.map(e=>Number(e.sortKey)).filter(Number.isFinite)})
  return result
}
export function createCanvasApi(transport,media){
  const path=id=>{if(!uuid(id))fail();return `/pages/${encodeURIComponent(id)}`}
  const hydrate=items=>{media?.hydrate(items).catch(()=>{})}
  const response=async body=>{if(!body||typeof body.operationId!=='string'||!/^\d+$/.test(body.operationId)||!Number.isSafeInteger(body.revision))fail();const items=rows(body.items);hydrate(items);return {...body,items}}
  return {
    prepare: media ? body=>media.prepare(body) : undefined,
    async load(pageId,diaryId){const body=await transport({path:path(pageId)});if(body?.page?.pageId!==pageId||body.page.diaryId!==diaryId)fail();const result=rows(body.elements);hydrate(result);return result},
    async apply(pageId,body){assertCanvasBatchLimits(body.changes,body.expectedVersions);const result=await response(await transport({method:'POST',path:`${path(pageId)}/canvas-operations`,body}));return result},
    async control(pageId,direction,body){if(!['undo','redo'].includes(direction))fail();const result=await response(await transport({method:'POST',path:`${path(pageId)}/${direction}`,body}));return result},
    async history(pageId){const body=await transport({path:`${path(pageId)}/history/me`});if(!Array.isArray(body?.items))fail();
      for(const value of [body.nextUndo,body.nextRedo])if(value!=null&&(typeof value.operationId!=='string'||!/^\d+$/.test(value.operationId)||!Number.isSafeInteger(value.revision)))fail();return body},
  }
}
export const canvasContent=objects=>objects.filter(sharedObject).map(encodeElement)
export const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)
export const sameElements=(a,b)=>stable(canvasContent(a))===stable(canvasContent(b))
export const canvasConflict=()=>Object.assign(new Error('다른 변경과 겹쳐 자동으로 덮어쓰지 않았어요. 기기 내용은 유지돼요.'),{status:409,code:'CANVAS_HISTORY_CONFLICT'})
export function canvasDelta(before,after){
  const old=new Map(canvasContent(before).map(o=>[o.elementId,o])),next=new Map(canvasContent(after).map(o=>[o.elementId,o]))
  const commonOld=[...old.keys()].filter(id=>next.has(id)),commonNext=[...next.keys()].filter(id=>old.has(id))
  const reordered=stable(commonOld)!==stable(commonNext)
  return {old,next,reordered,touched:[...new Set([...old.keys(),...next.keys()])].filter(id=>!old.has(id)||!next.has(id)||stable(old.get(id))!==stable(next.get(id))||reordered)}
}

// Apply remote results without discarding edits made while the request was in flight.
export function reconcileCanvasObjects(expected,current,incoming){
 const before=new Map(expected.filter(sharedObject).map(o=>[o.id,o]))
 const local=new Map(current.filter(sharedObject).map(o=>[o.id,o]))
 const remote=new Map(incoming.filter(sharedObject).map(o=>[o.id,o]))
 for(const [id,old] of before){
  const next=local.get(id)
  if(!next){remote.delete(id);continue}
  if(sameElements([old],[next]))continue
  const merged={...(remote.get(id)??next)}
  for(const key of new Set([...Object.keys(old),...Object.keys(next)])){
   if(stable(old[key])===stable(next[key]))continue
   if(key in next)merged[key]=next[key];else delete merged[key]
  }
  remote.set(id,merged)
 }
 for(const [id,object] of local)if(!before.has(id))remote.set(id,object)
 return [...remote.values()]
}
