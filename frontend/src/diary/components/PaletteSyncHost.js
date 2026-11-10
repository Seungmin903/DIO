import { useEffect } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createAuthenticatedMemberTransport } from '../services/memberTransport.js'
import { createPaletteSync } from '../../editor/services/paletteSync.js'
import { setPaletteSyncRetry, setPaletteSyncStatus } from '../../editor/services/paletteSyncStatus.js'
import { PALETTE_SCOPES, normalizePaletteEntry, paletteDefaults, paletteStore } from '../../editor/hooks/usePalettes'

// 로그인 직후 화면이 몇 번 다시 그려지며 이 컴포넌트가 여러 번 붙었다 떨어진다(StickerLibrarySyncHost 와 같은 사정).
// 같은 계정 · 로그인 세션이면 동기화 하나를 이어 쓰고, 모두 떨어진 채 잠시 지나야(다른 계정 · 로그아웃) 멈춘다
const RELEASE_MS = 1000
let shared = null // { id, sync, appState, mounts, releaseTimer }

function acquire(accountId) {
  const sessionKey = authService.getSessionKey()
  const id = `${accountId}:${sessionKey}`
  if (shared?.id === id) {
    if (shared.releaseTimer != null) { clearTimeout(shared.releaseTimer); shared.releaseTimer = null }
    shared.mounts++
    return shared
  }
  stopShared()
  const sync = createSync(accountId, sessionKey)
  const appState = AppState.addEventListener('change', state => { if (state === 'active') sync.sync() })
  shared = { id, sync, appState, mounts: 1, releaseTimer: null }
  setPaletteSyncRetry(() => sync.sync())
  sync.start()
  return shared
}
function release(entry) {
  if (shared !== entry) return
  entry.mounts--
  if (entry.mounts > 0) return
  entry.releaseTimer = setTimeout(() => { if (shared === entry && entry.mounts === 0) stopShared() }, RELEASE_MS)
}
function stopShared() {
  if (!shared) return
  if (shared.releaseTimer != null) clearTimeout(shared.releaseTimer)
  shared.sync.stop(); shared.appState.remove(); shared = null
  // 로그아웃 · 다른 계정: 지난 계정의 실패 문구 · 다시 맞추기를 남기지 않는다
  setPaletteSyncRetry(null)
  setPaletteSyncStatus({ error: null, pending: false })
}

const palettes = {
  scopes: PALETTE_SCOPES,
  defaults: paletteDefaults,
  normalize: normalizePaletteEntry,
  load: () => Promise.all(PALETTE_SCOPES.map(scope => paletteStore(scope).load())),
  snapshot: scope => paletteStore(scope).getSnapshot().colors,
  subscribe(listener) {
    const offs = PALETTE_SCOPES.map(scope => paletteStore(scope).subscribe(listener))
    return () => offs.forEach(off => off())
  },
  apply: (scope, expected, colors) => paletteStore(scope).apply(expected, colors),
}

function createSync(accountId, sessionKey) {
  const transport = createAuthenticatedMemberTransport({ auth: authService, accountId, baseUrl: apiBaseUrl, accessTokenHeader, fetchImpl: memberFetch })
  const sync = createPaletteSync({
    account: String(accountId),
    key: `dio:palette-sync:v1:${encodeURIComponent(apiBaseUrl)}`,
    storage: AsyncStorage,
    isActive: () => authService.getSessionKey() === sessionKey,
    api: {
      get: () => transport({ path: '/me/palettes' }).then(readPalettes),
      put: (expectedVersion, next) => transport({ method: 'PUT', path: '/me/palettes', body: { expectedVersion, palettes: next } }).then(readPalettes),
    },
    palettes,
    onError: error => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[DIO_PALETTE_SYNC]', error?.message) },
    // 운영 빌드에서도 실패가 드러나게 공방 도구 탭에 알린다(멈춘 동기화의 늦은 결과는 버린다)
    onStatus: next => { if (shared?.sync === sync) setPaletteSyncStatus({ error: next.error }) },
  })
  return sync
}

/**
 * 회원으로 로그인해 있는 동안 꾸미기 공방 도구 탭 팔레트를 계정 서버와 맞춘다. 화면은 그리지 않는다.
 * 앱을 켤 때 · 다시 앞으로 올 때 맞추고, 팔레트가 바뀌면 잠시 모아 올린다(editor/services/paletteSync.js).
 */
export function PaletteSyncHost({ accountId, enabled = true }) {
  useEffect(() => {
    if (!enabled || !/^[1-9]\d*$/.test(String(accountId ?? ''))) return undefined
    const entry = acquire(String(accountId))
    return () => release(entry)
  }, [enabled, accountId])
  return null
}

function readPalettes(body) {
  if (!body || !Number.isSafeInteger(body.version) || body.version < 0 || !body.palettes || typeof body.palettes !== 'object' || Array.isArray(body.palettes)) throw Error('팔레트 응답을 확인하지 못했어요.')
  return { version: body.version, palettes: body.palettes }
}
