import { useEffect, useRef, useState } from 'react'
import { AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createAuthenticatedMemberTransport } from '../../diary/services/memberTransport.js'
import { memberDocumentKey } from '../../diary/services/memberStorage.js'
import { createId } from '../utils/common.js'
import { createCanvasApi, sameElements } from '../../collaboration/canvasApi.js'
import { loadServerPageSnapshot, createServerPage, copyServerPage, deleteServerPage, reorderServerPages } from '../../collaboration/serverPages.js'
import { createCanvasSession } from '../../collaboration/canvasSession.js'
import { connectCollaboration } from '../../collaboration/collaborationSocket.js'

export function useMemberCanvasCollaboration({diary,page,state,loaded,readOnly,dispatch}){
  const enabled=diary?.source==='member-api'&&!readOnly
  const latest=useRef({page,state});latest.current={page,state}
  const runtime=useRef(null)
  const [view,setView]=useState({status:null,history:null,busy:false,pageId:null})
  const sessionKey=authService.getSessionKey()
  const failureMessage=error=>{
    const reason=error.status===401?'로그인이 만료됐어요. 다시 로그인해 주세요.':error.status===403?'이 페이지를 편집할 권한을 확인하지 못했어요.':error.status===404?'현재 페이지를 서버에서 찾지 못했어요.':error.status>=500?'서버에서 캔버스 요청을 처리하지 못했어요.':error.code==='NETWORK_ERROR'?'캔버스 요청이 서버에 도달하지 못했어요.':'기기 편집 기록이나 서버의 캔버스 응답을 확인하지 못했어요.'
    const code=typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'CANVAS_SYNC_ERROR'
    return `${reason} (${error.status||0} / ${code}) 기기 작업은 유지돼요.`
  }
  useEffect(()=>{
    if(!enabled||!loaded)return
    const r={alive:true,engines:new Map(),loaded:new Map(),tail:Promise.resolve(),claimed:new Set(),pending:new Map(),again:new Set(),busy:false}
    runtime.current=r
    const active=()=>r.alive&&authService.getSessionKey()===sessionKey
    const headersFor=url=>authService.getCollaborationHeaders?.({url,userId:diary.memberAccountId,sessionKey})??{}
    const fetchImpl=(url,options)=>{
      const extra=headersFor(url),headers={...options.headers}
      if(extra.Authorization){const bearer=headers[accessTokenHeader];headers['X-DIO-Access-Token']=accessTokenHeader==='Authorization'?bearer?.replace(/^Bearer /,''):bearer;headers.Authorization=extra.Authorization}
      return memberFetch(url,{...options,headers})
    }
    const transport=createAuthenticatedMemberTransport({auth:authService,accountId:diary.memberAccountId,baseUrl:apiBaseUrl,accessTokenHeader,fetchImpl})
    const api=createCanvasApi(transport)
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
    r.addPage=backgroundAssetId=>mutatePages(async()=>{
      dispatch({type:'commitCheckpoint'})
      const page=await createServerPage({transport,diaryId:diary.id,backgroundAssetId,
        orientation:latest.current.state.doc.orientation??'landscape',paperAppearance:latest.current.state.doc.paperAppearance,
        storage:AsyncStorage,key:`${memberDocumentKey(diary)}:page-create:v1`,createId,isActive:active})
      if(active()){r.pageIds?.add(page.id);dispatch({type:'importServerPages',pages:[page],selectId:page.id})}
      return page
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
      const work=async()=>{
        if(!active())return
        if(r.removing.has(pageId))return
        if(!r.pageIds)await r.refreshPages()
        if(!active())return
        if(!r.pageIds?.has(pageId)){await r.refreshPages();return}
        const seed=latest.current.state.doc.pages.find(p=>p.id===pageId)?.objects??[]
        const engine=await r.engineFor(pageId,seed);if(!active()||!engine)return
        if(latest.current.page.id===pageId)setView(v=>({...v,status:'saving',pageId}))
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
        if(target&&(!result.direction||sameElements(target.objects,result.expectedLocal))){
          dispatch({type:result.direction?'collaborationHistoryApplied':'importCollaborationElements',direction:result.direction,
            historyClientOperationId:result.historyClientOperationId,pageId,expectedElements:result.expectedLocal,objects:result.objects})
          await engine.acceptImport(result.objects)
        }
        if(current.id===pageId&&active())setView(v=>({...v,status:result.rejectedCount?'error':'saved',errorMessage:result.rejectedCount?'서버가 거절한 편집은 기기에 보관했어요. 나머지 편집은 동기화했어요.':null,history:result.history,pageId}))
        return result
      }
      const job=r.tail.catch(()=>{}).then(work);r.tail=job
      if(!direction){
        r.pending.set(pageId,job)
        job.finally(()=>{
          r.pending.delete(pageId)
          if(r.again.delete(pageId)&&active())r.sync(pageId)
        }).catch(()=>{})
      }
      if(!direction)job.catch(error=>{if(active()&&latest.current.page.id===pageId)setView(v=>({...v,status:error.status===409?'conflict':'error',errorMessage:failureMessage(error),pageId}))})
      return job
    }
    const refresh=()=>{if(active()){r.sync(latest.current.page.id);refreshPagesQuietly()}}
    const socket=connectCollaboration({baseUrl:apiBaseUrl,diaryId:diary.id,isActive:active,allowDevelopmentHttp:typeof __DEV__!=='undefined'&&__DEV__,
      makeSocket:url=>Platform?.OS==='web'?new globalThis.WebSocket(url):new globalThis.WebSocket(url,[],{headers:headersFor(url)}),
      getAccessToken:({forceRefresh=false}={})=>authService.getAccessToken({userId:diary.memberAccountId,sessionKey,forceRefresh}),
      onReady:refresh,onPagesChanged:refreshPagesQuietly,onChange:frame=>{
        if([...r.loaded.values()].some(engine=>engine.ownsCommand(frame.clientOperationId)))return
        if(frame.pageId===latest.current.page.id)refresh()
        else if(latest.current.state.doc.pages.some(p=>p.id===frame.pageId))r.sync(frame.pageId)
        else refreshPagesQuietly()
      }})
    // Periodic reconciliation also covers an event lost after commit or a proxy without WebSocket support.
    const timer=setInterval(refresh,5000)
    const appState=AppState.addEventListener('change',next=>{if(next==='active')refresh();else dispatch({type:'commitCheckpoint'})})
    return ()=>{r.alive=false;socket.close();clearInterval(timer);appState.remove();if(runtime.current===r)runtime.current=null}
  },[enabled,loaded,diary?.id,diary?.memberAccountId,sessionKey])
  useEffect(()=>{
    const r=runtime.current;if(!r||!enabled||!loaded)return
    setView(v=>({...v,status:'loading',history:null,pageId:page.id}))
    r.sync(page.id)
  },[enabled,loaded,page.id,sessionKey])
  useEffect(()=>{
    const r=runtime.current;if(!r||!enabled)return
    for(const entry of state.collaborationEdits??[]){
      if(r.claimed.has(entry.id))continue;r.claimed.add(entry.id)
      r.engineFor(entry.pageId,entry.before).then(async engine=>{
        if(!engine)return
        await engine.enqueue(entry)
        if(!r.alive||authService.getSessionKey()!==sessionKey)return
        dispatch({type:'collaborationAck',ids:[entry.id]});r.claimed.delete(entry.id);r.sync(entry.pageId)
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
  return {enabled,movePage:(id,toIndex)=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.movePage(id,toIndex)},movePages:(ids,anchorId,place)=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.movePages(ids,anchorId,place)},copyPage:id=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.copyPage(id)},removePages:ids=>{if(!runtime.current)throw Error('서버 연결을 확인해 주세요.');return runtime.current.removePages(ids)},addPage:backgroundAssetId=>{if(!runtime.current)throw Error('서버 연결을 확인한 뒤 다시 시도해 주세요.');return runtime.current.addPage(backgroundAssetId)},status:enabled?view.status:null,errorMessage:view.errorMessage,busy:view.busy,
    canUndo:view.pageId===page.id&&!!view.history?.nextUndo,canRedo:view.pageId===page.id&&!!view.history?.nextRedo,
    undo:()=>control('undo'),redo:()=>control('redo'),retry:()=>runtime.current?.sync(page.id)}
}
