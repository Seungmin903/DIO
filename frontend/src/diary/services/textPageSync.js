const copy = value => JSON.parse(JSON.stringify(value))
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const fail = message => { throw new Error(message) }
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
const conflict = () => Object.assign(new Error('서버와 이 기기의 텍스트가 달라 자동으로 덮어쓰지 않았어요.'), { status: 409 })
export function assessInitialTextSync(localObjects, serverElements) {
  const local = localObjects.filter(object => object.type === 'text'), remote = serverElements.filter(element => element.elementType === 'TEXT')
  return { status: local.length && remote.length ? 'conflict' : local.length ? 'upload' : 'download', local: copy(local), remote: copy(remote) }
}
export function encodeText(object) {
  const { id, type, x, y, w, h, rotation = 0, opacity = 1, locked = false, hidden = false, ...properties } = object
  if (!uuid(id) || type !== 'text' || ![x,y,w,h,rotation,opacity].every(Number.isFinite) || w <= 0 || h <= 0) fail('텍스트 요소를 확인하지 못했어요.')
  const round = n => Math.round(n * 1000) / 1000
  return { elementId: id, elementType: 'TEXT', x: round(x), y: round(y), width: Math.max(.001,round(w)), height: Math.max(.001,round(h)), rotation: round(rotation), opacity: round(opacity), isLocked: locked, isHidden: hidden, propertiesJson: copy(properties) }
}
export function decodeText(element) {
  if (!uuid(element.elementId) || element.elementType !== 'TEXT' || ![element.x,element.y,element.width,element.height,element.version].every(Number.isFinite) || !Number.isSafeInteger(element.version) || element.version < 0 || element.width <= 0 || element.height <= 0 || !element.propertiesJson || typeof element.propertiesJson !== 'object' || Array.isArray(element.propertiesJson)) fail('서버 텍스트를 확인하지 못했어요.')
  return { ...copy(element.propertiesJson), id: element.elementId, type: 'text', x: element.x, y: element.y, w: element.width, h: element.height, rotation: element.rotation ?? 0, opacity: element.opacity ?? 1, locked: element.isLocked ?? false, hidden: element.isHidden ?? false }
}
const content = elements => elements.map(e => encodeText(decodeText(e))).sort((a,b) => a.elementId.localeCompare(b.elementId))
const same = (a,b) => stable(a) === stable(b)
const sameRemote = (a,b) => same(content(a),content(b)) && same(a.map(e=>[e.elementId,e.version]).sort(), b.map(e=>[e.elementId,e.version]).sort())
export function createTextPageSync(transport) {
  const path = pageId => `/pages/${encodeURIComponent(pageId)}`
  const texts = rows => { if (!Array.isArray(rows)) fail('페이지 응답을 확인하지 못했어요.'); const result = rows.filter(e=>e.elementType==='TEXT'); result.forEach(decodeText); if(new Set(result.map(e=>e.elementId)).size!==result.length) fail('중복 텍스트 응답이에요.'); return copy(result) }
  return {
    async load(pageId, diaryId) {
      const result = await transport({ path: path(pageId) })
      if (result?.page?.pageId !== pageId || (diaryId && result.page.diaryId !== diaryId)) fail('페이지 응답을 확인하지 못했어요.')
      return texts(result.elements)
    },
    async batch(pageId, body) { return texts((await transport({method:'POST',path:`${path(pageId)}/elements/batch`,body})).items) },
    async save(pageId, object, version) {
      const {elementType, ...data}=encodeText(object)
      return transport({ method: version == null ? 'POST':'PATCH', path: version == null ? `${path(pageId)}/elements`:`${path(pageId)}/elements/${encodeURIComponent(object.id)}`, body: version == null ? {...data,elementType}: {...data,version} })
    },
  }
}
// Durable write-ahead journal, independent of the editor's debounced document save.
// Each page/account has its own key. No network request runs before local storage.
export function createTextPageSession({ api, storage, key, pageId, diaryId, isActive = () => true }) {
  let journal = { revision: 1, pageId, diaryId, local: null, base: null, deleted: [], pending: null }, writes=Promise.resolve(), running=null
  const active = () => { if(!isActive()) throw new Error('편집 세션이 종료됐어요.') }
  const persist = () => { const raw=JSON.stringify(journal); const task=writes.catch(()=>{}).then(()=>storage.setItem(key,raw)); writes=task; return task }
  const normalized = objects => objects.map(encodeText).sort((a,b)=>a.elementId.localeCompare(b.elementId))
  const record = async objects => {
    active()
    const local=copy(objects.filter(o=>o.type==='text'))
    // A downloaded snapshot must reach the editor before its old contents can
    // become a new upload/delete request. Persist this barrier across restarts.
    if(journal.awaitingImport && !same(normalized(local),normalized(journal.local))) throw conflict()
    journal.awaitingImport=false
    journal.local=local
    return persist()
  }
  return {
    async restore() {
      const raw=await storage.getItem(key); active()
      if(raw){const saved=JSON.parse(raw);if(saved.revision!==1 || saved.pageId!==pageId || saved.diaryId!==diaryId || !Array.isArray(saved.local) || (saved.base!==null&&!Array.isArray(saved.base)) || !Array.isArray(saved.deleted)) fail('이 기기의 서버 연결 기록을 확인하지 못했어요.'); journal=saved}
      return copy(journal.local)
    },
    record,
    async retainLocal(objects) {
      active()
      journal.local=copy(objects.filter(o=>o.type==='text'))
      journal.awaitingImport=false
      // Keep the downloaded server snapshot as the comparison base. The next
      // sync can now send the user's retained local edits as a normal update.
      await persist()
    },
    synchronize() {
      if(running) return running
      running=(async()=>{
        await writes; active()
        let remote=await api.load(pageId,diaryId); active()
        if(journal.pending){
          const p=journal.pending
          if(same(content(remote),p.after)){ journal.base=remote; journal.deleted=p.deleted; journal.pending=null; await persist() }
          else if(sameRemote(remote,p.before)){journal.pending=null;await persist()}
          else throw conflict()
        }
        if(journal.base===null){
          if(journal.local.length && remote.length) throw conflict()
          journal.base=remote
          if(!journal.local.length && remote.length){ journal.local=remote.map(decodeText); journal.awaitingImport=true; await persist(); return {objects:copy(journal.local),status:'downloaded'} }
          await persist()
        } else if(!sameRemote(remote,journal.base)) {
          const local = journal.local.map(encodeText).sort((a,b)=>a.elementId.localeCompare(b.elementId))
          if (!same(local,content(journal.base))) throw conflict()
          journal.base=remote; journal.local=remote.map(decodeText); journal.awaitingImport=true; await persist()
          return {objects:copy(journal.local),status:'downloaded'}
        }
        // Restore deleted text first: the backend applies batch updates before restores.
        const restores=journal.local.filter(o=>journal.deleted.includes(o.id)).map(o=>o.id)
        const send=async(body,after,deleted)=>{
          const before=journal.base
          journal.pending={before,after,deleted}; await persist(); active()
          const result=await api.batch(pageId,body); active()
          if(!same(content(result),after)) throw conflict()
          journal.base=result; journal.deleted=deleted; journal.pending=null; await persist(); return result
        }
        if(restores.length){
          // Re-read the restored originals on the next sync; keep the pending
          // request across failure rather than guessing that a new POST is safe.
          // The restored values are retained when deleting below.
          const after=content(remote).concat(restores.map(id=>journal.deletedObjects[id])).sort((a,b)=>a.elementId.localeCompare(b.elementId))
          remote=await send({restoreElementIds:restores},after,journal.deleted.filter(id=>!restores.includes(id)))
        }
        const target=copy(journal.local), desired=target.map(encodeText), byId=new Map(remote.map(e=>[e.elementId,e]))
        const creates=desired.filter(e=>!byId.has(e.elementId)), updates=desired.filter(e=>byId.has(e.elementId)&&!same(e,encodeText(decodeText(byId.get(e.elementId))))).map(({elementType,...e})=>({...e,version:byId.get(e.elementId).version}))
        const ids=new Set(target.map(o=>o.id)), deletes=remote.filter(e=>!ids.has(e.elementId)).map(e=>e.elementId)
        if(creates.length+updates.length+deletes.length){
          if(Math.max(creates.length,updates.length,deletes.length)>100) fail('한 페이지의 텍스트 변경은 한 번에 100개까지 연결할 수 있어요.')
          journal.deletedObjects??={}; for(const id of deletes) journal.deletedObjects[id]=encodeText(decodeText(byId.get(id)))
          await send({creates,updates,deleteElementIds:deletes},desired.sort((a,b)=>a.elementId.localeCompare(b.elementId)),[...new Set([...journal.deleted,...deletes])])
        }
        return {status:same(target,journal.local)?'saved':'pending'}
      })().finally(()=>{running=null})
      return running
    },
  }
}
