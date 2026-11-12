// 게스트(로그인 전)가 이 기기에 만든 다이어리를 로그인한 회원의 서버 보관함으로 옮긴다.
// 지금 서버 API만 쓴다: 다이어리 생성(initialPages) → 페이지 크기 · 속지 글꼴 · 이름 · 격자(PATCH /pages) → 사진 업로드 후 id 교체 → 요소 전송(canvas-operations) → 즐겨찾기.
// 단계마다 기기에 기록해 앱이 꺼져도 같은 키로 이어서 보내므로 서버에 두 번 생기지 않는다. 끝나면 '옮김'을 기록하고 원본을 지운다.
// 표지는 서버에 저장하고, 방향 · 처음 만든 날짜 등 기기 값은 localMeta로 잇는다.
// 내용이 빠지는 것(날짜 글자 · 15MB 넘는 GIF 등)은 skipped 로 모아 화면에 알리고, 그 다이어리의 원본은 기기에 남긴다. 정리: docs/다이어리 저장/게스트 다이어리 가져오기.md
import { createDefaultDoc } from '../../editor/state/defaultDoc.js'
import { STORAGE_KEYS } from '../../editor/utils/storageContract.js'
import { TEMPLATE_VERSION, templateCanvasSize } from '../../editor/templates/catalog.js'
import { datedBaseId, datedTemplate } from '../../editor/templates/dated.js'
import { serverTemplateConfigFor, serverTemplateReference } from '../../editor/templates/serverCatalog.js'
import { sharedObject, encodeElement } from '../../collaboration/canvasElements.js'
import { mediaIds } from '../../collaboration/canvasMedia.js'
import { pageSettingsBody } from '../../collaboration/pageSettings.js'
import { decodeServerPage } from '../../collaboration/serverPages.js'
import { normalizeDiaries } from '../utils/diaryLibrary.js'
import { createdTime } from '../utils/libraryQuery.js'
import { purgeTrashedDiary } from '../utils/trashRetention.js'
import { FALLBACK_COVER_COLOR } from '../constants.js'
import { memberKeys } from './memberStorage.js'
import { serverPaperAppearance } from './serverPaperFont.js'
import { createGuestImportJournalStore } from './guestImportJournal.js'

const copy = value => JSON.parse(JSON.stringify(value))
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length
const failure = (code, message) => Object.assign(new Error(message), { code })

// 서버 한도(CanvasElementCreateRequest · CanvasElementBatchRequest)보다 조금 작게 잡는다.
export const ELEMENT_PROPERTIES_LIMIT = 120 * 1024
const BATCH_PROPERTIES_LIMIT = 3 * 1024 * 1024
const BATCH_CREATES = 100
export const INITIAL_PAGES_LIMIT = 512

export const GUEST_IMPORT_LEDGER_KEY = 'dio:diary:guest-imports:v1'
export const guestImportJournalKey = accountId => `${memberKeys(accountId).index.replace(/:index$/, '')}:guest-import:v1`

// 빠지는 항목의 종류. 화면 문구는 skippedSummary 가 만든다.
const SKIP_LABELS = {
  datedText: '날짜 속지의 날짜 글자',
  template: '서버에 없는 속지 그림',
  element: '서버에 저장할 수 없는 요소',
  media: '올리지 못한 사진 · 스티커',
  personalFont: '내 손글씨 글꼴(다른 기기에서 기본 글꼴로 보여요)',
  pageLimit: '512쪽을 넘는 페이지',
}
// 이 종류가 빠지면 원본에만 있는 내용이 생기므로 원본을 지우지 않는다. 내 손글씨 글꼴은 글자가 옮겨지고 글꼴 파일은 기기에 남는다.
const CONTENT_LOSS = new Set(['datedText', 'template', 'element', 'media', 'pageLimit'])
export const losesContent = skipped => skipped.some(row => CONTENT_LOSS.has(row.kind))
// 예전 앱이 만든 진행 기록에 남아 있을 수 있는 항목. 이제 기기 값으로 옮긴다.
const CARRIED_KINDS = new Set(['cover', 'createdAt'])

