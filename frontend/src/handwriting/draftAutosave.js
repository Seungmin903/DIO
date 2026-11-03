// Coalesce immutable draft snapshots outside active ink. Explicit flush is durable.
export function createDraftAutosave({save,onStatus=()=>{},delay=400,schedule=setTimeout,cancel=clearTimeout}) {
  let payload,revision=0,saved=0,timer=null,running=null,writing=false,disposed=false,error=null
  const status = () => { if (!disposed) onStatus({pending:saved<revision&&!error,error:error?.message??''}) }
  const stop = () => { if(timer!==null){cancel(timer);timer=null} }
  const queue = () => {
    stop()
    if(!disposed&&!writing&&!running&&saved<revision&&!error)
      timer=schedule(()=>{timer=null;start().catch(()=>{})},delay)
  }
  const start = () => {
    if(running)return running
    if(saved===revision)return Promise.resolve()
    const version=revision,snapshot=payload
    error=null;status()
    running=Promise.resolve().then(()=>save(snapshot)).then(()=>{saved=version;status()},e=>{error=e;status();throw e}).finally(()=>{running=null;queue()})
    return running
  }
  const flush = async () => {
    stop()
    while(running||saved<revision){await (running??start());stop()}
  }
  return {
    activate(){disposed=false;status();queue()},
    update(next){if(disposed)return;payload=next;revision++;error=null;status();queue()},
    setWriting(value){writing=value;if(value)stop();else queue()},
    flush,
    dispose(){disposed=true;stop();return flush()},
  }
}
