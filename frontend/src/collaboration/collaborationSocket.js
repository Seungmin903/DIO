export function collaborationSocketUrl(baseUrl,diaryId,allowDevelopmentHttp=false){
  const url=new URL(baseUrl)
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!/^[0-9a-f-]{36}$/i.test(diaryId))throw new Error('공동 편집 서버 설정을 확인해 주세요.')
  if(url.protocol==='http:'&&!allowDevelopmentHttp&&!['localhost','127.0.0.1','[::1]','10.0.2.2'].includes(url.hostname))throw new Error('안전한 공동 편집 서버 주소가 필요해요.')
  url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=`/ws/diaries/${diaryId}`;return url.toString()
}
export function connectCollaboration({baseUrl,diaryId,getAccessToken,onChange,onPagesChanged=()=>{},onMembersChanged=()=>{},onReady=()=>{},onUnavailable=()=>{},onDiagnostic=()=>{},isActive=()=>true,allowDevelopmentHttp=false,makeSocket=null,WebSocketImpl=globalThis.WebSocket,schedule=setTimeout,cancel=clearTimeout}){
  const diagnostic=(stage,code)=>{try{onDiagnostic({stage,...(Number.isInteger(code)?{code}:{})})}catch{}}
  let socket=null,stopped=false,reconnect=null,heartbeat=null,backoff=1000,connection=0,policyRetries=0,recoverAuth=false
  const active=id=>!stopped&&isActive()&&id===connection
  const later=(fn,delay)=>schedule(fn,delay)
  const start=()=>{
    if(stopped||!isActive()||!WebSocketImpl)return
    const id=++connection
    let unavailableReported=false
    const unavailable=()=>{if(!active(id)||unavailableReported)return;unavailableReported=true;onUnavailable()}
    try{const url=collaborationSocketUrl(baseUrl,diaryId,allowDevelopmentHttp);socket=makeSocket?makeSocket(url):new WebSocketImpl(url)}catch{diagnostic('construct-failed');unavailable();return}
    const target=socket;let sentToken=null,ready=false
    const authenticate=async()=>{try{const token=await getAccessToken({forceRefresh:recoverAuth});if(!active(id)||target.readyState!==1)return
      recoverAuth=false
      if(token!==sentToken){target.send(JSON.stringify({type:'AUTH',accessToken:token}));sentToken=token}
      else target.send(JSON.stringify({type:'PING'}))
    }catch{if(active(id)){diagnostic('auth-failed');target.close()}}}
    const tick=()=>{heartbeat=later(async()=>{await authenticate();if(active(id))tick()},15000)}
    target.onopen=()=>{if(!active(id)){target.close();return}diagnostic('open');authenticate();tick()}
    target.onmessage=event=>{
      if(!active(id)||typeof event.data!=='string'||event.data.length>8192)return
      let frame;try{frame=JSON.parse(event.data)}catch{return}
      if(frame.type==='READY'&&frame.diaryId===diaryId){ready=true;policyRetries=0;backoff=1000;onReady()}
      else if(ready&&frame.type==='PAGES_CHANGED'&&frame.diaryId===diaryId)onPagesChanged()
      else if(ready&&frame.type==='MEMBERS_CHANGED'&&frame.diaryId===diaryId)onMembersChanged()
      else if(ready&&frame.type==='PAGE_CHANGED'&&/^[0-9a-f-]{36}$/i.test(frame.pageId)&&typeof frame.operationId==='string')onChange(frame)
    }
    target.onerror=unavailable
    target.onclose=event=>{
      if(!active(id))return
      diagnostic(ready?'closed-ready':'closed-before-ready',event.code)
      // Android exposes the failed Upgrade response in close.reason. Extract
      // only its numeric status; never log the raw native error or URL.
      if(!ready&&typeof event.reason==='string'){
        const status=event.reason.match(/Expected HTTP 101 response but was ['"]?(\d{3})\b/)
        if(status)diagnostic('handshake-http',Number(status[1]))
      }
      cancel(heartbeat);unavailable()
      if(event.code===1008){
        // Expiry and revoked access share 1008. Retry authentication at most twice
        // without READY; a revoked member cannot reconnect forever.
        if(++policyRetries>2){stopped=true;return}
        recoverAuth=true
      }
      reconnect=later(start,backoff);backoff=Math.min(30000,backoff*2)
    }
  }
  start()
  return {close(){stopped=true;connection++;cancel(reconnect);cancel(heartbeat);socket?.close()}}
}
