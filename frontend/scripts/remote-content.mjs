// remote-content/ (앱 배포 없이 추가하는 글꼴 · 스티커 · 속지 원본) → catalog.json 과 올릴 파일 목록.
// build-remote-assets.mjs 가 부른다. 형식은 remote-content/README.md, 앱이 읽는 쪽은 src/shared/remoteAssets/remoteCatalog.js.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, posix } from 'node:path'
import { CATALOG_SCHEMA_VERSION, parseCatalog, parseStickerPack, STICKER_IMAGE_MAX, TEMPLATE_GROUPS } from '../src/shared/remoteAssets/remoteCatalog.js'
import { checkTemplateSvg } from './template-svg-rules.mjs'

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const FONT_MAX = 30 * 1024 * 1024
const SVG_MAX = 2 * 1024 * 1024
const PREFIX = 'catalog'

const sha256 = data => createHash('sha256').update(data).digest('hex')
const hashed = (dir, name, data) => {
  const ext = extname(name)
  return posix.join(PREFIX, dir, `${name.slice(0, -ext.length)}.${sha256(data).slice(0, 16)}${ext}`)
}
const folders = dir => existsSync(dir) ? readdirSync(dir).filter(name => statSync(join(dir, name)).isDirectory()).sort() : []
const readJson = (path, errors) => {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch (error) { errors.push(`${path}: JSON 을 읽지 못했어요 (${error.message})`); return null }
}
const byOrder = (a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.id.localeCompare(b.id)

function fontFile(dir, id, name, errors) {
  const path = join(dir, name ?? '')
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+\.(ttf|otf)$/.test(name) || !existsSync(path)) { errors.push(`fonts/${id}: 글꼴 파일 ${name} 이 없거나 이름이 올바르지 않아요(.ttf/.otf, 영문·숫자·-_.)`); return null }
  const data = readFileSync(path)
  const magic = data.subarray(0, 4).toString('latin1')
  if (!(magic === '\0\u0001\0\0' || magic === 'true' || magic === 'OTTO')) { errors.push(`fonts/${id}/${name}: TTF/OTF 파일이 아니에요`); return null }
  if (data.length > FONT_MAX) { errors.push(`fonts/${id}/${name}: 30 MiB 를 넘어요`); return null }
  return { source: path, key: hashed(`fonts/${id}`, name, data), size: data.length, sha256: sha256(data) }
}

// 그림 스티커는 PNG 만 받는다(투명 배경, 기기 · 웹 · 내보내기에서 같게 그려진다). 2 MiB · 한 변 2048px 이하
const STICKER_PNG_MAX = 2 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
function stickerImage(dir, packId, name, errors) {
  const path = join(dir, name)
  if (!/^[A-Za-z0-9._-]+\.png$/.test(name) || !existsSync(path)) { errors.push(`stickers/${packId}: 그림 ${name} 이 없거나 이름이 올바르지 않아요(.png, 영문·숫자·-_.)`); return null }
  const data = readFileSync(path)
  if (data.length < 24 || PNG_SIGNATURE.some((byte, i) => data[i] !== byte) || data.subarray(12, 16).toString('latin1') !== 'IHDR') { errors.push(`stickers/${packId}/${name}: PNG 파일이 아니에요`); return null }
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20)
  if (data.length > STICKER_PNG_MAX) { errors.push(`stickers/${packId}/${name}: 2 MiB 를 넘어요`); return null }
  if (width < 1 || height < 1 || width > STICKER_IMAGE_MAX || height > STICKER_IMAGE_MAX) { errors.push(`stickers/${packId}/${name}: 한 변이 ${STICKER_IMAGE_MAX}px 이하여야 해요(지금 ${width}×${height})`); return null }
  return { source: path, key: hashed(`stickers/${packId}`, name, data), size: data.length, sha256: sha256(data), width, height }
}

function templateFile(dir, id, orientation, name, errors) {
  const path = join(dir, name ?? '')
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+\.svg$/.test(name) || !existsSync(path)) { errors.push(`templates/${id}: ${orientation} SVG ${name} 이 없거나 이름이 올바르지 않아요(.svg, 영문·숫자·-_.)`); return null }
  const data = readFileSync(path)
  if (data.length > SVG_MAX) { errors.push(`templates/${id}/${name}: 2 MiB 를 넘어요`); return null }
  // 앱 속지와 같은 DIO 속지 형식만 받는다(크기 · 종이 사각형 · 선 색 6가지 · 도형만). 그래야 속지 색 바꾸기가 그대로 적용된다
  const problems = checkTemplateSvg(data.toString('utf8'), orientation)
  if (problems.length) { for (const problem of problems) errors.push(`templates/${id}/${name}: ${problem}`); return null }
  return { source: path, key: hashed(`templates/${id}`, name, data), size: data.length, sha256: sha256(data) }
}

