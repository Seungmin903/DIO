import { File } from 'expo-file-system'
import { fetch as expoFetch } from 'expo/fetch'
import { apiBaseUrl, authService } from '../../auth/authService'
import { canvasMediaFiles } from './canvasMediaFiles'

// apiBaseUrl은 authBaseUrl을 거쳐 이미 /api/v1까지 포함한다.
const baseUrl = `${apiBaseUrl.replace(/\/$/, '')}/sticker-cutouts`
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

async function request(url, { method = 'GET', body, binary = false, timeoutMs = 45000, session = activeSession() } = {}) {
  assertActive(session)
  const send = async (forceRefresh = false) => {
    const token = await authService.getAccessToken({ ...session, forceRefresh })
    assertActive(session)
    const headers = authService.getConnectionOptions().getAuthHeaders(url, token)
    if (typeof body === 'string') headers['Content-Type'] = 'application/json'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await expoFetch(url, { method, body, headers, signal: controller.signal, credentials: 'omit', redirect: 'error' })
      // 응답 본문을 다 읽을 때까지 타이머를 유지한다. 헤더만 받고 본문 전송이 멈춘 경우도 같은 시간 제한으로 끝낸다.
      return { response, finish: () => clearTimeout(timer), timedOut: () => controller.signal.aborted }
    } catch (error) {
      clearTimeout(timer)
      const timedOut = controller.signal.aborted
      debug(timedOut ? 'timeout' : 'network', { method, path: requestPath(url), message: error?.message || 'fetch failed' })
      throw requestError(timedOut ? 408 : 0, null, timedOut ? '사진 오리기 응답이 늦어요. 잠시 후 다시 시도해 주세요.' : '사진 오리기 서버에 연결하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    }
  }
  let attempt = await send()
  if (attempt.response.status === 401) {
    attempt.finish()
    attempt = await send(true)
  }
  try {
    const { response } = attempt
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
  } catch (error) {
    if (attempt.timedOut()) {
      debug('timeout', { method, path: requestPath(url), message: error?.message || 'fetch failed' })
      throw requestError(408, null, '사진 오리기 응답이 늦어요. 잠시 후 다시 시도해 주세요.')
    }
    throw error
  } finally { attempt.finish() }
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
    return result
  },
  async cache(mediaFileId) {
    if (!isId(mediaFileId)) throw new Error('저장한 스티커 정보를 확인하지 못했어요.')
    const bytes = await request(`${mediaBaseUrl}/media/${mediaFileId}/file`, { binary: true, timeoutMs: 120000 })
    if (!bytes.length) throw new Error('저장한 스티커 파일을 확인하지 못했어요.')
    await canvasMediaFiles.save(mediaFileId, bytes)
  },
  close(cutoutId) {
    return isId(cutoutId) ? request(`${baseUrl}/${cutoutId}`, { method: 'DELETE' }).catch(() => null) : Promise.resolve()
  },
  discard(mediaFileId) {
    // 보관함 반영 전 실패한 AI 결과만 정리한다. 실제 캔버스·보관함 참조가 있으면 서버가 삭제를 거절한다.
    return isId(mediaFileId) ? request(`${mediaBaseUrl}/media/${mediaFileId}`, { method: 'DELETE' }).catch(() => null) : Promise.resolve()
  },
}
