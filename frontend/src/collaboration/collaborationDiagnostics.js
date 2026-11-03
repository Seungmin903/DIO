// Deliberately exclude IDs, URLs, headers, bodies and error messages.
export function createCollaborationDiagnostics({ enabled = false, now = Date.now, emit = value => console.info('[collaboration-perf]', JSON.stringify(value)) } = {}) {
  const report = value => { if (enabled) { try { emit(value) } catch {} } }
  const elapsed = start => Math.max(0, Math.round(now() - start))
  return {
    socket({stage,code}={}) { if(['construct-failed','auth-failed','open','closed-ready','closed-before-ready','handshake-http'].includes(stage)) report({event:'ws-detail',stage,...(Number.isInteger(code)&&(stage==='handshake-http'?code>=100&&code<=599:code>=1000&&code<=4999)?{code}:{})}) },
    event(name) { if (['ws-ready','ws-unavailable','ws-change','poll'].includes(name)) report({ event:name }) },
    startSync() { const queued=now(); return () => { const started=now(); return () => report({event:'sync',waitMs:Math.max(0,Math.round(started-queued)),durationMs:elapsed(started)}) } },
    transport(request) {
      if (!enabled) return request
      return async options => {
        const start=now(), route=String(options.path??'').split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'{id}')
        // Only fixed canvas routes can be logged.
        const safe=/^\/(?:diaries\/\{id\}\/(?:members|pages)|pages\/\{id\}(?:\/(?:elements|history\/me|canvas-operations|undo|redo))?)$/.test(route)?route:'other'
        try { const result=await request(options); report({event:'http',method:options.method??'GET',route:safe,durationMs:elapsed(start),ok:true});return result }
        catch(error) { report({event:'http',method:options.method??'GET',route:safe,durationMs:elapsed(start),ok:false});throw error }
      }
    },
  }
}