export function skippedSummary(skipped = []) {
  const counts = new Map()
  for (const row of skipped) counts.set(row.kind, (counts.get(row.kind) ?? 0) + (row.count ?? 1))
  return [...counts].map(([kind, count]) => ({ kind, count, label: SKIP_LABELS[kind] ?? kind }))
}

// ---------- 계획: 게스트 다이어리 + 문서 → 서버에 보낼 값 ----------

const orientationOf = (page, fallback) => {
  if (Number.isFinite(page.canvasWidth) && Number.isFinite(page.canvasHeight)) return page.canvasWidth >= page.canvasHeight ? 'landscape' : 'portrait'
  const match = /-(landscape|portrait)$/.exec(page.backgroundAssetId ?? '')
  return match?.[1] ?? fallback
}

/** 페이지 하나의 서버 속지(카탈로그에 있는 code · version)와 빠지는 것. 없으면 같은 방향의 빈 속지로 만든다. */
function serverTemplateFor(page, orientation) {
  const asset = page.backgroundAssetId ?? null
  const blank = () => ({ assetId: null, ...serverTemplateReference(null, TEMPLATE_VERSION, orientation) })
  if (asset === null) return { template: blank(), skipped: [] }
  // 날짜 속지: 회원 새 다이어리와 같이 같은 양식의 만년형 서버 행에 만들고 날짜 ID 는 페이지 설정 datedTemplate 으로 잇는다(지라 581).
  // 생성 요청은 datedTemplate 을 받지 않아 만든 뒤 PATCH 로 넣는다(아래 dated). 만년형으로 못 바꾸면 빈 속지로.
  if (datedTemplate(asset)) {
    try { datedBaseId(asset); return { template: { assetId: asset, ...serverTemplateReference(asset, page.templateVersion ?? TEMPLATE_VERSION, orientation) }, skipped: [] } }
    catch { return { template: blank(), skipped: [{ kind: 'template' }] } }
  }
  try { return { template: { assetId: asset, ...serverTemplateReference(asset, page.templateVersion, orientation) }, skipped: [] } }
  catch { return { template: blank(), skipped: [{ kind: 'template' }] } }
}

/** 큰 펜 획은 같은 좌표계(x · y · w · h · baseWidth · baseHeight)를 둔 채 점을 나눠 여러 획으로 보낸다. 이음매는 점 하나를 겹쳐 끊기지 않게 한다. */
export function splitStroke(object, createId, limit = ELEMENT_PROPERTIES_LIMIT) {
  // 요소 전체 크기로 재면 propertiesJson 보다 조금 커서 한도 안쪽으로 넉넉히 나뉜다.
  const size = bytes(object)
  if (object.type !== 'stroke' || size <= limit || !Array.isArray(object.points) || object.points.length < 4) return [object]
  const parts = Math.ceil(size / limit) + 1
  const step = Math.ceil(object.points.length / parts)
  const result = []
  for (let start = 0; start < object.points.length; start += step) {
    result.push({ ...object, id: result.length ? createId() : object.id, points: object.points.slice(Math.max(0, start - 1), start + step) })
  }
  return result.flatMap(part => part.points.length < object.points.length ? splitStroke(part, createId, limit) : [part])
}

/** 서버로 옮길 요소: 새 id 를 붙이고(서버의 다른 요소와 겹치지 않게) 공유할 수 있는 종류만 남긴다. */
export function planElements(objects = [], createId) {
  const elements = [], skipped = []
  let personalFont = 0
  for (const object of objects) {
    const next = { ...copy(object), id: createId() }
    if (!sharedObject(next)) { skipped.push({ kind: 'element', type: object?.type ?? null }); continue }
    try {
      for (const part of splitStroke(next, createId)) {
        const element = encodeElement(part)
        if (bytes(element.propertiesJson) > ELEMENT_PROPERTIES_LIMIT) { skipped.push({ kind: 'element', type: object.type }); continue }
        elements.push(element)
      }
      if (typeof object.font === 'string' && object.font.startsWith('personal-')) personalFont++
    } catch { skipped.push({ kind: 'element', type: object?.type ?? null }) }
  }
  if (personalFont) skipped.push({ kind: 'personalFont', count: personalFont })
  return { elements: elements.map((element, index) => ({ ...element, sortKey: index + 1 })), skipped }
}

