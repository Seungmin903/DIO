import { File } from 'expo-file-system'
import { fetch as expoFetch } from 'expo/fetch'
import { apiBaseUrl, authService } from '../../auth/authService'
import { canvasMediaFiles } from './canvasMediaFiles'

const baseUrl = `${apiBaseUrl.replace(/\/$/, '')}/v1/sticker-cutouts`
const mediaBaseUrl = apiBaseUrl.replace(/\/$/, '')
const debug = (event, detail) => { if (globalThis.__DEV__) console.info('[DIO_STICKER_CUTOUT]', event, detail) }
const requestPath = url => { try { return new URL(url).pathname } catch { return 'unknown' } }
const activeSession = () => ({ userId: authService.getCurrentUserId(), sessionKey: authService.getSessionKey() })
const assertActive = ({ userId, sessionKey }) => {
  if (!userId || authService.getCurrentUserId() !== userId || authService.getSessionKey() !== sessionKey) {
    throw Object.assign(new Error('로그인 상태가 변경됐어요. 다시 로그인해 주세요.'), { status: 401 })
  }
}

function requestError(status, body, fallback) {
  return Object.assign(new Error(body?.detail || fallback), { status, code: body?.code })
}

async function request(url, { method = 'GET', body, binary = false, session = activeSession() } = {}) {
  assertActive(session)
  const send = async (forceRefresh = false) => {
    const token = await authService.getAccessToken({ ...session, forceRefresh })
    assertActive(session)
    const headers = authService.getConnectionOptions().getAuthHeaders(url, token)
    if (typeof body === 'string') headers['Content-Type'] = 'application/json'
    try {
      return await expoFetch(url, { method, body, headers, credentials: 'omit', redirect: 'error' })
    } catch (error) {
      debug('network', { method, path: requestPath(url), message: error?.message || 'fetch failed' })
      throw requestError(0, null, '사진 오리기 서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    }
  }
  let response = await send()
  if (response.status === 401) response = await send(true)
  assertActive(session)
  if (!response.ok) {
    let body
    try { body = await response.json() } catch {}
    debug('response', { method, path: requestPath(url), status: response.status, code: body?.code, detail: body?.detail })
    throw requestError(response.status, body, '사진 오리기를 처리하지 못했어요. 다시 시도해 주세요.')
  }
  if (response.status === 204) return null
  if (binary) return new Uint8Array(await response.arrayBuffer())
  return response.json()
}

const isId = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)

function selection(strokes) {
  if (!Array.isArray(strokes) || !strokes.length) throw new Error('남길 대상을 먼저 칠해 주세요.')
  return { strokes }
}

export const stickerCutoutApi = {
  async open(source) {
    if (!source?.uri) throw new Error('사진을 먼저 선택해 주세요.')
    const body = new FormData()
    // 브라우저는 선택기의 File을 그대로, 네이티브는 expo/fetch가 읽을 수 있는 bytes() part를 보낸다.
    if (source.file) body.append('file', source.file, source.name || 'cutout-image.jpg')
    else body.append('file', { uri: source.uri, name: source.name || 'cutout-image.jpg', type: source.mimeType || 'image/jpeg', bytes: () => new File(source.uri).bytes() })
    const result = await request(baseUrl, { method: 'POST', body })
    if (!isId(result?.cutoutId) || !Number.isFinite(result.width) || !Number.isFinite(result.height)) throw new Error('사진 분석 응답을 확인하지 못했어요.')
    return result
  },
  async segment(cutoutId, strokes) {
    if (!isId(cutoutId)) throw new Error('사진을 먼저 분석해 주세요.')
    const result = await request(`${baseUrl}/${cutoutId}/segment`, { method: 'POST', body: JSON.stringify(selection(strokes)) })
    if (typeof result?.preview !== 'string' || !result.preview.startsWith('data:image/')) throw new Error('미리보기 응답을 확인하지 못했어요.')
    return result
  },
  async save(cutoutId, strokes) {
    if (!isId(cutoutId)) throw new Error('사진을 먼저 분석해 주세요.')
    const result = await request(`${baseUrl}/${cutoutId}/save`, { method: 'POST', body: JSON.stringify(selection(strokes)) })
    if (!isId(result?.mediaFileId)) throw new Error('저장 응답을 확인하지 못했어요.')
    const bytes = await request(`${mediaBaseUrl}/v1/media/${result.mediaFileId}/file`, { binary: true })
    if (!bytes.length) throw new Error('저장한 스티커 파일을 확인하지 못했어요.')
    await canvasMediaFiles.save(result.mediaFileId, bytes)
    return result
  },
  close(cutoutId) {
    return isId(cutoutId) ? request(`${baseUrl}/${cutoutId}`, { method: 'DELETE' }).catch(() => null) : Promise.resolve()
  },
}
