// 지금 올라가 있는 catalog.json 과 새로 올릴 catalog.json 을 비교한다(업로드 안전장치).
//   node scripts/compare-remote-catalog.mjs <지금 목록> <새 목록>
// 이미 공개한 글꼴 · 스티커 팩 · 속지가 새 목록에서 빠지면 실패한다. 그 항목을 쓴 문서가 기본 모양으로 바뀌기 때문이다.
// 목록에서만 내리려면 폴더를 지우지 말고 "hidden": true 를 쓴다. 정말 지워야 하면 ALLOW_CATALOG_REMOVAL=1 로 실행한다.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const KINDS = [['fonts', '글꼴'], ['stickerPacks', '스티커 팩'], ['templates', '속지']]
const ids = (catalog, kind) => new Set((Array.isArray(catalog?.[kind]) ? catalog[kind] : []).map(item => item?.id).filter(Boolean))

/** { removed: ['속지 spring-note', ...], added: [...] } */
export function compareCatalogs(previous, next) {
  const removed = [], added = []
  for (const [kind, label] of KINDS) {
    const before = ids(previous, kind), after = ids(next, kind)
    for (const id of before) if (!after.has(id)) removed.push(`${label} ${id}`)
    for (const id of after) if (!before.has(id)) added.push(`${label} ${id}`)
  }
  return { removed, added }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [previousPath, nextPath] = process.argv.slice(2)
  const read = path => JSON.parse(readFileSync(path, 'utf8'))
  let previous
  try { previous = read(previousPath) } catch { previous = null }
  if (!previous) { console.log('지금 올라간 목록이 없어 비교를 건너뜁니다(처음 올림).'); process.exit(0) }
  const { removed, added } = compareCatalogs(previous, read(nextPath))
  if (added.length) console.log(`새로 공개: ${added.join(', ')}`)
  if (removed.length) {
    const message = `목록에서 빠지는 항목: ${removed.join(', ')}`
    if (process.env.ALLOW_CATALOG_REMOVAL === '1') { console.warn(`${message} (ALLOW_CATALOG_REMOVAL=1 이라 계속합니다)`); process.exit(0) }
    console.error(`${message}\n이미 쓴 문서가 기본 모양으로 바뀝니다. 지우지 말고 "hidden": true 로 숨기세요. 정말 지우려면 ALLOW_CATALOG_REMOVAL=1 로 다시 실행하세요.`)
    process.exit(1)
  }
  console.log('목록 비교 통과')
}
