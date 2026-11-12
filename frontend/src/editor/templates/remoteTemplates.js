// 원격 속지: 앱 배포 없이 에셋 저장소(catalog.json)에 올린 한 장짜리 속지.
// - 앱 안 ID: 'remote-<id>-<landscape|portrait>' (방향 접미사는 다른 속지와 같은 규칙)
// - 서버: 범용 속지 행 'dio-remote-<방향>'(V34) + 페이지 설정 { remoteTemplate: <id> }  (serverCatalog.js 가 바꾼다)
// - 그림: 목록 항목의 방향별 SVG 파일. 목록을 아직 못 받았으면 잠시 기다리고(waitForRemoteTemplate), 그래도 없으면 불러오기 오류다.
// 다른 속지 모듈을 가져오지 않는다(catalog.js · serverCatalog.js 가 이 파일을 가져온다).

export const REMOTE_TEMPLATE_VERSION = '1.0.0'
export const REMOTE_SERVER_CODE = orientation => `dio-remote-${orientation}`
export const REMOTE_TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const ASSET_ID = /^remote-([a-z0-9][a-z0-9-]{0,39})-(landscape|portrait)$/
const SERVER_CODE = /^dio-remote-(landscape|portrait)$/

export const remoteTemplateAssetId = (id, orientation) => `remote-${id}-${orientation}`
/** 'remote-<id>-<방향>' → { id, orientation }, 아니면 null */
export function parseRemoteTemplateAssetId(assetId) {
  const match = typeof assetId === 'string' ? ASSET_ID.exec(assetId) : null
  return match ? { id: match[1], orientation: match[2] } : null
}
/** 서버 코드 'dio-remote-<방향>' → 방향, 아니면 null */
export const remoteServerOrientation = code => (typeof code === 'string' ? SERVER_CODE.exec(code)?.[1] : null) ?? null

// id → { id, name, group, hidden, files: { landscape, portrait } }
let templates = new Map()
// 테이스팅 노트는 앱에 든 속지라 서버 목록을 기다리지 않는다. SVG 는 파일이 아니라 플래너(planners.js)가 만들어 files 가 없다(loadTemplate 은 plannerFor 를 먼저 본다)
const TASTING = Object.freeze({ id: 'tasting-note', name: '테이스팅 노트', group: 'diary', hidden: true })
const TASTING_V2 = Object.freeze({ id: 'tasting-note-v2', name: '테이스팅 노트 · 사진 중심', group: 'diary', hidden: false })
// 목록이 더한 속지 탭 [{ id, name, hidden }] (앱 탭 노트 · 플래너 · 일기 뒤에 붙는다, diary/utils/paperChoice.js)
let groups = []
let revision = 0
const listeners = new Set()
export const subscribeRemoteTemplates = listener => { listeners.add(listener); return () => listeners.delete(listener) }
export const remoteTemplatesSnapshot = () => revision
export const remoteTemplateList = () => [TASTING, TASTING_V2, ...[...templates.values()].filter(item => item.id !== TASTING.id && item.id !== TASTING_V2.id)]
export const remoteTemplateOf = id => id === TASTING.id ? TASTING : id === TASTING_V2.id ? TASTING_V2 : templates.get(id) ?? null
export const remoteTemplateGroups = () => groups

export function registerRemoteTemplates(list, groupList = []) {
  templates = new Map(list.filter(item => REMOTE_TEMPLATE_ID.test(item?.id ?? '') && item.files?.landscape && item.files?.portrait).map(item => [item.id, item]))
  groups = groupList.filter(group => REMOTE_TEMPLATE_ID.test(group?.id ?? '') && typeof group.name === 'string')
  revision++
  listeners.forEach(listener => listener())
}

/** getTemplate 용 항목. 목록을 아직 못 받아도 ID 만으로 방향 · 버전을 알 수 있어 페이지 크기는 정해진다 */
export function remoteTemplateAsset(assetId) {
  const parsed = parseRemoteTemplateAssetId(assetId)
  if (!parsed) return null
  const item = remoteTemplateOf(parsed.id)
  return { id: assetId, name: item?.name ?? '추가 속지', type: 'remote', remoteId: parsed.id, orientation: parsed.orientation, templateVersion: REMOTE_TEMPLATE_VERSION }
}

/** 원격 속지 SVG 파일. 목록에 없으면 waitMs 동안 목록이 들어오기를 기다린다(앱이 켜지자마자 페이지를 열 때) */
export function waitForRemoteTemplateFile(assetId, waitMs = 10000) {
  const parsed = parseRemoteTemplateAssetId(assetId)
  if (!parsed) return Promise.resolve(null)
  const now = () => templates.get(parsed.id)?.files?.[parsed.orientation] ?? null
  if (now()) return Promise.resolve(now())
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); unsubscribe(); resolve(now()) }
    const unsubscribe = subscribeRemoteTemplates(() => { if (now()) done() })
    const timer = setTimeout(done, waitMs)
  })
}
