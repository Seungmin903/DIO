import {decodeElement,encodeElement,sharedObject} from './canvasElements.js'
import { canvasContent, stable, sameElements } from './canvasApi.js'
import { assertCanvasBatchLimits, MAX_CANVAS_BATCH_ITEMS } from './canvasBatchLimits.js'
const copy=v=>JSON.parse(JSON.stringify(v))
const permanentRejection=error=>[400,403,404,405,410,413,415,422].includes(error.status)
// 큰 저널을 변환할 때 한 항목마다 JS 스레드를 양보해 실행 직후 화면 생성(iOS 워치독 10~18초)을 막지 않는다.
const yieldToUi=()=>new Promise(resolve=>setTimeout(resolve,0))
export const JOURNAL_FORMAT=3

/**
 * 편집 항목을 "바뀐 요소만" 담는 형태로 줄인다(format 3).
 * - before: 내용이 바뀌었거나 지워진 요소의 이전 모습, after: 내용이 바뀌었거나 새로 생긴 요소의 현재 모습(기기 객체 그대로)
 * - reordered: 공통 요소의 순서가 바뀌었으면 true, 그때만 order 에 편집 후 전체 요소 id 순서를 둔다
 * 요소 참조가 같으면(같은 객체) 인코딩·비교를 건너뛰므로, 획 하나를 더한 편집은 페이지 요소 수와 무관하게 싸다.
 * 예전 형식(전후 전체 사본)의 항목도 같은 함수로 변환한다.
 */
export function compactEdit(entry){
  if(entry.compact)return entry
  const before=(entry.before??[]).filter(sharedObject),after=(entry.after??[]).filter(sharedObject)
  const oldById=new Map(before.map(o=>[o.id,o])),nextById=new Map(after.map(o=>[o.id,o]))
  const signatures=new Map()
  const signature=object=>{let value=signatures.get(object);if(value===undefined){value=stable(encodeElement(object));signatures.set(object,value)}return value}
  const oldOut=[],nextOut=[]
  for(const [id,old] of oldById){
    const next=nextById.get(id)
    if(!next){oldOut.push(old);continue}
    if(next===old)continue
    if(signature(old)!==signature(next)){oldOut.push(old);nextOut.push(next)}
  }
  for(const [id,next] of nextById)if(!oldById.has(id))nextOut.push(next)
  const commonOld=[...oldById.keys()].filter(id=>nextById.has(id)),commonNext=[...nextById.keys()].filter(id=>oldById.has(id))
  const reordered=commonOld.length!==commonNext.length||commonOld.some((id,index)=>id!==commonNext[index])
  return {id:entry.id,pageId:entry.pageId,compact:true,before:copy(oldOut),after:copy(nextOut),reordered,...(reordered?{order:after.map(o=>o.id)}:{})}
}
const exceedsBatch=request=>{try{assertCanvasBatchLimits(request.changes,request.expectedVersions);return false}catch(error){if(error.code==='CANVAS_BATCH_LIMIT')return true;throw error}}
/**
 * 100개 제한을 넘는 요청을 종류별 100개씩 여러 요청으로 나눈다(수정 → 생성 → 삭제 순). 각 부분은 서버 이력에 별도 명령으로 남는다.
 * 부분마다 새 명령 ID를 받아 저널에 저장하므로 재시도해도 같은 ID·본문을 다시 보낸다.
 */
