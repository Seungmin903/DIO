import { useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createAuthenticatedMemberTransport } from '../../diary/services/memberTransport.js'
import { memberDocumentKey } from '../../diary/services/memberStorage.js'
import { createId } from '../utils/common.js'
import { sameElements } from '../../collaboration/canvasApi.js'
import { isUuid } from '../../collaboration/canvasElements.js'
import { createCollaborationDiagnostics } from '../../collaboration/collaborationDiagnostics.js'
import { createCanvasWriteApi } from '../../collaboration/canvasWriteApi.js'
import { loadServerPageSnapshot, createServerPage, copyServerPage, deleteServerPage, reorderServerPages, updateServerPage, loadPageSettings } from '../../collaboration/serverPages.js'
import { createCanvasSession } from '../../collaboration/canvasSession.js'
import { createCanvasMedia, createMediaRequest } from '../../collaboration/canvasMedia.js'
import { canvasMediaFiles } from '../services/canvasMediaFiles'
import { connectCollaboration } from '../../collaboration/collaborationSocket.js'
import { createCanvasHttpFetch } from '../../collaboration/canvasFetch.js'
import { setPdfSourceFetcher } from '../services/pdfSourceRemote.js'

// PDF 쪽 바탕(원본 PDF 를 올리기 전)이 아직 서버에 없는 쪽인지
const needsPdfSeed=page=>(page.objects??[]).some(o=>o.backdrop&&o.pdfSource&&!o.pdfSource.mediaFileId)

