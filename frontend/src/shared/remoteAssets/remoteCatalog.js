// 앱 배포 없이 추가하는 에셋 목록(에셋 저장소의 catalog.json).
// scripts/build-remote-assets.mjs 가 remote-content/ 에서 만들고, 앱은 켜질 때 받아 기기에 저장해 둔다(오프라인이면 저장본).
// 목록에는 이름과 파일 위치만 있고, 글꼴 · 속지 파일은 쓸 때, 스티커 팩(작은 JSON)은 목록을 읽을 때 받는다.
//
// catalog.json
//   { schemaVersion: 1,
//     fonts: [{ id, label, regular: 파일, bold?: 파일, hidden? }],
//     stickerPacks: [{ id, name, file: 파일, hidden? }],
//     templates: [{ id, name, group: 'note'|'planner'|'diary', landscape: 파일, portrait: 파일, hidden? }] }
//   속지는 한 장짜리(장수를 고르는 속지)이며 서버에는 범용 행 dio-remote-<방향>(V33) + 페이지 설정 remoteTemplate 으로 저장된다.
//   파일 = { key, size, sha256 }  (key 는 에셋 저장소 기준 경로, 이름에 내용 해시가 들어 있다)
// hidden: 목록(글꼴 고르기 · 스티커 보관함)에서만 숨긴다. 이미 쓴 문서는 계속 그린다. 항목을 지우면 그 문서가 기본 모양으로 바뀐다.

export const CATALOG_SCHEMA_VERSION = 1
export const CATALOG_KEY = 'catalog.json'
export const CATALOG_STORAGE_KEY = 'dio:remote-catalog:v1'

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const KEY = /^(?!.*\.\.)[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/
const SHA256 = /^[a-f0-9]{64}$/
const label = value => typeof value === 'string' && value.trim() && value.trim().length <= 40 ? value.trim() : null

function file(value) {
  if (!value || typeof value !== 'object' || typeof value.key !== 'string' || !KEY.test(value.key)) return null
  if (!Number.isSafeInteger(value.size) || value.size <= 0 || typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) return null
  return { remote: true, path: value.key, key: value.key, size: value.size, sha256: value.sha256 }
}

/** 원격 속지를 넣을 속지 고르기 탭(diary/utils/paperChoice.js 의 PAPER_GROUPS) */
export const TEMPLATE_GROUPS = ['note', 'planner', 'diary']
const unique = items => { const seen = new Set(); return items.filter(item => !seen.has(item.id) && seen.add(item.id)) }

/** catalog.json → 쓸 수 있는 항목만. 형식이 다른 항목은 건너뛰고, 스키마 버전이 다르면 null(예전 앱이 모르는 형식) */
export function parseCatalog(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== CATALOG_SCHEMA_VERSION) return null
  const fonts = (Array.isArray(value.fonts) ? value.fonts : []).map(font => {
    const regular = file(font?.regular), bold = font?.bold == null ? null : file(font.bold)
    if (!ID.test(font?.id ?? '') || !label(font.label) || !regular || (font.bold != null && !bold)) return null
    return { id: font.id, label: label(font.label), regular, bold, hidden: font.hidden === true }
  }).filter(Boolean)
  const stickerPacks = (Array.isArray(value.stickerPacks) ? value.stickerPacks : []).map(pack => {
    const packFile = file(pack?.file)
    if (!ID.test(pack?.id ?? '') || !label(pack.name) || !packFile) return null
    return { id: pack.id, name: label(pack.name), file: packFile, hidden: pack.hidden === true }
  }).filter(Boolean)
  const templates = (Array.isArray(value.templates) ? value.templates : []).map(template => {
    const landscape = file(template?.landscape), portrait = file(template?.portrait)
    if (!ID.test(template?.id ?? '') || !label(template.name) || !TEMPLATE_GROUPS.includes(template.group) || !landscape || !portrait) return null
    return { id: template.id, name: label(template.name), group: template.group, hidden: template.hidden === true, files: { landscape, portrait } }
  }).filter(Boolean)
  return { fonts: unique(fonts), stickerPacks: unique(stickerPacks), templates: unique(templates) }
}