export function splitRequest(request,createId){
  const {creates=[],updates=[],deleteElementIds=[],restoreElementIds=[]}=request.changes,versions=request.expectedVersions??{}
  const chunks=list=>{const out=[];for(let index=0;index<list.length;index+=MAX_CANVAS_BATCH_ITEMS)out.push(list.slice(index,index+MAX_CANVAS_BATCH_ITEMS));return out}
  const pick=ids=>Object.fromEntries(ids.filter(id=>id in versions).map(id=>[id,versions[id]]))
  const parts=[]
  for(const part of chunks(updates))parts.push({changes:{updates:part},expectedVersions:pick(part.map(row=>row.elementId))})
  for(const part of chunks(creates))parts.push({changes:{creates:part},expectedVersions:{}})
  for(const part of chunks(deleteElementIds))parts.push({changes:{deleteElementIds:part},expectedVersions:pick(part)})
  for(const part of chunks(restoreElementIds))parts.push({changes:{restoreElementIds:part},expectedVersions:pick(part)})
  return parts.map(part=>({clientOperationId:createId(),...part}))
}
export function createCanvasSession({api,storage,key,legacyKey,pageId,diaryId,createId,isActive=()=>true}){
  let journal={format:JOURNAL_FORMAT,pageId,diaryId,base:null,uiLocal:null,queue:[],control:null,recent:[]},writes=Promise.resolve(),running=null,restored=false
  const active=()=>{if(!isActive())throw new Error('편집 세션이 종료됐어요.')}
  const persist=()=>{const raw=JSON.stringify(journal);const task=writes.catch(()=>{}).then(()=>storage.setItem(key,raw));writes=task;return task}
  // 서버 요소 목록이 그대로면(같은 id·버전·순서) 다시 복사하거나 저장하지 않는다. 5초 주기 대조가 저널을 매번 다시 쓰지 않게.
  const sameBase=items=>Array.isArray(journal.base)&&journal.base.length===items.length&&journal.base.every((row,index)=>row.elementId===items[index].elementId&&row.version===items[index].version&&row.sortKey===items[index].sortKey)
  // 서버가 바꾼 요소는 version 이 오르므로 조회 응답은 싸게 비교하고, 내 요청의 응답(apply·control)은 항상 반영한다.
  const setBase=(items,force=false)=>{if(!force&&sameBase(items))return false;journal.orderKeys=copy(items.sortKeys??items.map(e=>Number(e.sortKey)).filter(Number.isFinite));journal.base=copy(items);return true}
  const accept=async response=>{active();setBase(response.items,true);await persist()}
  const push=entry=>{journal.queue.push(compactEdit(entry))}
  // 동기화 결과. 화면 반영용 objects·expectedLocal 은 읽을 때 만든다(unchanged 면 읽지 않아 복사·미리보기 비용이 없다).
  const syncResult=fields=>{let objects,expectedLocal;return {status:'saved',unchanged:false,...fields,get objects(){return objects??=preview()},get expectedLocal(){return expectedLocal??=copy(journal.uiLocal)}}}
  const preview=()=>{
    let objects=(journal.base??[]).map(decodeElement)
    for(const entry of journal.queue){
      const byId=new Map(objects.map(o=>[o.id,o])),kept=new Set(entry.after.map(o=>o.id))
      for(const old of entry.before)if(!kept.has(old.id))byId.delete(old.id)
      for(const next of entry.after)byId.set(next.id,next)
      objects=[...byId.values()]
      if(entry.reordered){const rank=new Map((entry.order??[]).map((id,index)=>[id,index]));objects.sort((a,b)=>(rank.get(a.id)??Number.MAX_SAFE_INTEGER)-(rank.get(b.id)??Number.MAX_SAFE_INTEGER))}
    }
    return copy(objects)
  }
  const requestFor=entry=>{
    const old=new Map(entry.before.map(o=>[o.id,encodeElement(o)])),next=new Map(entry.after.map(o=>[o.id,encodeElement(o)]))
    const remote=new Map(journal.base.map(e=>[e.elementId,e]))
    const existedBefore=id=>old.has(id)||!next.has(id)
    const creates=[],updates=[],deleteElementIds=[],expectedVersions={}
    const allKeys=journal.orderKeys??journal.base.map(e=>Number(e.sortKey)),top=Math.max(0,...allKeys)
    const order=new Map()
    if(entry.reordered){
      const ids=(entry.order??[]).filter(id=>remote.has(id)||!existedBefore(id))
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
      const result={...current}
      for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
        if(equal(before[field],after[field]))continue
        if(field==='propertiesJson'){
          const props={...current.propertiesJson}
          for(const name of new Set([...Object.keys(before.propertiesJson??{}),...Object.keys(after.propertiesJson??{})])){
            if(equal(before.propertiesJson?.[name],after.propertiesJson?.[name]))continue
            if(name in (after.propertiesJson??{}))props[name]=after.propertiesJson[name];else delete props[name]
          }
          result.propertiesJson=props
        }else if(field in after)result[field]=after[field];else delete result[field]
      }
      return result
    }
    // 순서가 바뀌면 내용이 그대로인 공통 요소도 sortKey 를 바꿔야 하므로 모두 다룬다(저장은 하지 않고 서버 현재 값에서 만든다).
    const touched=entry.reordered?[...new Set([...(entry.order??[]),...old.keys()])]:[...new Set([...old.keys(),...next.keys()])]
    for(const id of touched){
      const current=remote.get(id)
      if(!existedBefore(id)){if(!current)creates.push({...next.get(id),sortKey:order.get(id)??top+creates.length+1});continue}
      // A remote deletion wins over a stale update; never resurrect a deleted object.
      if(!current)continue
      if(old.has(id)&&!next.has(id)){deleteElementIds.push(id);expectedVersions[id]=current.version;continue}
      const encodedCurrent=canvasContent([decodeElement(current)])[0]
      const before=old.get(id)??encodedCurrent,after=next.get(id)??encodedCurrent
      const merged=merge(before,after,encodedCurrent)
      const {elementType,...patch}=merged
      if(!equal(merged,encodedCurrent)||entry.reordered)
        updates.push({...patch,version:current.version,...(entry.reordered?{sortKey:order.get(id)}:{})})
    }
    if(!creates.length&&!updates.length&&!deleteElementIds.length)return null
    return {clientOperationId:entry.id,changes:{...(creates.length?{creates}:{}),...(updates.length?{updates}:{}),...(deleteElementIds.length?{deleteElementIds}: {})},expectedVersions}
  }
  // 예전 형식(1·2)의 전후 전체 사본 항목을 한 항목씩 양보하며 변환한다. 항목이 수백 개면 한 번에 하면 수십 초 JS 가 멈춘다.
  const migrate=async saved=>{
    const queue=[]
    for(const entry of saved.queue){
      if(entry.compact){queue.push(entry);continue}
      // 이미 준비된 요청(부분 포함)은 그대로 쓴다: 변환하면서 명령 ID 가 바뀌지 않게
      queue.push({...compactEdit(entry),...(entry.request?{request:entry.request,mediaApiVersion:entry.mediaApiVersion}:{}),...(entry.parts?{parts:entry.parts,partIndex:entry.partIndex??0}:{})})
      await yieldToUi();active()
    }
    const rejectedEdits=(saved.rejectedEdits??[]).map(entry=>entry.compact||!entry.before&&!entry.after?entry:{...compactEdit(entry),status:entry.status,code:entry.code,rejectedAt:entry.rejectedAt})
    return {...saved,format:JOURNAL_FORMAT,queue,...(saved.rejectedEdits?{rejectedEdits}:{})}
  }
  const apiSession={
    async restore(seed,savedAt=0){
      const raw=await storage.getItem(key);active()
      if(raw){const saved=JSON.parse(raw);if(![1,2,JOURNAL_FORMAT].includes(saved.format)||saved.pageId!==pageId||saved.diaryId!==diaryId||!Array.isArray(saved.queue)||!Array.isArray(saved.recent))throw new Error('기기 편집 기록을 확인하지 못했어요.');journal=saved.format===JOURNAL_FORMAT?saved:await migrate(saved);if(saved.format!==JOURNAL_FORMAT)await persist()}
      else if(legacyKey){const legacy=await storage.getItem(legacyKey);active();if(legacy){const saved=JSON.parse(legacy);if(saved.pageId===pageId&&saved.diaryId===diaryId&&Array.isArray(saved.local))journal.uiLocal=[...saved.local,...seed.filter(o=>sharedObject(o)&&o.type!=='text')]}}
      if(journal.uiLocal===null)journal.uiLocal=copy(seed.filter(sharedObject))
      if(journal.format!==JOURNAL_FORMAT){
        // format 1: 기기에만 있던 텍스트 외 요소를 한 편집으로 붙인다(변환은 migrate 가 끝냈으므로 형식만 올린다)
        const present=new Set(journal.uiLocal.map(o=>o.id)),extras=seed.filter(o=>sharedObject(o)&&o.type!=='text'&&!present.has(o.id))
        if(extras.length){push({id:createId(),pageId,before:journal.uiLocal,after:[...journal.uiLocal,...extras]});journal.uiLocal=[...journal.uiLocal,...copy(extras)]}
        journal.format=JOURNAL_FORMAT;await persist()
      }
      if(raw&&savedAt>(journal.uiLocalAt??0)&&!sameElements(seed,journal.uiLocal)){
        push({id:createId(),pageId,before:journal.uiLocal,after:seed.filter(sharedObject)})
        journal.uiLocal=copy(seed.filter(sharedObject));journal.uiLocalAt=savedAt;await persist()
      }
      // Preserve previously prepared media operations without sending them through removed APIs.
      const mediaRows=request=>[...(request?.changes?.creates??[]),...(request?.changes?.updates??[])]
      const deferred=entry=>entry.mediaApiVersion!==1&&[...mediaRows(entry.request),...(entry.parts??[]).flatMap(mediaRows)].some(row=>row.elementType==='PHOTO'||row.mediaFileId||row.propertiesJson?.mediaFileId||row.propertiesJson?.src)
      const held=journal.queue.filter(deferred)
      if(held.length){journal.deferredMedia=[...(journal.deferredMedia??[]),...held];journal.queue=journal.queue.filter(entry=>!deferred(entry));await persist()}
      canvasContent(journal.uiLocal);restored=true;return copy(journal.uiLocal)
    },
    async enqueue(entry){
      active();if(!restored)throw new Error('편집 기록을 먼저 확인해 주세요.')
      if(journal.recent.includes(entry.id)||journal.queue.some(row=>row.id===entry.id))return
      const compact=compactEdit(entry)
      canvasContent(compact.before);canvasContent(compact.after)
      journal.queue.push(compact);journal.uiLocal=copy(entry.after.filter(sharedObject));journal.uiLocalAt=Date.now();await persist()
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
            if(journal.uiLocal.some(o=>!overlap.some(r=>r.id===o.id)))push({id:createId(),pageId,before:overlap,after:[...overlap,...journal.uiLocal.filter(o=>!overlap.some(r=>r.id===o.id))]})
          }
        }
        // 서버 요소도 그대로고 보낼 것도 없으면 화면에 돌려줄 변화가 없다(주기 대조가 매번 미리보기를 만들고 편집 화면과 대조하지 않게)
        let changed=setBase(remote)||journal.queue.length>0||Boolean(journal.control)
        if(changed)await persist()
        let direction=null,historyClientOperationId=null,rejectedCount=0
        if(journal.control){const pending=journal.control;direction=pending.direction
          try{const result=await api.control(pageId,pending.direction,pending.request);active();historyClientOperationId=result.clientOperationId;journal.control=null;await accept(result)}
          catch(error){if(error.status===409||permanentRejection(error)){journal.rejectedControls=[...(journal.rejectedControls??[]),copy(pending)];journal.control=null;await persist()}throw error}
        }
        while(journal.queue.length){
          active();const entry=journal.queue[0]
          try{
          if(!entry.request&&!entry.parts){
            const request=requestFor(entry)
            if(request&&exceedsBatch(request)){
              // 100개 제한을 넘는 옛 편집: 여러 요청으로 나눠 차례로 보낸다. 모두 성공해야 항목을 비운다.
              entry.parts=splitRequest(request,createId);entry.partIndex=0;entry.mediaApiVersion=1;await persist()
            }else{
              const prepared=request&&api.prepare?await api.prepare(request):request;active();entry.request=prepared;entry.mediaApiVersion=1;await persist()
            }
          }
          // 이전 버전이 준비해 둔 요청이 제한을 넘으면 그것도 나눈다(명령 ID 는 부분마다 새로 받는다)
          if(entry.request&&exceedsBatch(entry.request)){entry.parts=splitRequest(entry.request,createId);entry.partIndex=0;delete entry.request;await persist()}
          if(entry.parts){
            while(entry.partIndex<entry.parts.length){
              const part=entry.parts[entry.partIndex]
              assertCanvasBatchLimits(part.changes,part.expectedVersions)
              const prepared=api.prepare?await api.prepare(part):part;active()
              const result=await api.apply(pageId,prepared);active();setBase(result.items,true)
              entry.partIndex+=1;await persist()
            }
          }else if(entry.request){
            assertCanvasBatchLimits(entry.request.changes,entry.request.expectedVersions)
            const result=await api.apply(pageId,entry.request);active();setBase(result.items,true)
          }
          }catch(error){
              if(error.code==='CANVAS_BATCH_LIMIT') {
                await persist()
                throw Object.assign(Error('이전 대량 편집이 100개 제한을 넘어 저장 대기열이 막혔어요. 이 작업과 이후 편집은 서버에 저장되지 않고 기기에만 보관 중이에요. 재시도만으로 해결되지 않으며 별도 복구가 필요해요.'), {code:'CANVAS_BATCH_LIMIT'})
              }
              if(error.status===404&&error.code==='CANVAS_ELEMENT_NOT_FOUND'){
                journal.rejectedRequests=[...(journal.rejectedRequests??[]),copy(entry.request??entry.parts?.[entry.partIndex]??null)]
                entry.id=createId();delete entry.request;delete entry.parts;delete entry.partIndex;await persist();throw error
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
              journal.rejectedRequests=[...(journal.rejectedRequests??[]),copy(entry.request??entry.parts?.[entry.partIndex]??null)]
              entry.id=createId();delete entry.request;delete entry.parts;delete entry.partIndex;await persist();throw error
          }
          journal.queue.shift();journal.recent=[...journal.recent,entry.id,...(entry.parts??[]).map(part=>part.clientOperationId)].slice(-128);await persist()
        }
        const history=await api.history(pageId);active()
        return syncResult({history,direction,historyClientOperationId,rejectedCount:(journal.rejectedEdits??[]).length,unchanged:!changed})
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
      let applied
      try{applied=await api.control(pageId,direction,journal.control.request);active();journal.control=null;await accept(applied)}
      catch(error){if(error.status===409||permanentRejection(error)){journal.rejectedControls=[...(journal.rejectedControls??[]),copy(journal.control)];journal.control=null;await persist()}throw error}
      return syncResult({history:await api.history(pageId),direction,historyClientOperationId:applied.clientOperationId})
    },
    // 보낼 편집이나 실행 취소 요청이 남아 있는지(저장 상태 표시용)
    pending(){return journal.queue.length>0||Boolean(journal.control)},
    ownsCommand(id){return journal.recent.includes(id)||journal.queue.some(e=>e.id===id||(e.parts??[]).some(part=>part.clientOperationId===id))||journal.control?.request.clientOperationId===id},
    snapshot(){return copy(journal)},
  }
  return apiSession
}
