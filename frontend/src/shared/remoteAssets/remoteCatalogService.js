import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { registerCatalogTextFonts } from '../../editor/utils/text'
import { registerRemoteStickerPack, retainRemoteStickerPacks } from '../../editor/builtinStickers'
import { assetBaseUrl } from './remoteAssets.js'
import { readRemoteText } from './remoteAssetFile'
import { CATALOG_KEY, createRemoteCatalog } from './remoteCatalog.js'

// 앱이 쓰는 원격 목록. App 이 켜질 때 한 번 부른다(loadRemoteCatalog). 실패해도 앱 동작에는 영향이 없다.
async function fetchCatalog() {
  const baseUrl = assetBaseUrl({ os: Platform.OS })
  if (!baseUrl) throw new Error('asset base url not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    // catalog.json 은 짧게 캐시한다(업로드 스크립트가 max-age=60). 기기 HTTP 캐시가 오래 붙잡지 않게 no-cache 로 확인한다
    const response = await fetch(`${baseUrl}/${CATALOG_KEY}`, { signal: controller.signal, cache: 'no-cache' })
    if (!response.ok) throw new Error('catalog HTTP ' + response.status)
    return await response.text()
  } finally { clearTimeout(timer) }
}

const catalog = createRemoteCatalog({
  fetchCatalog,
  storage: AsyncStorage,
  readText: readRemoteText,
  applyFonts: registerCatalogTextFonts,
  applyStickerPack: registerRemoteStickerPack,
  retainStickerPacks: retainRemoteStickerPacks,
  log: (...args) => { if (globalThis.__DEV__) console.info('[DIO_REMOTE_CATALOG]', ...args.map(String)) },
})

export const loadRemoteCatalog = () => catalog.load()