const COLOR = /^#[0-9a-fA-F]{6}$/
const PATH = /^[MmHhVvZzLl0-9 .,-]{1,20000}$/
const size = value => Number.isInteger(value) && value >= 1 && value <= 64

/** 스티커 팩 JSON({ stickers: [{ id, name, w, h, paths: [[색, 경로]] }] }) → 기본 스티커와 같은 모양. builtin 은 'remote:<팩>:<스티커>' */
export function parseStickerPack(pack, value) {
  const stickers = Array.isArray(value?.stickers) ? value.stickers : []
  const items = unique(stickers.map(sticker => {
    if (!ID.test(sticker?.id ?? '') || !label(sticker.name) || !size(sticker.w) || !size(sticker.h)) return null
    const paths = Array.isArray(sticker.paths) ? sticker.paths : []
    if (!paths.length || paths.length > 32 || !paths.every(p => Array.isArray(p) && p.length === 2 && COLOR.test(p[0]) && typeof p[1] === 'string' && PATH.test(p[1]))) return null
    return { id: sticker.id, builtin: `remote:${pack.id}:${sticker.id}`, name: label(sticker.name), w: sticker.w, h: sticker.h, paths: paths.map(([c, d]) => [c, d]) }
  }).filter(Boolean)).map(({ id, ...item }) => item)
  return { id: `remote:${pack.id}`, name: pack.name, hidden: pack.hidden, items }
}

/** 원격 글꼴 → 글꼴 목록 항목. family 는 앱 글꼴과 겹치지 않는 이름, files 는 face → 원격 파일 */
export function catalogTextFonts(fonts) {
  return fonts.map(font => {
    const family = `DIOR_${font.id.replace(/-/g, '_')}`
    const boldFamily = font.bold ? `${family}_Bold` : undefined
    return { id: `remote-${font.id}`, label: font.label, family, ...(boldFamily ? { boldFamily } : {}), remote: true, hidden: font.hidden,
      files: { [family]: font.regular, ...(boldFamily ? { [boldFamily]: font.bold } : {}) } }
  })
}

/**
 * 원격 목록 불러오기. 의존성을 받아 테스트할 수 있게 한다.
 * fetchCatalog(): catalog.json 글자, storage: { getItem, setItem }, readText(파일): 스티커 팩 글자,
 * applyFonts(목록 항목들), applyStickerPack(팩) · retainStickerPacks(팩 id 들), applyTemplates(속지 항목들)
 */
export function createRemoteCatalog({ fetchCatalog, storage, readText, applyFonts, applyStickerPack, retainStickerPacks, applyTemplates = () => {}, log = () => {} }) {
  let appliedText = null
  async function apply(text) {
    if (text === appliedText) return true
    let catalog
    try { catalog = parseCatalog(JSON.parse(text)) } catch { catalog = null }
    if (!catalog) return false
    appliedText = text
    applyFonts(catalogTextFonts(catalog.fonts))
    applyTemplates(catalog.templates)
    const ids = catalog.stickerPacks.map(pack => `remote:${pack.id}`)
    retainStickerPacks(ids) // 목록에서 빠진 팩을 먼저 뺀다
    await Promise.all(catalog.stickerPacks.map(async pack => {
      try { applyStickerPack(parseStickerPack(pack, JSON.parse(await readText(pack.file)))) }
      catch (error) { log('sticker-pack', pack.id, error) } // 받지 못한 팩은 다음에 다시 시도한다(다음 실행 · 새 목록)
    }))
    retainStickerPacks(ids) // 받은 순서가 아니라 목록 순서로 맞춘다
    return true
  }
  let loading = null
  /** 저장본을 먼저 적용하고(오프라인 대비) 새 목록을 받아 바뀌었으면 적용 · 저장한다 */
  function load() {
    if (!loading) loading = (async () => {
      try { const saved = await storage.getItem(CATALOG_STORAGE_KEY); if (saved) await apply(saved) } catch (error) { log('saved', error) }
      try {
        const text = await fetchCatalog()
        if (await apply(text)) await storage.setItem(CATALOG_STORAGE_KEY, text)
      } catch (error) { log('fetch', error) }
    })().finally(() => { loading = null })
    return loading
  }
  return { load }
}
