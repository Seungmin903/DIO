// 앱 번들에 넣지 않고 S3(CloudFront)에서 내려받는 에셋을 준비한다.
//
//   node scripts/build-remote-assets.mjs          매니페스트(src/shared/remoteAssets/manifest.js)와 업로드용 폴더(remote-assets-dist/)를 만든다
//   node scripts/build-remote-assets.mjs --check  매니페스트가 지금 파일과 같은지, remote-content/ 형식이 맞는지만 검사한다(다르면 실패)
//   node scripts/build-remote-assets.mjs --dist-only --out <폴더>  매니페스트는 고치지 않고(일치만 검사) 업로드용 폴더만 만든다(CI 게시용)
//   --content <폴더> --out <폴더>                  remote-content/ · remote-assets-dist/ 대신 쓸 폴더
//
// 두 가지를 함께 만든다.
// 1) 앱 코드가 아는 원격 에셋(assets/ 의 글꼴 · 2026 속지): manifest.js 에 적혀 앱과 함께 배포된다.
// 2) 앱 배포 없이 추가하는 글꼴 · 스티커(remote-content/): catalog.json 에 적혀 에셋 저장소에만 올라간다(scripts/remote-content.mjs).
//
// 원본은 그대로 assets/ 에 둔다(속지·글꼴 생성 스크립트와 백엔드 테스트가 이 경로를 읽는다).
// Metro는 require 한 파일만 번들에 넣으므로, 여기 고른 파일은 코드에서 require 하지 않으면 번들에서 빠진다.
// 객체 키에는 내용 해시를 붙여 같은 키의 내용이 바뀌지 않게 한다(CloudFront·앱 캐시를 무효화할 필요가 없다).
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from './remote-content.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(ROOT, 'assets')
const option = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null }
const DIST = option('--out') ?? join(ROOT, 'remote-assets-dist')
const CONTENT = option('--content') ?? join(ROOT, 'remote-content')
const MANIFEST = join(ROOT, 'src/shared/remoteAssets/manifest.js')

// 원격으로 옮기는 파일. 기본(번들 유지): Pretendard(UI 글꼴), 나눔 계열(npm 패키지), 만년형 속지, 2026 공용 속지(reusable)
const REMOTE_RULES = [
  { dir: 'fonts/gowundodum', test: name => /\.ttf$/.test(name) },
  { dir: 'fonts/gowunbatang', test: name => /\.ttf$/.test(name) },
  { dir: 'fonts/maruburi', test: name => /\.ttf$/.test(name) },
  { dir: 'templates/2026/SVG', test: name => name.endsWith('.svg') && !name.startsWith('2026-reusable-') },
]
// 글꼴 폴더의 라이선스 파일은 글꼴과 함께 배포한다(OFL). 해시를 붙이지 않은 고정 경로로 올린다.
const LICENSE_FILES = ['fonts/gowundodum/OFL.txt', 'fonts/gowunbatang/OFL.txt', 'fonts/maruburi/OFL.txt']

const toPosix = path => path.split(sep).join('/')

function collect() {
  const files = {}
  for (const rule of REMOTE_RULES) {
    for (const name of readdirSync(join(ASSETS, rule.dir)).sort()) {
      if (!rule.test(name)) continue
      const path = posix.join(rule.dir, name)
      const data = readFileSync(join(ASSETS, path))
      const sha256 = createHash('sha256').update(data).digest('hex')
      const ext = extname(name)
      const key = posix.join(rule.dir, `${name.slice(0, -ext.length)}.${sha256.slice(0, 16)}${ext}`)
      files[path] = { key, size: data.length, sha256 }
    }
  }
  return files
}

const render = files => `// 이 파일은 scripts/build-remote-assets.mjs 가 만든다. 직접 고치지 말 것.
// 키: assets/ 기준 원본 경로, key: 에셋 저장소(EXPO_PUBLIC_ASSET_BASE_URL) 기준 객체 경로
export const REMOTE_ASSET_MANIFEST = ${JSON.stringify(files, null, 2)}
`

const files = collect()
const text = render(files)
const content = buildCatalog(CONTENT)
if (content.errors.length) {
  console.error(['remote-content/ 를 확인해 주세요:', ...content.errors.map(error => '  - ' + error)].join('\n'))
  process.exit(1)
}
// --check · --dist-only 는 저장소 파일을 고치지 않는다. 커밋된 매니페스트가 assets/ 와 다르면 실패한다
// (앱과 함께 배포된 매니페스트와 올리는 파일이 어긋나면 앱이 받은 파일의 해시가 맞지 않는다).
const readOnly = process.argv.includes('--check') || process.argv.includes('--dist-only')
if (readOnly) {
  let current = ''
  try { current = readFileSync(MANIFEST, 'utf8') } catch { /* 없는 경우도 불일치로 본다 */ }
  if (current !== text) {
    console.error('원격 에셋 매니페스트가 assets/ 와 다릅니다. pnpm assets:remote 로 다시 만들어 커밋하세요.')
    process.exit(1)
  }
}
if (process.argv.includes('--check')) {
  console.log(`원격 에셋 매니페스트 일치 (${Object.keys(files).length}개), remote-content 글꼴 ${content.catalog.fonts.length} · 스티커 팩 ${content.catalog.stickerPacks.length} · 속지 ${content.catalog.templates.length}`)
} else {
  if (!readOnly) writeFileSync(MANIFEST, text)
  rmSync(DIST, { recursive: true, force: true })
  for (const [path, entry] of Object.entries(files)) {
    mkdirSync(dirname(join(DIST, entry.key)), { recursive: true })
    copyFileSync(join(ASSETS, path), join(DIST, entry.key))
  }
  for (const path of LICENSE_FILES) {
    mkdirSync(dirname(join(DIST, path)), { recursive: true })
    copyFileSync(join(ASSETS, path), join(DIST, path))
  }
  for (const upload of content.uploads) {
    mkdirSync(dirname(join(DIST, upload.key)), { recursive: true })
    if (upload.source) copyFileSync(upload.source, join(DIST, upload.key)); else writeFileSync(join(DIST, upload.key), upload.data)
  }
  writeFileSync(join(DIST, 'catalog.json'), JSON.stringify(content.catalog, null, 2))
  const total = Object.values(files).reduce((sum, entry) => sum + entry.size, 0)
  console.log(`원격 에셋 ${Object.keys(files).length}개 (${(total / 1024 / 1024).toFixed(1)} MiB) → ${toPosix(relative(ROOT, DIST))}/`)
  if (!readOnly) console.log(`매니페스트 → ${toPosix(relative(ROOT, MANIFEST))}`)
  console.log(`catalog.json: 글꼴 ${content.catalog.fonts.length} · 스티커 팩 ${content.catalog.stickerPacks.length} · 속지 ${content.catalog.templates.length} (remote-content/)`)
}