/** content 폴더 → { catalog, uploads: [{ source | data, key }], errors } */
export function buildCatalog(content) {
  const errors = [], uploads = [], fonts = [], stickerPacks = [], templates = []
  for (const id of folders(join(content, 'fonts'))) {
    const dir = join(content, 'fonts', id)
    if (!ID.test(id)) { errors.push(`fonts/${id}: 폴더 이름은 영문 소문자·숫자·- (40자 이내)`); continue }
    const meta = readJson(join(dir, 'font.json'), errors)
    if (!meta) continue
    const regular = fontFile(dir, id, meta.regular, errors)
    const bold = meta.bold == null ? null : fontFile(dir, id, meta.bold, errors)
    if (!regular || (meta.bold != null && !bold)) continue
    const license = ['OFL.txt', 'LICENSE.txt', 'LICENSE'].find(name => existsSync(join(dir, name)))
    if (!license) { errors.push(`fonts/${id}: 라이선스 파일(OFL.txt 또는 LICENSE.txt)이 필요해요`); continue }
    uploads.push(regular, ...(bold ? [bold] : []), { source: join(dir, license), key: posix.join(PREFIX, 'fonts', id, license) })
    const strip = ({ key, size, sha256 }) => ({ key, size, sha256 })
    fonts.push({ id, label: meta.label, regular: strip(regular), ...(bold ? { bold: strip(bold) } : {}), ...(meta.hidden ? { hidden: true } : {}), order: meta.order })
  }
  for (const id of folders(join(content, 'stickers'))) {
    if (!ID.test(id)) { errors.push(`stickers/${id}: 폴더 이름은 영문 소문자·숫자·- (40자 이내)`); continue }
    const meta = readJson(join(content, 'stickers', id, 'pack.json'), errors)
    if (!meta) continue
    // 그림 스티커: "image": "cherry.png"(팩 폴더 안의 PNG) → 해시 이름 파일 + 원본 크기
    const images = []
    let imageError = false
    const stickers = (Array.isArray(meta.stickers) ? meta.stickers : []).map(sticker => {
      if (typeof sticker?.image !== 'string') return sticker
      const image = stickerImage(join(content, 'stickers', id), id, sticker.image, errors)
      if (!image) { imageError = true; return null }
      images.push(image)
      const { image: _, ...rest } = sticker
      return { ...rest, image: { key: image.key, size: image.size, sha256: image.sha256 }, width: image.width, height: image.height }
    })
    if (imageError) continue
    // 앱과 같은 검사를 거쳐 하나라도 빠지면 오류로 알린다(앱에서 조용히 사라지지 않게)
    const parsed = parseStickerPack({ id, name: meta.name ?? '' }, { stickers })
    if (!stickers.length || parsed.items.length !== stickers.length) {
      const bad = stickers.filter(sticker => !parsed.items.some(item => item.builtin === `remote:${id}:${sticker?.id}`)).map(sticker => sticker?.id ?? '(id 없음)')
      errors.push(`stickers/${id}: 스티커가 없거나 형식이 맞지 않아요 ${bad.length ? `(${bad.join(', ')})` : ''}`.trim())
      continue
    }
    const data = Buffer.from(JSON.stringify({ stickers }))
    const key = hashed(`stickers/${id}`, 'pack.json', data)
    uploads.push(...images, { data, key })
    stickerPacks.push({ id, name: meta.name, file: { key, size: data.length, sha256: sha256(data) }, stickers: stickers.map(sticker => sticker.id), ...(meta.hidden ? { hidden: true } : {}), order: meta.order })
  }
  // 새 속지 탭: remote-content/template-groups.json  [{ "id": "travel", "name": "여행", "order": 10, "hidden": false }]
  const templateGroups = []
  const groupsPath = join(content, 'template-groups.json')
  if (existsSync(groupsPath)) {
    const list = readJson(groupsPath, errors)
    if (list && !Array.isArray(list)) errors.push('template-groups.json: 배열([...])이어야 해요')
    for (const group of Array.isArray(list) ? list : []) {
      if (!ID.test(group?.id ?? '')) { errors.push(`template-groups.json: id ${group?.id} 는 영문 소문자·숫자·- (40자 이내)`); continue }
      if (TEMPLATE_GROUPS.includes(group.id)) { errors.push(`template-groups.json: ${group.id} 는 앱에 이미 있는 탭이에요`); continue }
      if (templateGroups.some(item => item.id === group.id)) { errors.push(`template-groups.json: ${group.id} 가 두 번 있어요`); continue }
      templateGroups.push({ id: group.id, name: group.name, ...(group.hidden ? { hidden: true } : {}), order: group.order })
    }
  }
  const groupIds = [...TEMPLATE_GROUPS, ...templateGroups.map(group => group.id)]
  for (const id of folders(join(content, 'templates'))) {
    const dir = join(content, 'templates', id)
    if (!ID.test(id)) { errors.push(`templates/${id}: 폴더 이름은 영문 소문자·숫자·- (40자 이내)`); continue }
    const meta = readJson(join(dir, 'template.json'), errors)
    if (!meta) continue
    if (!groupIds.includes(meta.group)) { errors.push(`templates/${id}: group 은 ${groupIds.join(' · ')} 중 하나예요(새 탭은 template-groups.json 에 먼저 적어요)`); continue }
    const landscape = templateFile(dir, id, 'landscape', meta.landscape, errors)
    const portrait = templateFile(dir, id, 'portrait', meta.portrait, errors)
    if (!landscape || !portrait) continue
    uploads.push(landscape, portrait)
    const strip = ({ key, size, sha256 }) => ({ key, size, sha256 })
    templates.push({ id, name: meta.name, group: meta.group, landscape: strip(landscape), portrait: strip(portrait), ...(meta.hidden ? { hidden: true } : {}), order: meta.order })
  }
  const clean = ({ order, ...item }) => item
  const catalog = { schemaVersion: CATALOG_SCHEMA_VERSION, fonts: fonts.sort(byOrder).map(clean), stickerPacks: stickerPacks.sort(byOrder).map(clean), templates: templates.sort(byOrder).map(clean),
    templateGroups: templateGroups.sort(byOrder).map(clean) }
  // 앱의 해석기를 통과하는지 마지막으로 확인한다(이름 길이 등)
  const check = parseCatalog(catalog)
  if (!check || check.fonts.length !== catalog.fonts.length || check.stickerPacks.length !== catalog.stickerPacks.length
    || check.templates.length !== catalog.templates.length || check.templateGroups.length !== catalog.templateGroups.length) {
    errors.push('catalog.json 이 앱 형식 검사를 통과하지 못했어요(이름은 1~40자)')
  }
  return { catalog, uploads, errors }
}