/** 요소를 한 번에 보낼 수 있는 묶음(개수 · 크기 한도)으로 나눈다. */
export function batchElements(elements) {
  const batches = []
  let current = [], size = 0
  for (const element of elements) {
    const next = bytes(element.propertiesJson)
    if (current.length && (current.length >= BATCH_CREATES || size + next > BATCH_PROPERTIES_LIMIT)) { batches.push(current); current = []; size = 0 }
    current.push(element); size += next
  }
  if (current.length) batches.push(current)
  return batches
}

const coverDecorated = cover => cover && typeof cover === 'object' && Object.keys(cover).length > 0

/** 계획을 만든 뒤 게스트 내용이 바뀌었는지 알아보는 값. 끊긴 옮기기를 이어서 끝내도 계획 뒤에 쓴 내용은 서버에 없다. */
export function guestContentStamp(diary, doc) {
  const text = JSON.stringify([diary.title, diary.color, diary.pattern ?? null, doc])
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
  return `${text.length}:${(hash >>> 0).toString(16)}`
}

/** 서버가 받지 않아 옮긴 기기의 회원 목록에 잇는 값. */
export function guestLocalMeta(diary) {
  const time = createdTime(diary)
  return {
    pageSize: diary.templateConfig?.orientation ?? diary.pageSize ?? 'landscape',
    ...(coverDecorated(diary.cover) ? { cover: copy(diary.cover) } : {}),
    ...(time ? { originalCreatedAt: new Date(time).toISOString() } : {}),
  }
}

/**
 * 게스트 다이어리(목록 항목)와 편집 문서로 가져오기 계획을 만든다. 한 번 만든 계획은 기기에 저장해 다시 보낼 때 그대로 쓴다(요소 id 가 같아야 중복이 생기지 않는다).
 * doc 이 없으면(한 번도 열지 않은 다이어리) 기기에서 처음 열 때와 같은 기본 문서로 본다.
 */
