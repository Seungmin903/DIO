// 한 프로세스에서 계정 전환과 설치 변경이 저장소를 동시에 덮어쓰지 않도록 직렬화한다.
let queue = Promise.resolve();
const serial = operation => { const next = queue.then(operation, operation); queue = next.catch(() => {}); return next; };

export function createPushCoordinator({ auth, userId, api, native, uuid, platform }) {
  const sessionKey=auth.getSessionKey();
  const check=()=>{if(!sessionKey || auth.getSessionKey()!==sessionKey) throw new Error('PUSH_SESSION_CHANGED');};
  let bound=false;
  async function read() { const raw=await native.read();if(!raw)return null;try{return JSON.parse(raw);}catch{throw new Error('PUSH_STORAGE_CORRUPT');} }
  async function save(value){await native.save(JSON.stringify(value));}
  return { sync:()=>serial(async()=>{
    check(); const device=await native.requestToken();check();
    const settings={provider:'EXPO',platform,permission:device.permission,pushToken:device.token,enabled:device.permission==='GRANTED' && !!device.token};
    let state=await read();check();
    if(!state){state={installationId:uuid(),requestId:uuid(),registrationSettings:settings,registrationUser:String(userId)};await save(state);check();}
    if(!state.secret){
      // 앱이 "같은 상태"의 안내를 한 번만 띄울 수 있게 설치 · 원래 계정을 붙인다(pushIssue.js, S15P31F106-719)
      if(state.registrationUser!==String(userId))throw Object.assign(new Error('PUSH_RECOVERY_REQUIRES_ORIGINAL_ACCOUNT'),{installationId:state.installationId,registrationUser:state.registrationUser});
      let result;
      try { result=await api.register({installationId:state.installationId,requestId:state.requestId,settings:state.registrationSettings}); }
      catch(error) {
        if(error?.status!==410 && !(error?.status===404 && error?.message==='PUSH_INSTALLATION_NOT_FOUND'))throw error;
        // 만료 또는 고아 응답은 다시 복호화할 수 없다. 동일 계정의 기존 토큰만 서버가 이전한다.
        state={installationId:uuid(),requestId:uuid(),registrationSettings:settings,registrationUser:String(userId)};
        await save(state);check();
        result=await api.register({installationId:state.installationId,requestId:state.requestId,settings:state.registrationSettings});
      }
      if(result?.installationId!==state.installationId || typeof result.installationSecret!=='string' || !/^\d+$/.test(result.bindingVersion))throw new Error('PUSH_INVALID_RESPONSE');
      state={...state,secret:result.installationSecret,bindingVersion:result.bindingVersion};await save(state);check();
      // 복구 응답은 다른 세션에 묶인 비활성 설치일 수 있다. 항상 현재 상태를 확인한다.
    }
    if(!bound){
      const current=await api.inspect(state.installationId,state.secret);check();
      if(!/^\d+$/.test(current?.bindingVersion || ''))throw new Error('PUSH_INVALID_RESPONSE');
      const result=await api.bind(state.installationId,state.secret,{requestId:uuid(),bindingVersion:current.bindingVersion});check();
      if(!/^\d+$/.test(result?.bindingVersion || ''))throw new Error('PUSH_INVALID_RESPONSE');
      state={...state,bindingVersion:result.bindingVersion};await save(state);check();bound=true;
    }
    const current=await api.inspect(state.installationId,state.secret);check();
    const result=await api.update(state.installationId,state.secret,{requestId:uuid(),bindingVersion:current.bindingVersion,settings});check();
    if(!/^\d+$/.test(result?.bindingVersion || '') || typeof result?.enabled!=='boolean')throw new Error('PUSH_INVALID_RESPONSE');
    state={...state,bindingVersion:result.bindingVersion,registrationUser:String(userId),registrationSettings:null};await save(state);check();
    return { permission:device.permission, enabled:result.enabled };
  }).catch(error=>{if(error?.message==='PUSH_BINDING_CONFLICT')bound=false;throw error;}) };
}
