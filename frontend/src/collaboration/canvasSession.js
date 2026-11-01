import {decodeElement,sharedObject} from './canvasElements.js'
import { canvasContent, canvasDelta, stable, sameElements } from './canvasApi.js'
const copy=v=>JSON.parse(JSON.stringify(v))
const permanentRejection=error=>[400,403,404,405,410,413,415,422].includes(error.status)
export function createCanvasSession({api,storage,key,legacyKey,pageId,diaryId,createId,isActive=()=>true}){
  let journal={format:2,pageId,diaryId,base:null,uiLocal:null,queue:[],control:null,recent:[]},writes=Promise.resolve(),running=null,restored=false
  const active=()=>{if(!isActive())throw new Error('편집 세션이 종료됐어요.')}
  const persist=()=>{const raw=JSON.stringify(journal);const task=writes.catch(()=>{}).then(()=>storage.setItem(key,raw));writes=task;return task}
  const setBase=items=>{journal.orderKeys=copy(items.sortKeys??items.map(e=>Number(e.sortKey)).filter(Number.isFinite));journal.base=copy(items)}
  const accept=async response=>{active();setBase(response.items);await persist()}
  const preview=()=>{
    let objects=(journal.base??[]).map(decodeElement)
    for(const entry of journal.queue){const delta=canvasDelta(entry.before,entry.after),byId=new Map(objects.map(o=>[o.id,o]));
      for(const id of delta.touched){if(delta.next.has(id))byId.set(id,entry.after.find(o=>o.id===id));else byId.delete(id)}
      objects=[...byId.values()]
      if(delta.reordered){const rank=new Map(entry.after.map((o,i)=>[o.id,i]));objects.sort((a,b)=>(rank.get(a.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.id)??Number.MAX_SAFE_INTEGER))}
    }
    return copy(objects)
  }
  const requestFor=entry=>{
    const delta=canvasDelta(entry.before,entry.after),remote=new Map(journal.base.map(e=>[e.elementId,e]))
    const creates=[],updates=[],deleteElementIds=[],expectedVersions={}
    const allKeys=journal.orderKeys??journal.base.map(e=>Number(e.sortKey)),top=Math.max(0,...allKeys)
    const order=new Map()
    if(delta.reordered){
      const ids=[...delta.next.keys()].filter(id=>remote.has(id)||!delta.old.has(id))
      let slots=ids.filter(id=>remote.has(id)).map(id=>Number(remote.get(id).sortKey)).sort((a,b)=>a-b)
      const counts=new Map();for(const key of allKeys)counts.set(key,(counts.get(key)??0)+1)
      // Reuse existing slots so media outside the shared subset stays untouched.
      // Legacy duplicate keys cannot express a strict order; use free slots above all media.
      if(slots.some(key=>!Number.isFinite(key)||counts.get(key)!==1))slots=[]
      while(slots.length<ids.length)slots.push(top+slots.length+1)
      ids.forEach((id,index)=>order.set(id,slots[index]))
    }
    const equal=(a,b)=>stable(a)===stable(b)
    // Rebase only the locally changed fields; unrelated remote edits remain intact.
    const merge=(before,after,current)=>{
      const next={...current}
      for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
        if(equal(before[key],after[key]))continue
        if(key==='propertiesJson'){
          const props={...current.propertiesJson}
          for(const name of new Set([...Object.keys(before.propertiesJson??{}),...Object.keys(after.propertiesJson??{})])){
            if(equal(before.propertiesJson?.[name],after.propertiesJson?.[name]))continue
            if(name in (after.propertiesJson??{}))props[name]=after.propertiesJson[name];else delete props[name]
          }
          next.propertiesJson=props
        }else if(key in after)next[key]=after[key];else delete next[key]
      }
      return next
    }
    for(const id of delta.touched){const before=delta.old.get(id),after=delta.next.get(id),current=remote.get(id)
      if(!before){if(!current)creates.push({...after,sortKey:order.get(id)??top+creates.length+1});continue}
      // A remote deletion wins over a stale update; never resurrect a deleted object.
      if(!current)continue
      if(!after){deleteElementIds.push(id);expectedVersions[id]=current.version;continue}
      const merged=merge(before,after,canvasContent([decodeElement(current)])[0])
      const {elementType,...patch}=merged
      if(!equal(merged,canvasContent([decodeElement(current)])[0])||delta.reordered)
        updates.push({...patch,version:current.version,...(delta.reordered?{sortKey:order.get(id)}:{})})
    }
    if(!creates.length&&!updates.length&&!deleteElementIds.length)return null
    return {clientOperationId:entry.id,changes:{...(creates.length?{creates}:{}),...(updates.length?{updates}:{}),...(deleteElementIds.length?{deleteElementIds}: {})},expectedVersions}
  }
  const apiSession={
    async restore(seed,savedAt=0){
      const raw=await storage.getItem(key);active()
      if(raw){const saved=JSON.parse(raw);if(![1,2].includes(saved.format)||saved.pageId!==pageId||saved.diaryId!==diaryId||!Array.isArray(saved.queue)||!Array.isArray(saved.recent))throw new Error('기기 편집 기록을 확인하지 못했어요.');journal=saved}
      else if(legacyKey){const legacy=await storage.getItem(legacyKey);active();if(legacy){const saved=JSON.parse(legacy);if(saved.pageId===pageId&&saved.diaryId===diaryId&&Array.isArray(saved.local))journal.uiLocal=[...saved.local,...seed.filter(o=>sharedObject(o)&&o.type!=='text')]}}
      if(journal.uiLocal===null)journal.uiLocal=copy(seed.filter(sharedObject))
      if(journal.format===1){
        const present=new Set(journal.uiLocal.map(o=>o.id)),extras=seed.filter(o=>sharedObject(o)&&o.type!=='text'&&!present.has(o.id))
        if(extras.length){journal.queue.push({id:createId(),pageId,before:copy(journal.uiLocal),after:[...copy(journal.uiLocal),...copy(extras)]});journal.uiLocal=[...journal.uiLocal,...copy(extras)]}
        journal.format=2;await persist()
      }
      if(raw&&savedAt>(journal.uiLocalAt??0)&&!sameElements(seed,journal.uiLocal)){
        journal.queue.push({id:createId(),pageId,before:copy(journal.uiLocal),after:copy(seed.filter(sharedObject))})
        journal.uiLocal=copy(seed.filter(sharedObject));journal.uiLocalAt=savedAt;await persist()
      }
      // Preserve previously prepared media operations without sending them through removed APIs.
      const deferred=entry=>entry.mediaApiVersion!==1&&[...(entry.request?.changes?.creates??[]),...(entry.request?.changes?.updates??[])].some(row=>row.elementType==='PHOTO'||row.mediaFileId||row.propertiesJson?.mediaFileId||row.propertiesJson?.src)
      const held=journal.queue.filter(deferred)
      if(held.length){journal.deferredMedia=[...(journal.deferredMedia??[]),...held];journal.queue=journal.queue.filter(entry=>!deferred(entry));await persist()}
      canvasContent(journal.uiLocal);restored=true;return copy(journal.uiLocal)
    },
    async enqueue(entry){
      active();if(!restored)throw new Error('편집 기록을 먼저 확인해 주세요.')
      if(journal.recent.includes(entry.id)||journal.queue.some(row=>row.id===entry.id))return
      canvasContent(entry.before);canvasContent(entry.after)
      journal.queue.push(copy(entry));journal.uiLocal=copy(entry.after);journal.uiLocalAt=Date.now();await persist()
    },
    async acceptImport(objects){active();journal.uiLocal=copy(objects);journal.uiLocalAt=Date.now();await persist()},
    synchronize(){
      if(running)return running
      running=(async()=>{
        await writes;active();const remote=await api.load(pageId,diaryId);active()
        if(journal.base===null&&!journal.queue.length&&!journal.control){
          if(journal.uiLocal.length){
            const localIds=new Set(journal.uiLocal.map(o=>o.id)),overlap=remote.map(decodeElement).filter(o=>localIds.has(o.id))
            const localOverlap=journal.uiLocal.filter(o=>overlap.some(r=>r.id===o.id))
            if(!sameElements(localOverlap,overlap)){
              // No edit journal exists for this stale snapshot. Preserve a recovery copy,
              // then use the server for existing IDs rather than freezing the whole page.
              journal.recoveredLocal=[...(journal.recoveredLocal??[]),{objects:copy(journal.uiLocal),at:Date.now()}]
              // uiLocal stays unchanged until the editor accepts the remote import.
            }
            if(journal.uiLocal.some(o=>!overlap.some(r=>r.id===o.id)))journal.queue.push({id:createId(),pageId,before:overlap,after:[...copy(overlap),...copy(journal.uiLocal.filter(o=>!overlap.some(r=>r.id===o.id)))]})
          }
        }
        setBase(remote);await persist()
        let direction=null,historyClientOperationId=null,rejectedCount=0
        if(journal.control){const pending=journal.control;direction=pending.direction
          try{const result=await api.control(pageId,pending.direction,pending.request);active();historyClientOperationId=result.clientOperationId;journal.control=null;await accept(result)}
          catch(error){if(error.status===409||permanentRejection(error)){journal.rejectedControls=[...(journal.rejectedControls??[]),copy(pending)];journal.control=null;await persist()}throw error}
        }
        while(journal.queue.length){
          active();const entry=journal.queue[0]
          try{
          if(!entry.request){const request=requestFor(entry);const prepared=request&&api.prepare?await api.prepare(request):request;active();entry.request=prepared;entry.mediaApiVersion=1;await persist()}
          if(entry.request){
            const result=await api.apply(pageId,entry.request);active();setBase(result.items)
          }
          }catch(error){
              if(error.status===404&&error.code==='CANVAS_ELEMENT_NOT_FOUND'){
                journal.rejectedRequests=[...(journal.rejectedRequests??[]),copy(entry.request)]
                entry.id=createId();delete entry.request;await persist();throw error
              }
              if(permanentRejection(error)){
                journal.rejectedEdits=[...(journal.rejectedEdits??[]),{...copy(entry),status:error.status,code:error.code??null,rejectedAt:Date.now()}]
                journal.queue.shift();rejectedCount++;await persist()
                // Access loss or page deletion must stop writes, but the rejected
                // head no longer prevents recovery of the remaining local work.
                if([403,404,410].includes(error.status))throw error
                continue
              }
              if(error.status!==409)throw error
              // A definitive rejection was not committed. Use a fresh command ID for
              // the rebased payload. Unknown/network outcomes keep the original ID.
              journal.rejectedRequests=[...(journal.rejectedRequests??[]),copy(entry.request)]
              entry.id=createId();delete entry.request;await persist();throw error
          }
          journal.queue.shift();journal.recent=[...journal.recent,entry.id].slice(-128);await persist()
        }
        const history=await api.history(pageId);active()
        return {objects:preview(),expectedLocal:copy(journal.uiLocal),history,status:'saved',direction,historyClientOperationId,rejectedCount:(journal.rejectedEdits??[]).length}
      })().finally(()=>{running=null})
      return running
    },
    async control(direction){
      const pending=journal.control?.direction
      const synchronized=await apiSession.synchronize();active()
      if(pending)return {...synchronized,direction:pending}
      const history=await api.history(pageId);active();const candidate=direction==='undo'?history.nextUndo:history.nextRedo
      if(!candidate)throw Object.assign(new Error(direction==='undo'?'취소할 내 작업이 없어요.':'다시 실행할 내 작업이 없어요.'),{code:'NO_CANVAS_HISTORY'})
      journal.control={direction,request:{operationId:candidate.operationId,expectedRevision:candidate.revision,clientOperationId:createId()}};await persist()
      let result
      try{result=await api.control(pageId,direction,journal.control.request);active();journal.control=null;await accept(result)}
      catch(error){if(error.status===409||permanentRejection(error)){journal.rejectedControls=[...(journal.rejectedControls??[]),copy(journal.control)];journal.control=null;await persist()}throw error}
      return {objects:preview(),expectedLocal:copy(journal.uiLocal),history:await api.history(pageId),status:'saved',direction,historyClientOperationId:result.clientOperationId}
    },
    ownsCommand(id){return journal.recent.includes(id)||journal.queue.some(e=>e.id===id)||journal.control?.request.clientOperationId===id},
    snapshot(){return copy(journal)},
  }
  return apiSession
}