export function planGuestDiary(diary, doc, { createId }) {
  if (doc != null && (!Array.isArray(doc.pages) || !doc.pages.length))
    throw failure('INVALID_LOCAL_DOCUMENT', '기기의 다이어리 문서를 확인하지 못했어요. 원본은 그대로 남아 있어요.')
  const source = doc ?? createDefaultDoc(diary)
  const fallback = diary.pageSize ?? source.orientation ?? 'landscape'
  const skipped = []
  const pages = source.pages.slice(0, INITIAL_PAGES_LIMIT)
  if (source.pages.length > pages.length) skipped.push({ kind: 'pageLimit', count: source.pages.length - pages.length })
  const planned = pages.map(page => {
    const orientation = orientationOf(page, fallback)
    const { template, skipped: templateSkipped } = serverTemplateFor(page, orientation)
    const defaultSize = templateCanvasSize(orientation)
    const appearance = page.paperAppearance ?? source.paperAppearance ?? diary.paperAppearance
    const serverAppearance = serverPaperAppearance(appearance)
    const initialPage = { templateId: template.assetId, templateCode: template.templateCode, templateVersion: template.templateVersion,
      templateConfig: { width: defaultSize.width, height: defaultSize.height, ...serverTemplateConfigFor(template.assetId), ...(serverAppearance ? { paperAppearance: { backgroundColor: serverAppearance.backgroundColor, layoutColor: serverAppearance.layoutColor } } : {}), ...(template.assetId === null ? { blank: true } : {}) } }
    const width = Number.isFinite(page.canvasWidth) ? page.canvasWidth : defaultSize.width
    const height = Number.isFinite(page.canvasHeight) ? page.canvasHeight : defaultSize.height
    // 생성 요청에 실을 수 없는 페이지 설정은 만든 뒤 PATCH 로 넣는다(속지 글꼴은 templateConfig 를 통째로 바꿔 넣는다).
    const settings = {}
    if (width !== defaultSize.width || height !== defaultSize.height) { settings.canvasWidth = Math.round(width * 100) / 100; settings.canvasHeight = Math.round(height * 100) / 100 }
    if (typeof page.title === 'string' && page.title.trim() && page.title.trim().length <= 100) settings.title = page.title.trim()
    if (page.gridVisible === true) settings.gridVisible = true
    if (typeof page.gridColor === 'string' && /^#[0-9a-f]{6}$/i.test(page.gridColor)) settings.gridColor = page.gridColor
    const font = typeof appearance?.font === 'string' ? appearance.font : null
    const dated = datedTemplate(template.assetId) ? template.assetId : null
    const { elements, skipped: elementSkipped } = planElements(page.objects, createId)
    return { initialPage, settings, font, ...(dated ? { dated } : {}), batches: batchElements(elements).map(creates => ({ clientOperationId: createId(), creates })), skipped: [...templateSkipped, ...elementSkipped] }
  })
  return {
    guestDiaryId: diary.id,
    create: { title: (typeof diary.title === 'string' ? diary.title.trim() : '').slice(0, 100) || '제목 없음', color: /^#[0-9a-f]{6}$/i.test(diary.color ?? '') ? diary.color : FALLBACK_COVER_COLOR, pattern: diary.pattern ?? null, initialPages: planned.map(page => page.initialPage) },
    favorite: diary.favorite === true,
    pages: planned.map(({ initialPage, ...page }) => page),
    skipped: [...skipped, ...planned.flatMap(page => page.skipped)],
  }
}

// ---------- 기기 기록 ----------

/** 게스트 쪽 기록: 어느 계정으로 가져왔는지, 다시 묻지 않기로 한 계정. 게스트 다이어리 자체는 그대로 둔다. */
export async function readGuestImportLedger(storage) {
  const raw = await storage.getItem(GUEST_IMPORT_LEDGER_KEY)
  if (!raw) return { imports: {}, declined: {}, dismissed: {} }
  try {
    const value = JSON.parse(raw)
    return { imports: value?.imports && typeof value.imports === 'object' ? value.imports : {}, declined: value?.declined && typeof value.declined === 'object' ? value.declined : {}, dismissed: value?.dismissed && typeof value.dismissed === 'object' ? value.dismissed : {} }
  } catch { throw failure('INVALID_LOCAL_CACHE', '가져오기 기록을 읽지 못했어요.') }
}
async function updateLedger(storage, change) {
  const ledger = await readGuestImportLedger(storage)
  const next = change(ledger)
  await storage.setItem(GUEST_IMPORT_LEDGER_KEY, JSON.stringify(next))
  return next
}
/** 나중에: 이 계정에는 자동으로 다시 묻지 않는다. 보관함의 입구에서는 언제든 옮길 수 있다. */
export const dismissGuestImport = (storage, accountId, ids) => updateLedger(storage, ledger => ({ ...ledger, dismissed: { ...ledger.dismissed, [accountId]: [...new Set([...(ledger.dismissed[accountId] ?? []), ...ids])] } }))
export const importedTo = (ledger, guestDiaryId, accountId) => ledger.imports[guestDiaryId]?.[accountId] ?? null

/** 이 계정으로 아직 가져오지 않은 게스트 다이어리(휴지통 제외). */
export async function listGuestImportCandidates(storage, accountId) {
  const raw = await storage.getItem(STORAGE_KEYS.diaries)
  let diaries
  try {
    const value = raw == null ? [] : JSON.parse(raw)
    if (!Array.isArray(value)) throw new Error('Invalid diary list')
    diaries = normalizeDiaries(value)
  } catch { throw failure('INVALID_LOCAL_CACHE', '기기의 다이어리 목록을 읽지 못했어요. 원본은 그대로 남아 있어요.') }
  const ledger = await readGuestImportLedger(storage)
  const candidates = diaries.filter(diary => !diary.trashedAt && !importedTo(ledger, diary.id, accountId))
  // 예전 앱에서 가져오지 않기를 고른 계정(declined)도 자동으로 묻지 않는다.
  return { diaries: candidates, unasked: ledger.declined[accountId] || ledger.dismissed[accountId]?.length ? [] : candidates }
}

/** 옮기기를 끝낸 게스트 원본을 지운다. 휴지통 영구 삭제와 같은 경로라 다른 곳에서 쓰는 사진 파일은 남는다. 성공 여부를 돌려준다. */
export async function removeGuestOriginal(storage, id, cleanup) {
  const raw = await storage.getItem(STORAGE_KEYS.diaries)
  let diaries = normalizeDiaries(raw == null ? [] : JSON.parse(raw))
  if (!diaries.some(diary => diary.id === id)) return true
  const trashedAt = new Date().toISOString()
  diaries = diaries.map(diary => diary.id === id && !diary.trashedAt ? { ...diary, trashedAt } : diary)
  return purgeTrashedDiary({ id, storage, keys: STORAGE_KEYS, getDiaries: () => diaries, updateDiaries: change => { diaries = change(diaries) }, ...cleanup })
}

/** 앱이 꺼지는 바람에 옮긴 뒤 지우지 못한 원본을 마저 지운다. 예전 앱에서 복사만 한 다이어리(removeOriginal 없음)는 건드리지 않는다. */
export async function sweepMovedGuestDiaries(storage, accountId, removeOriginal) {
  const { imports } = await readGuestImportLedger(storage)
  for (const [id, accounts] of Object.entries(imports)) {
    if (accounts?.[accountId]?.removeOriginal) await removeOriginal(id).catch(() => false)
  }
}

// ---------- 실행 ----------

const permanentMediaError = error => {
  const status = error?.status ?? 0
  return [400, 413, 415, 422].includes(status)
    // status 없는 기기 파일 오류만 확정 누락 처리한다. 서버의 403/404/409는 재시도 대상으로 둔다.
    || status === 0 && ['MEDIA_DECODE_FAILED', 'MEDIA_CORRUPT', 'MEDIA_NOT_FOUND', 'UNSUPPORTED_MEDIA_TYPE', 'INVALID_MEDIA', 'IMAGE_TOO_LARGE', 'MEDIA_FILE_TOO_LARGE', 'PDF_SOURCE_MISSING'].includes(error?.code)
}

/** 서버가 바쁠 때(동시 업로드 3개 한도, 503 MEDIA_UPLOAD_BUSY) 잠시 기다렸다 다시 보낸다. */
export function withUploadRetry(request, { wait = ms => new Promise(resolve => setTimeout(resolve, ms)), delays = [500, 1500, 4000] } = {}) {
  return async (path, options) => {
    for (let attempt = 0; ; attempt++) {
      try { return await request(path, options) }
      catch (error) {
        if (!(error.status === 503 || error.code === 'MEDIA_UPLOAD_BUSY') || attempt >= delays.length) throw error
        await wait(delays[attempt])
      }
    }
  }
}

/**
 * accountId 계정으로 게스트 다이어리를 가져오는 실행기. 의존성은 모두 주입한다(테스트 · 플랫폼 분리).
 * - api: createMemberDiaryApi 결과(create · 생성 키)
 * - transport: 회원 HTTP(GET/PATCH /pages, PATCH /membership)
 * - canvas: createCanvasApi 결과(apply)
 * - mediaFor(diaryId): 서버 다이어리별 createCanvasMedia(업로드 결과를 편집기와 같은 키에 기록)
 * - loadGuestDoc(diary): 게스트 편집 문서(없으면 null)
 * - removeOriginal(id): 옮기기를 끝낸 게스트 원본 지우기. 실패하면 다음 로그인 때 다시 지운다
 */
export function createGuestDiaryImporter({ accountId, storage, api, transport, canvas, mediaFor, loadGuestDoc, removeOriginal = async () => true, createId, now = () => new Date().toISOString(), isActive = () => true }) {
  const journalKey = guestImportJournalKey(accountId)
  const journalStore = createGuestImportJournalStore({ storage, key: journalKey })
  let journal = null, running = null
  const assertActive = () => {
    if (!isActive()) throw Object.assign(failure('STALE_ACCOUNT', '로그인 상태가 변경됐어요. 다시 로그인한 뒤 이어서 가져와 주세요.'), { status: 401 })
  }
  const load = async () => {
    if (journal) return journal
    journal = await journalStore.load()
    if (journal?.format !== 1 || !journal.diaries || typeof journal.diaries !== 'object' || Array.isArray(journal.diaries)) throw failure('INVALID_LOCAL_CACHE', '가져오기 진행 기록을 확인하지 못했어요.')
    return journal
  }
  const persist = () => journalStore.save(journal)

  async function prepareRows(media, rows) {
    // 요소마다 따로 올린다: 한 장이 실패해도(너무 큰 GIF · 지운 사진) 나머지는 옮긴다.
    const prepared = [], skipped = []
    for (const row of rows) {
      assertActive()
      try {
        const body = await media.prepare({ clientOperationId: 'prepare', changes: { creates: [row] }, expectedVersions: {} })
        prepared.push(body.changes.creates[0])
      } catch (error) {
        if (!permanentMediaError(error)) throw error
        skipped.push({ kind: 'media', type: row.elementType.toLowerCase(), code: error.code ?? null })
      }
    }
    return { creates: prepared, skipped }
  }

  // 새로 만든 회원 다이어리처럼 이 기기의 회원 문서를 서버 페이지로 채워 둔다(열 때 페이지 목록을 다시 받지 않는다).
  // 캐시일 뿐이라 실패해도 가져오기는 끝난 것으로 본다. 이미 있으면(앞선 시도에서 연 문서) 덮어쓰지 않는다.
  async function cacheMemberDocument(diary, entry) {
    const key = memberKeys(accountId).doc(entry.diaryId)
    try {
      if (await storage.getItem(key)) return
      const pages = []
      for (const pageId of entry.pageIds) pages.push(decodeServerPage(await transport({ path: `/pages/${pageId}` }), entry.diaryId))
      const pageSize = pages[0].canvasWidth >= pages[0].canvasHeight ? 'landscape' : 'portrait'
      const doc = { ...createDefaultDoc({ id: entry.diaryId, title: diary.title, color: diary.color, pattern: diary.pattern ?? null, pageSize }), memberAccountId: accountId, pages }
      await storage.setItem(key, JSON.stringify(doc))
    } catch (error) {
      if (error?.status === 401 || ['STALE_ACCOUNT', 'UNAUTHENTICATED'].includes(error?.code)) throw error
      /* 캐시 실패는 열 때 서버에서 다시 읽는다. 로그인 실패는 삼키지 않는다. */
    }
  }

  async function rememberLocalMeta(diary, entry) {
    const key = memberKeys(accountId).localMeta
    let meta = {}
    try { meta = JSON.parse(await storage.getItem(key) ?? '{}') ?? {} } catch { /* 깨진 기기 값은 새로 쓴다. */ }
    await storage.setItem(key, JSON.stringify({ ...meta, [entry.diaryId]: guestLocalMeta(diary) }))
  }

  async function importOne(diary, onProgress) {
    assertActive()
    await load()
    const recorded = importedTo(await readGuestImportLedger(storage), diary.id, accountId)
    assertActive()
    if (recorded) {
      if (journal.diaries[diary.id]) { delete journal.diaries[diary.id]; await persist() }
      if (recorded.removeOriginal) await removeOriginal(diary.id).catch(() => false)
      return recorded
    }
    let entry = journal.diaries[diary.id]
    if (!entry) {
      const doc = await loadGuestDoc(diary)
      assertActive()
      const plan = planGuestDiary(diary, doc, { createId })
      entry = journal.diaries[diary.id] = { requestId: createId(), plan, diaryId: null, pageIds: null, settingsDone: [], batchesDone: [], favoriteDone: false, skipped: [...plan.skipped], startedAt: now(), contentStamp: guestContentStamp(diary, doc) }
    }
    const { plan } = entry
    // 묶음을 나눠 보내면 단계 수가 늘어나므로 그때그때 센다.
    const total = () => 1 + plan.pages.length + plan.pages.reduce((sum, page) => sum + page.batches.length, 0)
    let deferredMediaError = null
    let done = 0
    const step = () => { assertActive(); onProgress?.({ guestDiaryId: diary.id, done: ++done, total: total() }) }
    if (!entry.diaryId) {
      // 같은 생성 키로 다시 보내면 서버는 처음 만든 다이어리를 돌려준다(24시간 보관).
      await persist() // 이전 저장 실패 뒤 같은 실행기로 재시도해도 요청 전에는 반드시 기록을 확정한다.
      let result
      try { result = await api.create(copy(plan.create), { requestId: entry.requestId }) }
      catch (error) {
        if (error.status === 409 && error.code === 'IDEMPOTENCY_KEY_EXPIRED') {
          throw Object.assign(failure(error.code, '생성 요청의 보관 기간이 지났어요. 회원 보관함에서 이미 만들어진 다이어리가 있는지 확인해 주세요. 원본은 기기에 그대로 남아 있어요.'), { status: 409 })
        }
        // 생성 전 입력 거절만 정리한다. 응답 유실·인증·서버 오류·멱등 충돌은 같은 키를 보존한다.
        if ([400, 413, 415, 422].includes(error.status) && !String(error.code ?? '').includes('IDEMPOTENCY')) {
          delete journal.diaries[diary.id]
          await persist()
        }
        throw error
      }
      entry.diaryId = result.id; entry.pageIds = result.pageIds; await persist()
    }
    if(!entry.coverDone&&api.saveInitialCover&&coverDecorated(diary.cover)) {
      assertActive()
      await api.saveInitialCover(entry.diaryId,copy(diary.cover));assertActive()
      entry.coverDone=true;await persist()
    }
    step()
    for (const [index, page] of plan.pages.entries()) {
      const pageId = entry.pageIds[index]
      if (!entry.settingsDone.includes(index)) {
        const body = { ...page.settings }
        if (page.font || page.dated) {
          // 생성 요청은 속지 글꼴 · 날짜 ID 를 받지 않는다. 서버에 저장된 속지 설정에 더해 통째로 다시 넣는다.
          const detail = await transport({ path: `/pages/${pageId}` })
          const config = detail?.page?.templateConfig ?? {}
          body.templateConfig = { ...config, ...(page.dated ? { datedTemplate: page.dated } : {}),
            ...(page.font ? { paperAppearance: { ...(config.paperAppearance ?? {}), font: page.font } } : {}) }
        }
        if (Object.keys(body).length) await transport({ method: 'PATCH', path: `/pages/${pageId}`, body: pageSettingsBody(body) })
        entry.settingsDone.push(index); await persist()
      }
      step()
      // 저장된 요청은 유지하고, 아직 준비하지 않은 묶음만 이미지와 일반 요소로 분리한다.
      let separated = false
      page.batches = page.batches.flatMap(batch => {
        if (batch.request || entry.batchesDone.includes(batch.clientOperationId)) return [batch]
        const hasMedia = row => mediaIds(row).length > 0 || !!row.propertiesJson?.pdfSource
        const plain = batch.creates.filter(row => !hasMedia(row)), images = batch.creates.filter(hasMedia)
        if (!plain.length || !images.length) return [batch]
        separated = true
        return [{ clientOperationId: batch.clientOperationId, creates: plain }, { clientOperationId: createId(), creates: images }]
      })
      if (separated) await persist()
      for (let position = 0; position < page.batches.length; position++) {
        assertActive()
        const batch = page.batches[position]
        if (!entry.batchesDone.includes(batch.clientOperationId)) {
          // 업로드로 바꾼 요청은 기록해 두었다가 그대로 다시 보낸다(같은 clientOperationId · 같은 내용 → 서버가 처음 결과를 돌려준다).
          if (!batch.request) {
            const media = mediaFor(entry.diaryId)
            let prepared
            try { prepared = await prepareRows(media, batch.creates) }
            catch (error) {
              if (error.status === 401 || ['STALE_ACCOUNT', 'UNAUTHENTICATED'].includes(error.code)) throw error
              deferredMediaError ??= error
              continue // 사진은 재시도 대상으로 남기고 다음 페이지의 펜·글씨도 보낸다.
            }
            // 준비 중 네트워크 오류가 나면 누락 집계를 버린다. 요청과 함께 한 번만 기록한다.
            entry.skipped.push(...prepared.skipped)
            batch.request = { clientOperationId: batch.clientOperationId, changes: { creates: prepared.creates }, expectedVersions: {} }
            delete batch.creates
          }
          await persist() // 준비 결과 저장에 실패했던 재시도도 전송 전에 같은 본문을 확정한다.
          try { if (batch.request.changes.creates.length) await canvas.apply(pageId, batch.request) }
          catch (error) {
            if (![400, 413, 422].includes(error.status)) throw error
            const creates = batch.request.changes.creates
            if (creates.length > 1) {
              // 묶음이 거절되면 요소 하나씩 새 요청으로 나눠 보내, 거절된 요소만 빠지게 한다.
              page.batches.splice(position, 1, ...creates.map(row => {
                const clientOperationId = createId()
                return { clientOperationId, request: { clientOperationId, changes: { creates: [row] }, expectedVersions: {} } }
              }))
              await persist(); position--; continue
            }
            entry.skipped.push({ kind: 'element', type: creates[0]?.elementType?.toLowerCase() ?? null, code: error.code ?? null })
          }
          entry.batchesDone.push(batch.clientOperationId)
          delete batch.creates; delete batch.request
          await persist()
        }
        step()
      }
    }
    assertActive()
    if (deferredMediaError) throw deferredMediaError
    if (plan.favorite && !entry.favoriteDone) {
      await transport({ method: 'PATCH', path: `/diaries/${entry.diaryId}/membership`, body: { favorite: true } }); entry.favoriteDone = true; await persist()
    }
    await cacheMemberDocument(diary, entry)
    assertActive()
    await rememberLocalMeta(diary, entry)
    assertActive()
    const lost = entry.skipped.filter(row => !CARRIED_KINDS.has(row.kind))
    // 끊긴 사이 게스트에서 더 쓴 내용이 있으면(또는 확인할 수 없으면) 원본에만 있는 내용이 생긴 것이라 지우지 않는다.
    const unchanged = entry.contentStamp === guestContentStamp(diary, await loadGuestDoc(diary))
    assertActive()
    const record = { diaryId: entry.diaryId, importedAt: now(), skipped: skippedSummary(lost), removeOriginal: unchanged && !losesContent(lost) }
    await updateLedger(storage, ledger => ({ ...ledger, imports: { ...ledger.imports, [diary.id]: { ...(ledger.imports[diary.id] ?? {}), [accountId]: record } } }))
    delete journal.diaries[diary.id]; await persist()
    // 옮기기는 이미 끝났다. 지우기 실패는 결과를 바꾸지 않고 다음 로그인 때 다시 지운다.
    if (record.removeOriginal) await removeOriginal(diary.id).catch(() => false)
    return record
  }

  return {
    /** 진행 중이던(앱이 꺼져 끝나지 않은) 가져오기가 있는 게스트 다이어리 id */
    async pendingIds() { return journal ? Object.keys(journal.diaries) : journalStore.pendingIds() },
    /**
     * 다이어리를 하나씩 가져온다. 실패한 다이어리는 기록을 남기고 다음 것으로 넘어간다. 다시 부르면 실패한 것만 이어서 보낸다.
     * 결과: { imported: [{guestDiaryId, diaryId, skipped}], failed: [{guestDiaryId, error}] }
     */
    async run(diaries, { onProgress } = {}) {
      if (running) return running
      const operation = (async () => {
        const imported = [], failed = []
        for (const diary of diaries) {
          try { imported.push({ guestDiaryId: diary.id, ...await importOne(diary, onProgress) }) }
          catch (error) {
            failed.push({ guestDiaryId: diary.id, error })
            // 계정이 바뀌었거나 로그인이 끝났으면 나머지도 보내지 않는다.
            if (error.status === 401 || error.code === 'UNAUTHENTICATED' || error.code === 'STALE_ACCOUNT') {
              for (const rest of diaries.slice(diaries.indexOf(diary) + 1)) failed.push({ guestDiaryId: rest.id, error })
              break
            }
          }
        }
        return { imported, failed }
      })()
      running = operation
      try { return await operation } finally { if (running === operation) running = null }
    },
  }
}
