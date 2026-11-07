// 지금 올라가 있는 catalog.json 과 새로 올릴 catalog.json 을 비교한다(업로드 안전장치).
//   node scripts/compare-remote-catalog.mjs <지금 목록> <새 목록>
// 이미 공개한 글꼴 · 스티커 팩 · 팩 안의 스티커 · 속지 · 속지 탭이 새 목록에서 빠지면 실패한다. 그 항목을 쓴 문서가 기본 모양(스티커는 빈 자리)으로 바뀌기 때문이다.
// 목록에서만 내리려면 지우지 말고 "hidden": true 를 쓴다(스티커는 pack.json 의 스티커마다). 정말 지워야 하면 ALLOW_CATALOG_REMOVAL=1 로 실행한다.
// 지금 목록 파일이 비어 있으면(fetch-remote-catalog.sh 가 '처음 올림'으로 만든 빈 파일) 비교를 건너뛴다.
// 내용이 있는데 읽지 못하면(손상 · 받다 끊김) 안전장치를 끄지 않고 실패한다.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const KINDS = [['fonts', '글꼴'], ['stickerPacks', '스티커 팩'], ['templates', '속지'], ['templateGroups', '속지 탭']]
const list = (catalog, kind) => (Array.isArray(catalog?.[kind]) ? catalog[kind] : [])
const ids = (catalog, kind) => new Set(list(catalog, kind).map(item => item?.id).filter(Boolean))

/** { removed: ['속지 spring-note', '스티커 spring:tulip', ...], added: [...] } */
export function compareCatalogs(previous, next) {
  const removed = [], added = []
  for (const [kind, label] of KINDS) {
    const before = ids(previous, kind), after = ids(next, kind)
    for (const id of before) if (!after.has(id)) removed.push(`${label} ${id}`)
    for (const id of after) if (!before.has(id)) added.push(`${label} ${id}`)
  }
  // 두 목록 모두에 있는 팩은 안의 스티커 id 까지 본다(catalog 의 stickerPacks[].stickers). 예전 목록에 id 목록이 없으면 비교할 수 없어 넘어간다
  const nextPacks = new Map(list(next, 'stickerPacks').map(pack => [pack?.id, pack]))
  for (const pack of list(previous, 'stickerPacks')) {
    const after = nextPacks.get(pack?.id)
    if (!after || !Array.isArray(pack.stickers)) continue
    const kept = new Set(Array.isArray(after.stickers) ? after.stickers : [])
    for (const sticker of pack.stickers) if (!kept.has(sticker)) removed.push(`스티커 ${pack.id}:${sticker}`)
    for (const sticker of Array.isArray(after.stickers) ? after.stickers : []) if (!pack.stickers.includes(sticker)) added.push(`스티커 ${pack.id}:${sticker}`)
  }
  return { removed, added }
}

/** 지금 목록 파일 → 목록 · 처음 올림(null). 내용이 있는데 읽지 못하면 오류를 던진다 */
export function readPreviousCatalog(text) {
  if (!text.trim()) return null
  let value
  try { value = JSON.parse(text) } catch (error) { throw new Error(`지금 올라간 catalog.json 을 읽지 못했습니다(${error.message}). 손상됐거나 받다 끊겼을 수 있어 비교 없이 올리지 않습니다.`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('지금 올라간 catalog.json 형식이 올바르지 않습니다. 비교 없이 올리지 않습니다.')
  return value
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [previousPath, nextPath] = process.argv.slice(2)
  let previous
  try { previous = readPreviousCatalog(readFileSync(previousPath, 'utf8')) } catch (error) { console.error(error.message); process.exit(1) }
  if (!previous) { console.log('지금 올라간 목록이 없어 비교를 건너뜁니다(처음 올림).'); process.exit(0) }
  const { removed, added } = compareCatalogs(previous, JSON.parse(readFileSync(nextPath, 'utf8')))
  if (added.length) console.log(`새로 공개: ${added.join(', ')}`)
  if (removed.length) {
    const message = `목록에서 빠지는 항목: ${removed.join(', ')}`
    if (process.env.ALLOW_CATALOG_REMOVAL === '1') { console.warn(`${message} (ALLOW_CATALOG_REMOVAL=1 이라 계속합니다)`); process.exit(0) }
    console.error(`${message}\n이미 쓴 문서가 기본 모양으로 바뀝니다. 지우지 말고 "hidden": true 로 숨기세요(스티커는 pack.json 의 스티커마다). 정말 지우려면 ALLOW_CATALOG_REMOVAL=1 로 다시 실행하세요.`)
    process.exit(1)
  }
  console.log('목록 비교 통과')
}
