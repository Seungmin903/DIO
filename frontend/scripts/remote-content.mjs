// remote-content/ (앱 배포 없이 추가하는 글꼴 · 스티커 · 속지 원본) → catalog.json 과 올릴 파일 목록.
// build-remote-assets.mjs 가 부른다. 형식은 remote-content/README.md, 앱이 읽는 쪽은 src/shared/remoteAssets/remoteCatalog.js.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, posix } from 'node:path'
import { CATALOG_SCHEMA_VERSION, parseCatalog, parseStickerPack, TEMPLATE_GROUPS } from '../src/shared/remoteAssets/remoteCatalog.js'

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const FONT_MAX = 30 * 1024 * 1024
const SVG_MAX = 2 * 1024 * 1024
// 앱 속지 좌표(editor/templates/data.js coordinateSystems)와 같아야 페이지에 꼭 맞는다
const SVG_SIZE = { landscape: '0 0 1024 768', portrait: '0 0 768 1024' }
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

function templateFile(dir, id, orientation, name, errors) {
  const path = join(dir, name ?? '')
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+\.svg$/.test(name) || !existsSync(path)) { errors.push(`templates/${id}: ${orientation} SVG ${name} 이 없거나 이름이 올바르지 않아요(.svg, 영문·숫자·-_.)`); return null }
  const data = readFileSync(path)
  const xml = data.toString('utf8')
  const root = /<svg\b[^>]*>/i.exec(xml)?.[0] ?? ''
  const viewBox = /\bviewBox\s*=\s*"([^"]*)"/.exec(root)?.[1]?.trim().replace(/\s+/g, ' ')
  if (data.length > SVG_MAX) errors.push(`templates/${id}/${name}: 2 MiB 를 넘어요`)
  else if (viewBox !== SVG_SIZE[orientation]) errors.push(`templates/${id}/${name}: ${orientation} 속지는 viewBox="${SVG_SIZE[orientation]}" 이어야 해요(지금 ${viewBox ?? '없음'})`)
  // 앱은 SVG 를 그대로 그린다. 스크립트 · 외부 그림 · 글자 요소는 기기마다 다르거나 위험해서 받지 않는다(글자는 윤곽선으로 바꿔 넣는다)
  else if (/<(script|image|foreignObject|text)\b/i.test(xml) || /\b(xlink:)?href\s*=\s*"(?!#)/i.test(xml)) errors.push(`templates/${id}/${name}: script · image · text · 외부 링크는 쓸 수 없어요(글자는 윤곽선으로)`)
  else return { source: path, key: hashed(`templates/${id}`, name, data), size: data.length, sha256: sha256(data) }
  return null
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
    const stickers = Array.isArray(meta.stickers) ? meta.stickers : []
    // 앱과 같은 검사를 거쳐 하나라도 빠지면 오류로 알린다(앱에서 조용히 사라지지 않게)
    const parsed = parseStickerPack({ id, name: meta.name ?? '' }, { stickers })
    if (!stickers.length || parsed.items.length !== stickers.length) {
      const bad = stickers.filter(sticker => !parsed.items.some(item => item.builtin === `remote:${id}:${sticker?.id}`)).map(sticker => sticker?.id ?? '(id 없음)')
      errors.push(`stickers/${id}: 스티커가 없거나 형식이 맞지 않아요 ${bad.length ? `(${bad.join(', ')})` : ''}`.trim())
      continue
    }
    const data = Buffer.from(JSON.stringify({ stickers }))
    const key = hashed(`stickers/${id}`, 'pack.json', data)
    uploads.push({ data, key })
    stickerPacks.push({ id, name: meta.name, file: { key, size: data.length, sha256: sha256(data) }, ...(meta.hidden ? { hidden: true } : {}), order: meta.order })
  }
  for (const id of folders(join(content, 'templates'))) {
    const dir = join(content, 'templates', id)
    if (!ID.test(id)) { errors.push(`templates/${id}: 폴더 이름은 영문 소문자·숫자·- (40자 이내)`); continue }
    const meta = readJson(join(dir, 'template.json'), errors)
    if (!meta) continue
    if (!TEMPLATE_GROUPS.includes(meta.group)) { errors.push(`templates/${id}: group 은 ${TEMPLATE_GROUPS.join(' · ')} 중 하나예요`); continue }
    const landscape = templateFile(dir, id, 'landscape', meta.landscape, errors)
    const portrait = templateFile(dir, id, 'portrait', meta.portrait, errors)
    if (!landscape || !portrait) continue
    uploads.push(landscape, portrait)
    const strip = ({ key, size, sha256 }) => ({ key, size, sha256 })
    templates.push({ id, name: meta.name, group: meta.group, landscape: strip(landscape), portrait: strip(portrait), ...(meta.hidden ? { hidden: true } : {}), order: meta.order })
  }
  const clean = ({ order, ...item }) => item
  const catalog = { schemaVersion: CATALOG_SCHEMA_VERSION, fonts: fonts.sort(byOrder).map(clean), stickerPacks: stickerPacks.sort(byOrder).map(clean), templates: templates.sort(byOrder).map(clean) }
  // 앱의 해석기를 통과하는지 마지막으로 확인한다(이름 길이 등)
  const check = parseCatalog(catalog)
  if (!check || check.fonts.length !== catalog.fonts.length || check.stickerPacks.length !== catalog.stickerPacks.length || check.templates.length !== catalog.templates.length) {
    errors.push('catalog.json 이 앱 형식 검사를 통과하지 못했어요(이름은 1~40자)')
  }
  return { catalog, uploads, errors }
}
