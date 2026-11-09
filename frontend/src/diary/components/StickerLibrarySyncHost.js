import { useEffect } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createAuthenticatedMemberTransport } from '../services/memberTransport.js'
import { createMediaRequest } from '../../collaboration/canvasMedia.js'
import { canvasMediaFiles } from '../../editor/services/canvasMediaFiles'
import { createStickerLibrarySync } from '../../editor/services/stickerLibrarySync.js'
import { createTapeLibrarySync } from '../../editor/services/tapeLibrarySync.js'
import { createCoverLibrarySync } from '../services/coverLibrarySync.js'
import { createPaperLibrarySync } from '../services/paperLibrarySync.js'
import { myCoversReady, myCoversSnapshot, myPapersReady, myPapersSnapshot, replaceMyCovers, replaceMyPapers, subscribeMyLibrary } from '../hooks/useMyLibrary'
import { defaultPaperStyleReady, defaultPaperStyleSnapshot, replaceDefaultPaperStyle, subscribeDefaultPaperStyle } from '../hooks/useDefaultPaperStyle'
import { customDecorFolders, customDecorTapeFolders, replaceStickerFolders, replaceTapeFolders, subscribeCustomDecor, useCustomDecor } from '../../editor/hooks/useCustomDecor'
import { sharedGifMaxBytes } from '../../shared/mediaLimits.js'

// 로그인 직후 화면이 몇 번 다시 그려지며 이 컴포넌트가 여러 번 붙었다 떨어진다. 그때마다 새로 맞추면 보관함 조회가 수십 번 나가므로,
// 같은 계정 · 로그인 세션이면 동기화 하나를 이어 쓰고, 모두 떨어진 채 잠시 지나야(다른 계정 · 로그아웃) 멈춘다
const RELEASE_MS = 1000
let shared = null // { id, syncs, appState, mounts, releaseTimer }

function acquire(accountId) {
  const sessionKey = authService.getSessionKey()
  const id = `${accountId}:${sessionKey}`
  if (shared?.id === id) {
    if (shared.releaseTimer != null) { clearTimeout(shared.releaseTimer); shared.releaseTimer = null }
    shared.mounts++
    return shared
  }
  stopShared()
  const syncs = createSyncs(accountId, sessionKey)
  const appState = AppState.addEventListener('change', state => { if (state === 'active') for (const sync of syncs) sync.sync() })
  shared = { id, syncs, appState, mounts: 1, releaseTimer: null }
  for (const sync of syncs) sync.start()
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
  for (const sync of shared.syncs) sync.stop()
  shared.appState.remove(); shared = null
}

// 스티커 · 테이프 보관함 · 내 표지 · 내 속지는 따로 맞춘다(서버 문서 · 맞춘 상태 기록이 따로다). 인증 · 미디어 요청은 함께 쓴다
function createSyncs(accountId, sessionKey) {
  const active = () => authService.getSessionKey() === sessionKey
  const transport = createAuthenticatedMemberTransport({ auth: authService, accountId, baseUrl: apiBaseUrl, accessTokenHeader, fetchImpl: memberFetch })
  const request = createMediaRequest({ auth: authService, accountId, sessionKey, baseUrl: apiBaseUrl, fetchImpl: memberFetch })
  const server = encodeURIComponent(apiBaseUrl)
  // field: 문서의 목록 칸(보관함은 folders, 내 표지는 covers), read: 응답 확인
  const common = ({ path, category, tag, label, field = 'folders', read = body => readLibrary(body, label) }) => ({
    account: String(accountId),
    storage: AsyncStorage,
    isActive: active,
    api: {
      get: () => transport({ path }).then(read),
      put: (expectedVersion, list) => transport({ method: 'PUT', path, body: { expectedVersion, [field]: list } }).then(read),
    },
    media: {
      // 내 표지는 그림마다 종류(표지 사진 PHOTO · 스티커 STICKER)를 함께 넘긴다
      async upload(localId, kind = category) {
        const body = await request('/media', { method: 'POST', body: await canvasMediaFiles.upload(localId, kind), timeoutMs: 120000 })
        return body?.mediaFileId
      },
      async download(serverId) {
        if (await canvasMediaFiles.cached(serverId)) return
        const bytes = await request(`/media/${serverId}/file`, { binary: true, maxBytes: sharedGifMaxBytes, timeoutMs: 120000 })
        await canvasMediaFiles.save(serverId, bytes)
      },
    },
    onError: error => { if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(tag, error?.message) },
  })
  return [
    createStickerLibrarySync({
      ...common({ path: '/me/sticker-library', category: 'STICKER', tag: '[DIO_STICKER_SYNC]', label: '스티커 보관함' }),
      key: `dio:sticker-library-sync:v1:${server}`,
      decor: { snapshot: customDecorFolders, subscribe: subscribeCustomDecor, replace: replaceStickerFolders },
    }),
    createTapeLibrarySync({
      ...common({ path: '/me/tape-library', category: 'TAPE', tag: '[DIO_TAPE_SYNC]', label: '테이프 보관함' }),
      key: `dio:tape-library-sync:v1:${server}`,
      decor: { snapshot: customDecorTapeFolders, subscribe: subscribeCustomDecor, replace: replaceTapeFolders },
    }),
    createCoverLibrarySync({
      ...common({ path: '/me/cover-library', category: 'PHOTO', tag: '[DIO_COVER_SYNC]', label: '내 표지', field: 'covers', read: readCovers }),
      key: `dio:cover-library-sync:v1:${server}`,
      library: { ready: myCoversReady, snapshot: myCoversSnapshot, subscribe: subscribeMyLibrary, replace: replaceMyCovers },
    }),
    (() => {
      // 내 속지는 문서에 기본 속지 스타일이 함께 있어 저장 몸통이 다르다(papers · style)
      const paper = common({ path: '/me/paper-library', category: 'PHOTO', tag: '[DIO_PAPER_SYNC]', label: '내 속지', read: readPapers })
      return createPaperLibrarySync({
        ...paper,
        api: { get: paper.api.get, put: (expectedVersion, papers, style) => transport({ method: 'PUT', path: '/me/paper-library', body: { expectedVersion, papers, style } }).then(readPapers) },
        key: `dio:paper-library-sync:v1:${server}`,
        library: {
          ready: () => Promise.all([myPapersReady(), defaultPaperStyleReady()]),
          papers: myPapersSnapshot, style: defaultPaperStyleSnapshot,
          subscribe: listener => { const off = [subscribeMyLibrary(listener), subscribeDefaultPaperStyle(listener)]; return () => off.forEach(stop => stop()) },
          replacePapers: replaceMyPapers, replaceStyle: replaceDefaultPaperStyle,
        },
      })
    })(),
  ]
}

