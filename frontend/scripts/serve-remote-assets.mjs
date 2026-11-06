// 개발용 에셋 저장소. pnpm assets:remote 로 만든 remote-assets-dist/ 를 S3 + CloudFront 처럼 내려준다.
// EXPO_PUBLIC_ASSET_BASE_URL 이 비어 있는 개발 앱은 http://<PC>:8090 을 쓴다(Android 에뮬레이터는 10.0.2.2).
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'remote-assets-dist')
const PORT = Number(process.env.ASSET_PORT || 8090)
const TYPES = { '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' }

createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD' }); return response.end() }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); return response.end() }
  const path = normalize(join(ROOT, decodeURIComponent(new URL(request.url, 'http://localhost').pathname)))
  if (!path.startsWith(ROOT + sep)) { response.writeHead(403); return response.end() }
  let stat
  try { stat = statSync(path) } catch { stat = null }
  if (!stat?.isFile()) { response.writeHead(404); return response.end() }
  response.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' })
  if (request.method === 'HEAD') return response.end()
  createReadStream(path).pipe(response)
}).listen(PORT, '0.0.0.0', () => console.log(`원격 에셋 개발 서버: http://localhost:${PORT} (${ROOT})`))