export function useMemberCanvasCollaboration({diary,page,state,loaded,readOnly,dispatch,onMembersChanged=()=>{},onCollaborationStateChange=()=>{}}){
  const enabled=diary?.source==='member-api'&&!readOnly
  const latest=useRef({page,state});latest.current={page,state}
  const membersChanged=useRef(onMembersChanged);membersChanged.current=onMembersChanged
  const collaborationStateChange=useRef(onCollaborationStateChange);collaborationStateChange.current=onCollaborationStateChange
  const runtime=useRef(null)
  const [view,setView]=useState({status:null,history:null,busy:false,pageId:null})
  // 지금 이 다이어리를 연 회원 id(서버 PRESENCE). 서버가 아직 보내지 않았거나 연결이 끊기면 null(모름)
  const [onlineUserIds,setOnlineUserIds]=useState(null)
  const sessionKey=authService.getSessionKey()
  const failureMessage=error=>{
    if(error.code==='CANVAS_BATCH_LIMIT')return error.message
    const reason=error.status===401?'로그인이 만료됐어요. 다시 로그인해 주세요.':error.status===403?'이 페이지를 편집할 권한을 확인하지 못했어요.':error.status===404?'현재 페이지를 서버에서 찾지 못했어요.':error.status>=500?'서버에서 캔버스 요청을 처리하지 못했어요.':error.code==='NETWORK_ERROR'?'캔버스 요청이 서버에 도달하지 못했어요.':'기기 편집 기록이나 서버의 캔버스 응답을 확인하지 못했어요.'
    const code=typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'CANVAS_SYNC_ERROR'
    return `${reason} (${error.status||0} / ${code}) 기기 작업은 유지돼요.`
  }
  useEffect(()=>{
    if(!enabled||!loaded)return
    if(!isUuid(diary.id)){
      setView(v=>({...v,status:'error',pageId:page.id,errorMessage:'서버 다이어리 ID를 확인하지 못했어요. 홈에서 다이어리를 다시 열어 주세요. 기기 작업은 유지돼요.'}))
      return
    }
    const r={alive:true,engines:new Map(),loaded:new Map(),tail:Promise.resolve(),claimed:new Set(),pending:new Map(),again:new Set(),busy:false,acks:[]}
    // 저널에 넣은 편집의 전송 확인을 모아 한 번에 보낸다(동기화 결과 반영과 같은 커밋)
    r.flushAcks=()=>{if(!r.acks.length)return;const ids=r.acks.splice(0);for(const id of ids)r.claimed.delete(id);if(r.alive)dispatch({type:'collaborationAck',ids})}
    runtime.current=r
    const active=()=>r.alive&&authService.getSessionKey()===sessionKey
    const headersFor=url=>authService.getCollaborationHeaders?.({url,userId:diary.memberAccountId,sessionKey})??{}
    // The common HTTP transport already adds member JWT + development access
    // for every API path. The legacy collaboration bridge permits only page/WS
    // routes and must not inspect the new /members lookup.
    const fetchImpl=createCanvasHttpFetch({auth:authService,headersFor,accessTokenHeader,fetchImpl:memberFetch})
    const diagnostics=createCollaborationDiagnostics({enabled:typeof __DEV__!=='undefined'&&__DEV__&&process.env.EXPO_PUBLIC_COLLABORATION_DIAGNOSTICS==='1'})
    const transport=diagnostics.transport(createAuthenticatedMemberTransport({auth:authService,accountId:diary.memberAccountId,baseUrl:apiBaseUrl,accessTokenHeader,fetchImpl}))
    const media=createCanvasMedia({request:createMediaRequest({auth:authService,accountId:diary.memberAccountId,sessionKey,baseUrl:apiBaseUrl,fetchImpl:memberFetch}),files:canvasMediaFiles,storage:AsyncStorage,key:`${memberDocumentKey(diary)}:media-uploads:v1:${encodeURIComponent(apiBaseUrl)}`,isActive:active})
    const api=createCanvasWriteApi(transport,media,diary.id)
    const fetchDocument=(sourceId,mediaFileId)=>media.fetchDocument(sourceId,mediaFileId)
    setPdfSourceFetcher(fetchDocument)
    r.pageEpoch=0;r.pageIds=null;r.removing=new Set()
    r.refreshPages=()=>{
      if(r.pagesJob)return r.pagesJob
      const epoch=r.pageEpoch
      const job=loadServerPageSnapshot(transport,diary.id,{knownIds:latest.current.state.doc.pages.map(p=>p.id)})
        .then(snapshot=>{
          if(!active()||epoch!==r.pageEpoch)return null
          r.pageIds=new Set(snapshot.pageIds)
          dispatch({type:'reconcileServerPages',...snapshot})
          if(!snapshot.pageIds.length)setView(v=>({...v,status:'error',errorMessage:'서버에 편집할 페이지가 없어요. 새 페이지를 추가해 주세요. 기기 내용은 보관했어요.'}))
          return snapshot
        }).catch(error=>{
          if(active())setView(v=>({...v,errorMessage:failureMessage(error)}))
          throw error
        }).finally(()=>{if(r.pagesJob===job)r.pagesJob=null})
      r.pagesJob=job;return job
    }
    const refreshPagesQuietly=()=>r.refreshPages().catch(()=>{})
    const flushPage=async pageId=>{
      dispatch({type:'commitCheckpoint'})
      await new Promise(resolve=>setTimeout(resolve,0))
      if((latest.current.state.collaborationEdits??[]).some(e=>e.pageId===pageId)||r.claimed.size)
        throw Error('현재 편집을 저장 중이에요. 잠시 후 다시 시도해 주세요.')
      await r.sync(pageId)
      if(!active()||!r.pageIds?.has(pageId))throw Error('서버에 없는 페이지예요. 페이지 목록을 확인해 주세요.')
    }
    const mutatePages=async work=>{
      if(r.pageMutating)throw Error('페이지 작업을 처리 중이에요. 잠시 기다려 주세요.')
      r.pageMutating=true;r.pageEpoch++
      try{return await work()}
      finally{
        r.pageEpoch++;r.pageMutating=false
        await r.pagesJob?.catch(()=>{})
        if(active())await refreshPagesQuietly()
      }
    }
    r.loadPageSettings=async pageId=>{const settings=await loadPageSettings(transport,diary.id,pageId);if(!active())throw Error('다시 로그인해 주세요.');return settings}
    r.updatePage=(pageId,body)=>mutatePages(async()=>{
      if(!active())throw Error('다시 로그인해 주세요.')
      const settings=await updateServerPage(transport,diary.id,pageId,body)
      if(!active())throw Error('계정이 바뀌어 페이지 설정을 반영하지 않았어요.')
      const allAppearance=body.applyPaperAppearanceToAllPages?settings.paperAppearance:null
      const patches=allAppearance
        ? latest.current.state.doc.pages.map(page=>page.id===pageId?settings:{id:page.id,paperAppearance:allAppearance})
        : [settings]
      dispatch({type:'applyServerPageSettings',settings:patches,paperAppearance:allAppearance})
      return settings
    })
    r.addPage=backgroundAssetId=>mutatePages(async()=>{
      dispatch({type:'commitCheckpoint'})
      const page=await createServerPage({transport,diaryId:diary.id,backgroundAssetId,
        orientation:latest.current.state.doc.orientation??'landscape',paperAppearance:latest.current.state.doc.paperAppearance,
        storage:AsyncStorage,key:`${memberDocumentKey(diary)}:page-create:v1`,createId,isActive:active})
      if(active()){r.pageIds?.add(page.id);dispatch({type:'importServerPages',pages:[page],selectId:page.id})}
      return page
    })
    // 내 속지(PDF 쪽): 빈 페이지를 만들어 쪽 크기로 맞춘 뒤 바탕 그림을 얹는다(새 PDF 다이어리와 같은 길). 그림과 원본 PDF 는 동기화가 올린다.
    r.addPdfPages=docPages=>mutatePages(async()=>{
      dispatch({type:'commitCheckpoint'})
      const added=[]
      try{
        for(const docPage of docPages){
          const page=await createServerPage({transport,diaryId:diary.id,backgroundAssetId:null,
            orientation:latest.current.state.doc.orientation??'landscape',paperAppearance:docPage.paperAppearance,
            storage:AsyncStorage,key:`${memberDocumentKey(diary)}:page-create:v1`,createId,isActive:active})
          // 쪽 크기를 못 맞추면 방금 만든 빈 페이지를 지운다(남기면 기본 크기 빈 쪽이 목록에 생기고, 다시 시도하면 한 장 더 생긴다)
          try{await transport({method:'PATCH',path:`/pages/${encodeURIComponent(page.id)}`,body:{canvasWidth:docPage.canvasWidth,canvasHeight:docPage.canvasHeight}})}
          catch(error){await deleteServerPage(transport,page.id).catch(()=>{});throw error}
          if(!active())return added
          const seeded={...page,canvasWidth:docPage.canvasWidth,canvasHeight:docPage.canvasHeight,paperAppearance:docPage.paperAppearance,objects:docPage.objects}
          r.pageIds?.add(page.id);added.push(seeded)
          // 동기화가 화면 반영 전 doc 을 읽으면 바탕 그림 없는 seed 로 엔진이 만들어져 올라가지 않는다. 그래서 seed 를 직접 넘겨 둔다
          r.engineFor(page.id,seeded.objects)
          dispatch({type:'importServerPages',pages:[seeded],selectId:added[0].id})
        }
      }finally{
        // 중간에 실패해도 이미 넣은 쪽의 바탕 그림은 올린다(첫 쪽은 고른 페이지라 page.id 효과가 올린다)
        for(const page of added.slice(1))r.sync(page.id).catch(()=>{})
      }
      return added
    })
    r.copyPage=pageId=>mutatePages(async()=>{
      await flushPage(pageId)
      const page=await copyServerPage(transport,diary.id,pageId)
      if(active()){r.pageIds?.add(page.id);dispatch({type:'importServerPages',pages:[page],selectId:page.id})}
      return page
    })
    r.removePages=ids=>mutatePages(async()=>{
      const snapshot=await r.refreshPages()
      if(!snapshot)throw Error('페이지 목록을 다시 확인해 주세요.')
      const targets=[...new Set(ids)].filter(id=>r.pageIds.has(id))
      if(targets.length>=snapshot.pageIds.length)throw Error('마지막 페이지는 삭제할 수 없어요.')
      for(const id of targets){
        await flushPage(id);r.removing.add(id)
        try{await deleteServerPage(transport,id);r.pageIds.delete(id)}finally{r.removing.delete(id)}
      }
    })
    r.movePages=(ids,anchorId,place)=>{
      const selected=new Set(ids),moving=latest.current.state.doc.pages.filter(p=>selected.has(p.id)).map(p=>p.id)
      return mutatePages(()=>reorderServerPages(transport,diary.id,{ids:moving,anchorId,place}))
    }
    r.movePage=(id,toIndex)=>{
      const pages=latest.current.state.doc.pages,from=pages.findIndex(p=>p.id===id)
      if(from<0||!Number.isInteger(toIndex))return Promise.reject(Error('이동할 페이지를 확인해 주세요.'))
      const to=Math.max(0,Math.min(toIndex,pages.length-1))
      if(from===to)return Promise.resolve()
      return r.movePages([id],pages[to].id,from<to?'after':'before')
    }
    r.engineFor=(pageId,seed)=>{
      if(!r.engines.has(pageId))r.engines.set(pageId,(async()=>{
        const key=memberDocumentKey(diary)
        const engine=createCanvasSession({api,storage:AsyncStorage,key:`${key}:collaboration:v1:${pageId}`,legacyKey:`${key}:text-sync:v1:${pageId}`,pageId,diaryId:diary.id,createId,isActive:active})
        const restored=await engine.restore(seed,Date.parse(latest.current.state.doc.updatedAt)||0);if(!active())return null
        r.loaded.set(pageId,engine)
        const current=latest.current.page
        if(current.id===pageId&&sameElements(current.objects,seed)&&!sameElements(restored,seed))dispatch({type:'importCollaborationElements',pageId,expectedElements:seed,objects:restored})
        return engine
      })())
      return r.engines.get(pageId)
    }
    r.sync=(pageId,direction)=>{
      // Coalesce bursts, but always fetch once more if an event arrives in flight.
      if(!direction&&r.pending.has(pageId)){r.again.add(pageId);return r.pending.get(pageId)}
      const startTiming=diagnostics.startSync()
      const work=async()=>{
        const finishTiming=startTiming()
        try {
        if(!active())return
        if(r.removing.has(pageId))return
        if(!r.pageIds)await r.refreshPages()
        if(!active())return
        if(!r.pageIds?.has(pageId)){await r.refreshPages();return}
        const seed=latest.current.state.doc.pages.find(p=>p.id===pageId)?.objects??[]
        const engine=await r.engineFor(pageId,seed);if(!active()||!engine)return
        // 보낼 것이 있을 때만 '저장 중'으로 바꾼다(5초 주기 대조가 저장됨↔저장 중을 깜빡이지 않게)
        if(latest.current.page.id===pageId&&(direction||engine.pending()))setView(v=>({...v,status:'saving',pageId}))
        let result
        try{result=direction?await engine.control(direction):await engine.synchronize()}
        catch(error){
          if(error.status===404&&error.code==='PAGE_NOT_FOUND'){
            await r.refreshPages()
            if(!r.pageIds?.has(pageId))return
          }
          throw error
        }
        if(!active()||!r.pageIds?.has(pageId))return
        const current=latest.current.page,target=latest.current.state.doc.pages.find(p=>p.id===pageId)
        const imported=Boolean(target)&&!result.unchanged&&(!result.direction||sameElements(target.objects,result.expectedLocal))
        // 전송 확인·화면 반영·저장 상태를 같은 틱에 갱신해 React 가 한 번에 커밋하게 한다(await 뒤로 미루면 커밋이 나뉜다)
        r.flushAcks()
        if(imported)dispatch({type:result.direction?'collaborationHistoryApplied':'importCollaborationElements',direction:result.direction,
            historyClientOperationId:result.historyClientOperationId,pageId,expectedElements:result.expectedLocal,objects:result.objects})
        if(current.id===pageId&&active())setView(v=>{
          const next={...v,status:result.rejectedCount?'error':'saved',errorMessage:result.rejectedCount?'서버가 거절한 편집은 기기에 보관했어요. 나머지 편집은 동기화했어요.':null,history:result.history,pageId}
          // 바뀐 것이 없으면 같은 상태를 돌려줘 편집 화면을 다시 그리지 않는다
          return v.status===next.status&&v.errorMessage===next.errorMessage&&v.pageId===pageId&&JSON.stringify(v.history)===JSON.stringify(next.history)?v:next
        })
        if(imported)await engine.acceptImport(result.objects)
        return result
        } finally { r.flushAcks();finishTiming() } // 조기 반환·실패 경로에서도 전송 확인을 남기지 않는다
      }
      const job=r.tail.catch(()=>{}).then(work);r.tail=job
      if(!direction){
        r.pending.set(pageId,job)
        job.finally(()=>{
          r.pending.delete(pageId)
          if(r.again.delete(pageId)&&active())r.sync(pageId)
        }).catch(()=>{})
      }
      if(!direction)job.catch(error=>{r.flushAcks();if(active()&&latest.current.page.id===pageId)setView(v=>({...v,status:error.status===409?'conflict':'error',errorMessage:failureMessage(error),pageId}))})
      return job
    }
    const refresh=()=>{if(active()){r.sync(latest.current.page.id);refreshPagesQuietly()}}
    const socket=connectCollaboration({baseUrl:apiBaseUrl,diaryId:diary.id,isActive:active,allowDevelopmentHttp:typeof __DEV__!=='undefined'&&__DEV__,
      onDiagnostic:diagnostics.socket,
      makeSocket:url=>Platform?.OS==='web'?new globalThis.WebSocket(url):new globalThis.WebSocket(url,[],{headers:headersFor(url)}),
      getAccessToken:({forceRefresh=false}={})=>authService.getAccessToken({userId:diary.memberAccountId,sessionKey,forceRefresh}),
      onReady:()=>{diagnostics.event('ws-ready');api.invalidateMembership?.();collaborationStateChange.current(diary.sharedDiaryId||diary.id,true);refresh()},onUnavailable:()=>{diagnostics.event('ws-unavailable');collaborationStateChange.current(diary.sharedDiaryId||diary.id,false)},onPagesChanged:refreshPagesQuietly,onMembersChanged:()=>{api.invalidateMembership?.();membersChanged.current()},onPresence:ids=>{if(active())setOnlineUserIds(current=>ids&&current&&current.length===ids.length&&current.every((id,i)=>id===ids[i])?current:ids)},onChange:frame=>{
        diagnostics.event('ws-change')
        // 내 저장의 에코면 다시 조회하지 않는다(1인 다이어리는 ID 대신 내 계정이 낸 이벤트 수로 판단)
        const actor=frame.actorUserId,mine=actor!=null&&actor!==''&&diary.memberAccountId!=null&&String(actor)===String(diary.memberAccountId)
        // 그 페이지의 엔진이 먼저 판단한다(ID 일치 또는 1인 다이어리의 내 에코 소비). 명령은 페이지 엔진이 내므로 보통 여기서 끝나고,
        // 엔진이 없거나 못 알아보면 다른 엔진의 ID 일치만 본다(에코 소비는 다른 페이지 엔진이 하지 않는다).
        const owner=r.loaded.get(frame.pageId)
        if(owner?.claimsChange?.(frame.clientOperationId,mine)||[...r.loaded.values()].some(engine=>engine!==owner&&engine.ownsCommand(frame.clientOperationId)))return
        if(frame.pageId===latest.current.page.id)refresh()
        else if(latest.current.state.doc.pages.some(p=>p.id===frame.pageId))r.sync(frame.pageId)
        else refreshPagesQuietly()
      }})
    // Periodic reconciliation also covers an event lost after commit or a proxy without WebSocket support.
    const timer=setInterval(()=>{diagnostics.event('poll');refresh()},5000)
    const appState=AppState.addEventListener('change',next=>{if(next==='active')refresh();else dispatch({type:'commitCheckpoint'})})
    return ()=>{r.alive=false;setOnlineUserIds(null);collaborationStateChange.current(diary.sharedDiaryId||diary.id,false);setPdfSourceFetcher(null);media.dispose();socket.close();clearInterval(timer);appState.remove();if(runtime.current===r)runtime.current=null}
  },[enabled,loaded,diary?.id,diary?.memberAccountId,sessionKey])
  useEffect(()=>{
    const r=runtime.current;if(!r||!enabled||!loaded)return
    setView(v=>({...v,status:'loading',history:null,pageId:page.id}))
    r.sync(page.id)
  },[enabled,loaded,page.id,sessionKey])
  // 새로 만든 PDF 다이어리: 보고 있지 않은 쪽도 바탕 그림과 원본 PDF 를 서버에 올려 친구 화면에 빈 쪽이 보이지 않게 한다(한 쪽씩 차례로).
  useEffect(()=>{
    const r=runtime.current;if(!r||!enabled||!loaded)return
    let stop=false
    ;(async()=>{
      for(const p of latest.current.state.doc.pages){
        if(stop||!r.alive)return
        if(needsPdfSeed(p))await r.sync(p.id).catch(()=>{})
      }
    })()
    return ()=>{stop=true}
  },[enabled,loaded,diary?.id,sessionKey])
  useEffect(()=>{
    const r=runtime.current;if(!r||!enabled)return
    for(const entry of state.collaborationEdits??[]){
      if(r.claimed.has(entry.id))continue;r.claimed.add(entry.id)
      r.engineFor(entry.pageId,entry.before).then(async engine=>{
        if(!engine)return
        await engine.enqueue(entry)
        if(!r.alive||authService.getSessionKey()!==sessionKey)return
        // 전송 확인은 동기화 결과와 같은 커밋으로 모아 보낸다(획마다 전체 화면을 한 번 더 그리지 않게). claimed 는 확인을 보낼 때 푼다.
        r.acks.push(entry.id);r.sync(entry.pageId)
      }).catch(()=>{r.claimed.delete(entry.id);if(r.alive)setView(v=>({...v,status:'local-error'}))})
    }
  },[state.collaborationEdits,enabled,sessionKey])
  const control=async direction=>{
    const r=runtime.current;if(!r||r.busy)return
    dispatch({type:'commitCheckpoint'});r.busy=true;setView(v=>({...v,busy:true}))
    try{
      // An in-progress gesture must be committed and durably queued before the history request.
      if(latest.current.state.collaborationGesture||(latest.current.state.collaborationEdits??[]).some(e=>e.pageId===page.id))
        throw new Error('현재 작업이 저장된 뒤 다시 눌러 주세요.')
      return await r.sync(page.id,direction)
    }catch(error){if(r.alive)setView(v=>({...v,status:error.status===409?'conflict':'error',errorMessage:failureMessage(error)}));throw error}
    finally{r.busy=false;if(r.alive)setView(v=>({...v,busy:false}))}
  }
  return {enabled,onlineUserIds:enabled?onlineUserIds:null,loadPageSettings:id=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.loadPageSettings(id)},updatePage:(id,body)=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.updatePage(id,body)},movePage:(id,toIndex)=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.movePage(id,toIndex)},movePages:(ids,anchorId,place)=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.movePages(ids,anchorId,place)},copyPage:id=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.copyPage(id)},removePages:ids=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.removePages(ids)},addPage:backgroundAssetId=>{if(!runtime.current)throw Error('서버 연결을 확인한 뒤 다시 시도해 주세요.');return runtime.current.addPage(backgroundAssetId)},addPdfPages:pages=>{if(!runtime.current)throw Error('서버 연결을 확인한 뒤 다시 시도해 주세요.');return runtime.current.addPdfPages(pages)},status:enabled?view.status:null,errorMessage:view.errorMessage,busy:view.busy,
    canUndo:view.pageId===page.id&&!!view.history?.nextUndo,canRedo:view.pageId===page.id&&!!view.history?.nextRedo,
    undo:()=>control('undo'),redo:()=>control('redo'),retry:()=>runtime.current?.sync(page.id)}
}