/**
 * 회원으로 로그인해 있는 동안 꾸미기 공방 스티커 · 테이프 보관함(폴더 구성 · 이미지)과 내 표지 · 내 속지(기본 속지 스타일 포함)를 계정 서버와 맞춘다. 화면은 그리지 않는다.
 * 앱을 켤 때 · 다시 앞으로 올 때 맞추고, 바뀌면 잠시 모아 올린다(services/stickerLibrarySync.js · tapeLibrarySync.js · diary/services/coverLibrarySync.js · paperLibrarySync.js).
 */
export function StickerLibrarySyncHost({ accountId, enabled = true }) {
  const { loaded } = useCustomDecor() // 보관함을 기기에서 읽어 둔다(읽은 뒤에 맞춘다)
  useEffect(() => {
    if (!enabled || !loaded || !/^[1-9]\d*$/.test(String(accountId ?? ''))) return undefined
    const entry = acquire(String(accountId))
    return () => release(entry)
  }, [enabled, loaded, accountId])
  return null
}

function readLibrary(body, label) {
  if (!body || !Number.isSafeInteger(body.version) || body.version < 0 || !Array.isArray(body.folders)) throw Error(`${label} 응답을 확인하지 못했어요.`)
  return { version: body.version, folders: body.folders.map(folder => ({ id: String(folder.id), name: String(folder.name ?? ''), items: Array.isArray(folder.items) ? folder.items.map(dropNulls) : [] })) }
}
function readCovers(body) {
  if (!body || !Number.isSafeInteger(body.version) || body.version < 0 || !Array.isArray(body.covers)) throw Error('내 표지 응답을 확인하지 못했어요.')
  // 표지 디자인(cover)은 서버가 받은 그대로 돌려준다. 바깥 칸(createdAt 등)만 빈 칸(null)을 뺀다
  return { version: body.version, covers: body.covers.map(dropNulls) }
}
function readPapers(body) {
  if (!body || !Number.isSafeInteger(body.version) || body.version < 0 || !Array.isArray(body.papers)) throw Error('내 속지 응답을 확인하지 못했어요.')
  return {
    version: body.version,
    papers: body.papers.map(entry => ({ ...dropNulls(entry), pages: Array.isArray(entry?.pages) ? entry.pages.map(dropNulls) : [] })),
    style: body.style && typeof body.style === 'object' ? dropNulls(body.style) : null,
  }
}
// 서버는 빈 칸을 null 로 보낸다. 기기 보관함과 비교할 때 같게 보이도록 빈 칸을 뺀다
const dropNulls = item => Object.fromEntries(Object.entries(item ?? {}).filter(([, value]) => value != null))
