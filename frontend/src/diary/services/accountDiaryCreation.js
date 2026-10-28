import { accountDiaryCreateInput } from './authenticatedDiaryApi.js';

// Pending intent is account-scoped and durable before HTTP; never stores an access token.
export function createAccountDiaryCreation(api, { storage, userId, makeKey }) {
  const storageKey=`dio:account-diary-creation:v1:${userId}`;
  let state={status:'loading',input:null,result:null,error:null,canRetry:false}, pending=null, active=null, alive=true, revision=0;
  const listeners=new Set();
  const publish=next=>{if(alive){state=next;listeners.forEach(fn=>fn());}};
  const failure=(error,input)=>({status:'error',input,result:null,error,canRetry:![400,401,403,409,422].includes(error.status)});
  const perform=()=>{
    if(active)return active;
    const run=revision, intent=pending;
    publish({status:'saving',input:intent.input,result:null,error:null,canRetry:false});
    active=(async()=>{
      try{
        await storage.setItem(storageKey,JSON.stringify(intent));
        if(!alive||run!==revision)return;
        const result=await api.create(intent.input,{requestId:intent.key});
        if(!alive||run!==revision)return;
        // Failure to clear a receipt is recoverable with the SAME key, never a fresh create.
        await storage.removeItem(storageKey);
        if(!alive||run!==revision)return;
        pending=null;publish({status:'success',input:null,result,error:null,canRetry:false});
      }catch(error){if(alive&&run===revision)publish(failure(error,intent.input));}
      finally{if(run===revision)active=null;}
    })();return active;
  };
  return {
    getSnapshot:()=>state, subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    async load(){
      alive=true;const run=++revision;active=null;
      try{
        const saved=await storage.getItem(storageKey);if(!alive||run!==revision)return;
        if(saved){
          pending=JSON.parse(saved);
          if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pending?.key))throw Error('저장한 요청 정보를 확인하지 못했어요.');
          accountDiaryCreateInput(pending.input);
          publish(failure(Error('이전에 보낸 요청이 있어요. 같은 요청으로 생성 결과를 확인해 주세요.'),pending.input));
        }else{pending=null;publish({status:'idle',input:null,result:null,error:null,canRetry:false});}
      }catch(error){if(alive&&run===revision)publish({status:'blocked',input:null,result:null,error,canRetry:false});}
    },
    run(input){
      if(active)return active;
      if(!alive||state.status==='loading'||state.status==='blocked')return Promise.resolve();
      if(pending)return Promise.resolve();
      accountDiaryCreateInput(input);
      pending={key:makeKey(),input:JSON.parse(JSON.stringify(input))};return perform();
    },
    retry(){if(!pending||!state.canRetry||!alive)return Promise.resolve();return perform();},
    // Explicit user action after checking the library; never used automatically on errors/logout.
    async discard(){
      if(active)return;
      const run=revision;
      try{await storage.removeItem(storageKey);if(!alive||run!==revision)return;pending=null;publish({status:'idle',input:null,result:null,error:null,canRetry:false});}
      catch(error){publish({status:'blocked',input:null,result:null,error,canRetry:false});}
    },
    dispose(){alive=false;revision++;listeners.clear();},
  };
}
