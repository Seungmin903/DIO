import {sameElements,sharedObject,reconcileCanvasObjects} from './canvasApi.js'
// Member canvas history is sent as completed actions. Local-only documents keep their existing reducer.
const elements = (doc, pageId) => (doc.pages.find(p => p.id === pageId)?.objects ?? []).filter(sharedObject)
const same = (a,b) => sameElements(a,b)
export function mergeElements(objects, incoming) {
  incoming=incoming.filter(sharedObject)
  let index=0
  const merged=objects.flatMap(o=>sharedObject(o)?(index<incoming.length?[incoming[index++]]:[]):[o])
  return [...merged,...incoming.slice(index)]
}
const preserveElements = (target, source) => ({...target,pages:target.pages.map(p=>source.pages.some(s=>s.id===p.id)?{...p,objects:mergeElements(p.objects,elements(source,p.id))}:p)})
export function collaborationReducer(reduce,state,action) {
  const meta=state.collaborationPast ?? state.past.map(()=>({pageId:state.pageId,hasCanvas:false}))
  const future=state.collaborationFuture ?? state.future.map(()=>({pageId:state.pageId,hasCanvas:false}))
  let current={...state,collaborationPast:meta,collaborationFuture:future,collaborationEdits:state.collaborationEdits??[]}
  const intent=(before,after,id,pageId)=>same(before,after)?[]:[{id,pageId,before,after}]
  const finish=() => {
    const gesture=current.collaborationGesture
    if(!gesture)return
    const after=elements(current.doc,gesture.pageId),changed=!same(gesture.before,after)
    current={...current,pendingCheckpoint:null,collaborationGesture:null,
      collaborationEdits:[...current.collaborationEdits,...intent(gesture.before,after,gesture.id,gesture.pageId)],
      collaborationPast:current.collaborationPast.map((m,i)=>i===current.collaborationPast.length-1?{pageId:gesture.pageId,hasCanvas:changed,clientOperationId:gesture.id}:m)}
  }
  // Shared reset has no atomic server operation; never invent local-only pages.
  if(action.type==='resetDiary')return current
  if(action.type==='importServerPages'){finish();return reduce(current,action)}
  if(action.type==='reconcileServerPages')return reduce(current,action)
  if(action.type==='collaborationAck')return {...current,collaborationEdits:current.collaborationEdits.filter(e=>!action.ids.includes(e.id))}
  if(action.type==='commitCheckpoint'){finish();return current}
  if(action.type==='importCollaborationElements'||action.type==='collaborationHistoryApplied'){
    const page=current.doc.pages.find(p=>p.id===action.pageId)
    if(!page)return current
    const matches=action.expectedElements?sameElements(page.objects,action.expectedElements):page.objects===action.expectedObjects
    if(!matches){
      if(action.type!=='importCollaborationElements'||!action.expectedElements)return current
      action={...action,objects:reconcileCanvasObjects(action.expectedElements,page.objects,action.objects)}
    }
    if(action.type==='importCollaborationElements'&&sameElements(page.objects,action.objects))return current
    let next=current
    const gesture=current.collaborationGesture
    if(gesture?.pageId===action.pageId){
      const currentById=new Map(page.objects.map(o=>[o.id,o])),incomingById=new Map(action.objects.map(o=>[o.id,o]))
      const before=gesture.before.flatMap(o=>sameElements([o],currentById.has(o.id)?[currentById.get(o.id)]:[])?(incomingById.has(o.id)?[incomingById.get(o.id)]:[]):[o])
      const previousIds=new Set(gesture.before.map(o=>o.id))
      before.push(...action.objects.filter(o=>!previousIds.has(o.id)&&!currentById.has(o.id)))
      next={...next,collaborationGesture:{...gesture,before}}
    }
    if(action.type==='collaborationHistoryApplied'){
      const undo=action.direction==='undo',entry=undo?meta.at(-1):future[0]
      if(entry?.hasCanvas&&entry.pageId===action.pageId&&(!action.historyClientOperationId||entry.clientOperationId===action.historyClientOperationId)){
        next=reduce(current,{type:action.direction});next={...next,doc:preserveElements(next.doc,current.doc),
          collaborationPast:undo?meta.slice(0,-1):[...meta,entry].slice(-80),
          collaborationFuture:undo?[entry,...future]:future.slice(1)}
      }
    }
    return {...next,externalDirty:true,doc:{...next.doc,pages:next.doc.pages.map(p=>p.id===action.pageId?{...p,objects:mergeElements(p.objects,action.objects)}:p)}}
  }
  if(action.type==='undo'||action.type==='redo'){
    finish()
    const past=current.collaborationPast,nextFuture=current.collaborationFuture
    const undo=action.type==='undo',entry=undo?past.at(-1):nextFuture[0]
    if(!entry||entry.hasCanvas)return current // Server history must acknowledge canvas undo before touching local state.
    const next=reduce(current,action)
    return {...next,doc:preserveElements(next.doc,current.doc),collaborationPast:undo?past.slice(0,-1):[...past,entry].slice(-80),collaborationFuture:undo?[entry,...nextFuture]:nextFuture.slice(1),collaborationGesture:null}
  }
  if(action.type==='revertToCheckpoint'&&current.collaborationGesture){
    const gesture=current.collaborationGesture,next=reduce(current,action)
    const preserved=preserveElements(next.doc,current.doc)
    const doc={...preserved,pages:preserved.pages.map(p=>p.id===gesture.pageId?{...p,objects:mergeElements(p.objects,gesture.before)}:p)}
    return {...next,doc,collaborationGesture:null,collaborationPast:gesture.past,collaborationFuture:gesture.future,collaborationEdits:current.collaborationEdits}
  }
  if(action.type==='selectPage')finish()
  let next=reduce(current,action)
  const addsHistory=next.past!==current.past&&next.past.at(-1)===current.doc
  if(current.collaborationGesture&&(action.type==='checkpoint'||addsHistory)){finish();next=reduce(current,action)}
  if(action.type==='load')return {...next,collaborationPast:[],collaborationFuture:[],collaborationEdits:[],collaborationGesture:null}
  if(action.type==='checkpoint')return {...next,collaborationPast:[...current.collaborationPast,{pageId:current.pageId,hasCanvas:false}].slice(-80),collaborationFuture:[],
    collaborationGesture:{id:action.collaborationId,pageId:current.pageId,before:elements(current.doc,current.pageId),past:current.collaborationPast,future:current.collaborationFuture}}
  if(addsHistory){
    const before=elements(current.doc,current.pageId),after=elements(next.doc,current.pageId),retained=next.doc.pages.some(p=>p.id===current.pageId),hasCanvas=retained&&!same(before,after)
    return {...next,collaborationPast:[...current.collaborationPast,{pageId:current.pageId,hasCanvas,clientOperationId:action.collaborationId}].slice(-80),collaborationFuture:[],
      collaborationEdits:[...current.collaborationEdits,...(retained?intent(before,after,action.collaborationId,current.pageId):[])]}
  }
  // Layout measurements and option changes outside a gesture still change the
  // shared document, even when they intentionally do not create an undo entry.
  if(!current.collaborationGesture&&next.doc!==current.doc&&next.doc.pages.some(p=>p.id===current.pageId)){
    const before=elements(current.doc,current.pageId),after=elements(next.doc,current.pageId)
    return {...next,collaborationEdits:[...current.collaborationEdits,...intent(before,after,action.collaborationId,current.pageId)]}
  }
  return next
}
