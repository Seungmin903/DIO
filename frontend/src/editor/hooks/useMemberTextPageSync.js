import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createAuthenticatedMemberTransport } from '../../diary/services/memberTransport.js'
import { createTextPageSync, createTextPageSession } from '../../diary/services/textPageSync.js'
import { memberDocumentKey } from '../../diary/services/memberStorage.js'

export function useMemberTextPageSync({ diary, page, loaded, readOnly, dispatch }) {
  const [status,setStatus]=useState(null), [retry,setRetry]=useState(0)
  const engine=useRef(null), latest=useRef(page), ready=useRef(false)
  latest.current=page
  const member=diary?.source==='member-api' && !readOnly
  const sessionKey=authService.getSessionKey()
  useEffect(()=>{
    if(!member || !loaded) return
    let alive=true
    ready.current=false; setStatus('loading')
    const expected=latest.current.objects
    const active=()=>alive && authService.getSessionKey()===sessionKey
    const api=createTextPageSync(createAuthenticatedMemberTransport({auth:authService,accountId:diary.memberAccountId,baseUrl:apiBaseUrl,accessTokenHeader,fetchImpl:memberFetch}))
    const session=createTextPageSession({api,storage:AsyncStorage,key:`${memberDocumentKey(diary)}:text-sync:v1:${page.id}`,pageId:page.id,diaryId:diary.id,isActive:active})
    engine.current=session
    session.restore().then(recovered=>{
      if(!active()) return
      if(latest.current.objects!==expected) {setStatus('conflict');return}
      if(recovered!==null){
        dispatch({type:'importPageTexts',pageId:page.id,expectedObjects:expected,objects:recovered})
      }
      ready.current=true; setRetry(n=>n+1)
    }).catch(()=>{if(active())setStatus('local-error')})
    return ()=>{alive=false;ready.current=false;if(engine.current===session)engine.current=null}
  },[member,loaded,diary?.id,diary?.memberAccountId,page.id,sessionKey])
  useEffect(()=>{
    const session=engine.current
    if(!member || !loaded || !ready.current || !session) return
    let alive=true, timer
    const expected=page.objects
    // Persist immediately, independently from the ordinary editor save debounce.
    session.record(expected).then(()=>{
      if(!alive) return
      setStatus('saving')
      timer=setTimeout(()=>{
        session.synchronize().then(async result=>{
          if(engine.current!==session || authService.getSessionKey()!==sessionKey) return
          if(result.objects) {
            const current=latest.current.objects
            const texts=objects=>JSON.stringify(objects.filter(o=>o.type==='text'))
            if(texts(current)!==texts(expected)) {
              try { await session.retainLocal(current) }
              catch(error) { if(engine.current===session) setStatus(error.status===409?'conflict':'local-error'); return }
              if(engine.current===session) setStatus('saving')
              return
            }
            dispatch({type:'importPageTexts',pageId:page.id,expectedObjects:current,objects:result.objects})
          } else if(!alive) return
          setStatus(result.status==='pending'?'saving':'saved')
          if(result.status==='pending') setRetry(n=>n+1)
        }).catch(error=>{if(alive)setStatus(error.status===409?'conflict':'error')})
      },500)
    }).catch(error=>{if(alive)setStatus(error.status===409?'conflict':'local-error')})
    return ()=>{alive=false;clearTimeout(timer)}
  },[page.objects,page.id,retry,member,loaded])
  return {status:member?status:null,retry:()=>setRetry(n=>n+1)}
}
