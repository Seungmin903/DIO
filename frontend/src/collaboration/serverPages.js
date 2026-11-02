import {localTemplateReference,SERVER_TEMPLATE_CATALOG,serverTemplateSelectable} from '../editor/templates/serverCatalog.js'
import {decodeElement,sharedElement} from './canvasElements.js'
import {pageSettingsBody} from './pageSettings.js'
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const invalid=()=>Object.assign(new Error('서버의 페이지와 속지 정보를 확인하지 못했어요. 기존 기기 문서는 유지돼요.'),{code:'INVALID_SERVER_PAGES'})
export function decodeServerPage(detail,diaryId){
 const p=detail?.page
 if(!p||!uuid(p.pageId)||p.diaryId!==diaryId||!Array.isArray(detail.elements)||![p.canvasWidth,p.canvasHeight].every(n=>Number.isFinite(n)&&n>0))throw invalid()
 const code=p.templateCode??p.templateConfig?.templateCode,version=p.templateVersion??p.templateConfig?.templateVersion
 let reference
 if(code&&version){try{reference=localTemplateReference(code,version)}catch{throw invalid()}}
 else if(p.templateId==null||p.templateConfig?.blank===true)reference={backgroundAssetId:null}
 else throw invalid()
 const elements=detail.elements.filter(sharedElement)
 if(elements.some(e=>e.pageId!==p.pageId)||new Set(elements.map(e=>e.elementId)).size!==elements.length)throw invalid()
 return {...reference,id:p.pageId,title:p.title,canvasWidth:p.canvasWidth,canvasHeight:p.canvasHeight,
  serverTemplateId:p.templateId??null,serverTemplateConfig:p.templateConfig??{},
  gridVisible:p.gridVisible===true,gridColor:p.gridColor??'#DCE5F1',
  ...(p.templateConfig?.paperAppearance?{paperAppearance:p.templateConfig.paperAppearance}:{}),objects:elements.map(decodeElement)}
}
// Settings metadata must not depend on decoding a template or canvas elements.
// An unsupported template on an existing page leaves its local appearance intact.
function pageListSettings(p){
 const settings={id:p.pageId}
 if(p.title===null||typeof p.title==='string')settings.title=p.title
 if([p.canvasWidth,p.canvasHeight].every(n=>Number.isFinite(n)&&n>0)){
  settings.canvasWidth=p.canvasWidth;settings.canvasHeight=p.canvasHeight
 }
 if(typeof p.gridVisible==='boolean')settings.gridVisible=p.gridVisible
 if(typeof p.gridColor==='string'&&/^#[0-9a-f]{6}$/i.test(p.gridColor))settings.gridColor=p.gridColor
 if(settings.canvasWidth===undefined)return settings
 const code=p.templateCode??p.templateConfig?.templateCode,version=p.templateVersion??p.templateConfig?.templateVersion
 let reference
 if(code&&version){try{reference=localTemplateReference(code,version)}catch{return settings}}
 else if(p.templateId==null||p.templateConfig?.blank===true)reference={backgroundAssetId:null}
 else return settings
 return {...settings,...reference,serverTemplateId:p.templateId??null,serverTemplateConfig:p.templateConfig??{},
  ...(p.templateConfig?.paperAppearance?{paperAppearance:p.templateConfig.paperAppearance}:{})}
}
function readPageSettings(response,diaryId,pageId){
 const p=response?.page
 if(!p||p.pageId!==pageId||p.diaryId!==diaryId||![p.canvasWidth,p.canvasHeight].every(n=>Number.isFinite(n)&&n>0))throw invalid()
 return pageListSettings(p)
}
// Existing pages are not re-imported: unsent strokes and local media remain intact.
export async function loadServerPageSnapshot(transport,diaryId,{knownIds=[]}={}){
 if(!uuid(diaryId))throw invalid()
 const result=await transport({path:`/diaries/${diaryId}/pages`})
 if(!Array.isArray(result?.items)||result.items.some(p=>!uuid(p.pageId)||p.diaryId!==diaryId)||new Set(result.items.map(p=>p.pageId)).size!==result.items.length)throw invalid()
 const known=new Set(knownIds),rows=result.items.filter(p=>!known.has(p.pageId)),pages=new Array(rows.length);let next=0
 const worker=async()=>{while(next<rows.length){
  const index=next++,row=rows[index],detail=await transport({path:`/pages/${row.pageId}`})
  if(detail?.page?.pageId!==row.pageId)throw invalid()
  pages[index]=decodeServerPage(detail,diaryId)
 }}
 await Promise.all(Array.from({length:Math.min(3,pages.length)},worker))
 const settings=result.items.map(pageListSettings)
 return {pageIds:result.items.map(p=>p.pageId),pages,settings}
}
export async function updateServerPage(transport,diaryId,pageId,input){
 if(!uuid(diaryId)||!uuid(pageId))throw invalid()
 const body=pageSettingsBody(input)
 // The current backend replaces templateConfig and does not accept an expected
 // version. A client GET/merge/PATCH cannot protect concurrent appearance edits.
 if('templateConfig' in body||'templateId' in body)throw Object.assign(Error('기존 페이지의 속지 변경은 아직 지원하지 않아요.'),{code:'UNSUPPORTED_PAGE_TEMPLATE'})
 const result=await transport({method:'PATCH',path:`/pages/${pageId}`,body})
 return readPageSettings(result,diaryId,pageId)
}
export async function loadPageSettings(transport,diaryId,pageId){
 if(!uuid(diaryId)||!uuid(pageId))throw invalid()
 const detail=await transport({path:`/pages/${pageId}`})
 return readPageSettings(detail,diaryId,pageId)
}
export async function loadServerPages(transport,diaryId,options){
 const result=await loadServerPageSnapshot(transport,diaryId,options)
 if(!result.pageIds.length)throw invalid()
 return result.pages
}
export async function copyServerPage(transport,diaryId,pageId){
 if(!uuid(diaryId)||!uuid(pageId))throw invalid()
 const result=await transport({method:'POST',path:`/pages/${pageId}/copies`})
 if(!uuid(result?.page?.pageId)||result.page.diaryId!==diaryId||result.page.pageId===pageId)throw invalid()
 const detail=await transport({path:`/pages/${result.page.pageId}`})
 if(detail?.page?.pageId!==result.page.pageId)throw invalid()
 return decodeServerPage(detail,diaryId)
}
export async function deleteServerPage(transport,pageId){
 if(!uuid(pageId))throw invalid()
 try{await transport({method:'DELETE',path:`/pages/${pageId}`})}
 catch(error){if(error.status!==404||error.code!=='PAGE_NOT_FOUND')throw error}
}
export async function createServerPage({transport,diaryId,backgroundAssetId=null,orientation='landscape',paperAppearance,storage,key,createId,isActive=()=>true}){
 const check=()=>{if(!isActive())throw Object.assign(Error('계정이 바뀌어 페이지 생성을 중단했어요.'),{code:'STALE_ACCOUNT'})}
 check();if(!uuid(diaryId))throw invalid()
 const template=SERVER_TEMPLATE_CATALOG.find(t=>t.backgroundAssetId===backgroundAssetId&&(backgroundAssetId!==null||t.orientation===orientation.toUpperCase()))
 if(!serverTemplateSelectable(template))throw invalid()
 let pending=JSON.parse(await storage.getItem(key)??'null');check()
 if(pending){
  const list=await transport({path:`/diaries/${diaryId}/pages`});check()
  const row=list?.items?.find(p=>p.diaryId===diaryId&&p.templateConfig?.clientPageRequestId===pending.requestId)
  if(row){const detail=await transport({path:`/pages/${row.pageId}`});check();const page=decodeServerPage(detail,diaryId);await storage.removeItem(key);return page}
  // The existing POST reuses the same request UUID under the diary lock.
 }
 pending??={requestId:createId()}
 if(!uuid(pending.requestId))throw invalid()
 const body=pending.body??{canvasWidth:template.canvasWidth,canvasHeight:template.canvasHeight,templateConfig:{...template.defaultConfig,
  templateCode:template.templateCode,templateVersion:template.templateVersion,clientPageRequestId:pending.requestId,...(paperAppearance?{paperAppearance}:{})}}
 pending.body=body;await storage.setItem(key,JSON.stringify(pending));check()
 let response
 try{response=await transport({method:'POST',path:`/diaries/${diaryId}/pages`,body})}
 catch(error){if(error.status>=400&&error.status<500&&error.status!==408)await storage.removeItem(key);throw error}
 check();const page=decodeServerPage({...response,elements:[]},diaryId)
 await storage.removeItem(key);check();return page
}

// Keep the user's relative move, rather than submitting a stale complete page list.
export async function reorderServerPages(transport,diaryId,{ids,anchorId,place}){
 if(!uuid(diaryId)||!Array.isArray(ids)||!ids.length||ids.some(id=>!uuid(id))||new Set(ids).size!==ids.length||!uuid(anchorId)||!['before','after'].includes(place))throw invalid()
 if(ids.includes(anchorId))return
 for(let attempt=0;attempt<2;attempt++){
  const list=await transport({path:`/diaries/${diaryId}/pages`})
  if(!Array.isArray(list?.items)||list.items.some(p=>p.diaryId!==diaryId||!uuid(p.pageId))||new Set(list.items.map(p=>p.pageId)).size!==list.items.length)throw invalid()
  const order=list.items.map(p=>p.pageId),known=new Set(order)
  if(!known.has(anchorId)||ids.some(id=>!known.has(id)))throw Object.assign(Error('이동할 페이지나 기준 페이지가 변경됐어요. 목록을 확인해 주세요.'),{code:'PAGE_ORDER_CHANGED'})
  const moving=new Set(ids),rest=order.filter(id=>!moving.has(id)),at=rest.indexOf(anchorId)+(place==='after'?1:0)
  const pageIds=[...rest.slice(0,at),...ids,...rest.slice(at)]
  if(pageIds.every((id,i)=>id===order[i]))return
  try{
   const result=await transport({method:'PATCH',path:`/diaries/${diaryId}/pages/order`,body:{pageIds}})
   if(!Array.isArray(result?.items)||result.items.length!==pageIds.length||result.items.some((p,i)=>p.diaryId!==diaryId||p.pageId!==pageIds[i]))throw invalid()
   return
  }catch(error){
   if(attempt||!((error.status===400&&error.code==='INVALID_PAGE_REQUEST')||(error.status===409&&error.code==='PAGE_VERSION_CONFLICT')))throw error
   // A concurrent add/delete/reorder may have invalidated the first snapshot.
  }
 }
}
