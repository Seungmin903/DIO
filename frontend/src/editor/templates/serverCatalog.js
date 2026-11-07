import { catalog } from './data.js'
import { UNDATED_TEMPLATES } from './undated.js'
import { STUDY_PLANNER_TEMPLATES } from './studyPlanner.js'
import { DAY_PLANNER_TEMPLATES } from './dayPlanner.js'
import { parseRemoteTemplateAssetId, REMOTE_SERVER_CODE, REMOTE_TEMPLATE_ID, REMOTE_TEMPLATE_VERSION, remoteTemplateAssetId } from './remoteTemplates.js'

// 서버 PK는 노출·추정하지 않는다. 기존 에셋 ID와 버전이 안정적인 서버 코드/버전이다.
const paper = Object.freeze({ backgroundColor: '#FFFFFF', layoutColor: '#292929' })
const plannerCode = code => /^(study|day)-planner-(landscape|portrait)$/.test(code)

// 첫 번째 프런트 배포는 새 속지를 읽고 그릴 수만 있어야 한다. V27이 적용되기
// 전에는 이 값을 0으로 빌드해 선택/생성 요청만 막고, 이미 저장된 플래너 페이지의
// localTemplateReference 해석은 계속 허용한다. 릴리스 빌드 값은 eas.json 프로필에 고정한다.
// Expo는 process.env.EXPO_PUBLIC_* 를 이름 그대로 쓴 접근만 빌드 때 치환하므로 process.env 를 통째로 넘기지 않는다.
export const plannerTemplatesEnabled = value => value !== '0'
export const PLANNER_TEMPLATE_SELECTION_ENABLED = plannerTemplatesEnabled(process.env.EXPO_PUBLIC_PLANNER_TEMPLATES_ENABLED)
const entry = (asset, blank = false) => {
  const size = catalog.coordinateSystems[asset.orientation]
  return Object.freeze({
    templateCode: asset.id, templateVersion: asset.templateVersion,
    backgroundAssetId: blank ? null : asset.id, name: asset.name,
    category: blank ? 'BLANK' : asset.type.toUpperCase(), orientation: asset.orientation.toUpperCase(),
    canvasWidth: size.width, canvasHeight: size.height,
    defaultConfig: Object.freeze({ width: size.width, height: size.height, paperAppearance: paper, blank }),
  })
}
export const SERVER_TEMPLATE_CATALOG = Object.freeze([
  ...catalog.assets.map(asset => entry(asset)),
  ...UNDATED_TEMPLATES.map(asset => entry(asset)),
  ...STUDY_PLANNER_TEMPLATES.map(asset => entry(asset)),
  ...DAY_PLANNER_TEMPLATES.map(asset => entry(asset)),
  ...['landscape', 'portrait'].map(orientation => entry({ id: `dio-blank-${orientation}`,
    templateVersion: catalog.templateVersion, name: `빈 속지 · ${orientation === 'portrait' ? '세로' : '가로'}`, orientation }, true)),
  // 원격 속지(V34): 방향마다 범용 행 하나. 어떤 그림인지는 페이지 설정 remoteTemplate 이 정한다(remoteTemplates.js)
  ...['landscape', 'portrait'].map(orientation => Object.freeze({ ...entry({ id: REMOTE_SERVER_CODE(orientation), templateVersion: REMOTE_TEMPLATE_VERSION,
    name: `추가 속지 · ${orientation === 'portrait' ? '세로' : '가로'}`, orientation, type: 'remote' }), backgroundAssetId: null, remote: true })),
])
const byCode = new Map(SERVER_TEMPLATE_CATALOG.map(row => [`${row.templateCode}\0${row.templateVersion}`, row]))
if (byCode.size !== SERVER_TEMPLATE_CATALOG.length) throw new Error('중복된 서버 속지 코드가 있어요.')
const failure = () => new Error('서버에 연결할 속지와 버전을 확인해 주세요.')
export const serverTemplateSelectable = row => Boolean(row) && (PLANNER_TEMPLATE_SELECTION_ENABLED || !plannerCode(row.templateCode))

/** 서버 페이지 설정(templateConfig)에 더할 값. 원격 속지면 { remoteTemplate: <id> }, 아니면 빈 객체 */
export function serverTemplateConfigFor(assetId) {
  const remote = parseRemoteTemplateAssetId(assetId)
  return remote ? { remoteTemplate: remote.id } : {}
}

export function serverTemplateReference(assetId, version, orientation) {
  if (!['landscape', 'portrait'].includes(orientation)) throw failure()
  const remote = parseRemoteTemplateAssetId(assetId)
  if (remote) {
    if (remote.orientation !== orientation || version !== REMOTE_TEMPLATE_VERSION) throw failure()
    const row = byCode.get(`${REMOTE_SERVER_CODE(orientation)}\0${REMOTE_TEMPLATE_VERSION}`)
    return { templateCode: row.templateCode, templateVersion: row.templateVersion }
  }
  const code = assetId === null ? `dio-blank-${orientation}` : assetId
  const row = byCode.get(`${code}\0${version}`)
  if (!serverTemplateSelectable(row) || row.orientation !== orientation.toUpperCase() || (assetId !== null && row.backgroundAssetId !== assetId)) throw failure()
  return { templateCode: row.templateCode, templateVersion: row.templateVersion }
}

// 231 내부 Selection DTO로 변환한다. HTTP 경로/다이어리 메타데이터 계약은 별도다.
export function toServerInitialPageSelections(initialPages) {
  if (!Array.isArray(initialPages) || !initialPages.length) throw failure()
  return initialPages.map(page => {
    const row = byCode.get(`${page?.templateCode}\0${page?.templateVersion}`)
    const config = page?.templateConfig
    const remote = row?.remote ? parseRemoteTemplateAssetId(page?.templateId) : null
    if (!serverTemplateSelectable(row) || !config || typeof config !== 'object' || Array.isArray(config)
      // 원격 속지 행은 앱 ID 의 방향 · id 가 설정의 remoteTemplate 과 맞아야 하고, 다른 행에는 remoteTemplate 을 보내지 않는다(서버가 거부)
      || (row.remote ? !remote || remote.orientation.toUpperCase() !== row.orientation || config.remoteTemplate !== remote.id
        : page.templateId !== row.backgroundAssetId || 'remoteTemplate' in config)
      || config.width !== row.canvasWidth || config.height !== row.canvasHeight
      || (row.backgroundAssetId === null && !row.remote) !== (config.blank === true)) throw failure()
    return { templateCode: row.templateCode, templateVersion: row.templateVersion, configurationJson: JSON.stringify(config) }
  })
}

/** 서버 코드·버전(원격 속지면 페이지 설정의 remoteTemplate 도) → 앱 속지 ID */
export function localTemplateReference(templateCode, version, templateConfig = null) {
  const row = byCode.get(`${templateCode}\0${version}`)
  if (!row) throw failure()
  if (row.remote) {
    const id = templateConfig?.remoteTemplate
    if (typeof id !== 'string' || !REMOTE_TEMPLATE_ID.test(id)) throw failure()
    return { backgroundAssetId: remoteTemplateAssetId(id, row.orientation.toLowerCase()), templateVersion: row.templateVersion,
      canvasWidth: row.canvasWidth, canvasHeight: row.canvasHeight }
  }
  return { backgroundAssetId: row.backgroundAssetId, templateVersion: row.templateVersion,
    canvasWidth: row.canvasWidth, canvasHeight: row.canvasHeight }
}
