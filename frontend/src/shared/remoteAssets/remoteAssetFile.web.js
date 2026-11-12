import { assetBaseUrl, remoteAssetUrl } from './remoteAssets.js'

// 웹은 파일을 저장하지 않고 주소를 그대로 쓴다. 객체 키가 내용 해시라 브라우저 · CloudFront 캐시를 오래 둬도 된다.
// 글꼴(@font-face)과 속지(fetch)는 다른 출처에서 읽으므로 CloudFront · S3 에 CORS 가 필요하다.
export async function fetchRemoteAsset(asset) {
  return remoteAssetUrl(asset, assetBaseUrl())
}

// 웹은 파일을 직접 두지 않으므로, 한 번 받아 쓴 에셋을 기억해 두고(브라우저 캐시에 있다) 받은 것으로 본다.
// 이 표시는 브라우저 HTTP 캐시의 실제 상태와 어긋날 수 있다(리뷰 S15P31F106-743):
// - 캐시를 지웠거나 밀려났는데 표시가 남으면, 목록 미리보기가 받은 글꼴로 여겨 불러오면서 다시 내려받는다.
//   이때도 받는 중 막대는 보이고(textFonts 의 downloading), 오프라인이라 실패하면 forgetRemoteAssetSaved 로 표시를 지워 다음부터 받기 아이콘이 보인다.
// - 시크릿 창 · 저장소 차단이면 localStorage 에 남지 않아, 그 탭 안에서만 받은 것으로 기억하고 새로 열면 다시 받기 표시가 뜬다.
// HTTP 캐시는 페이지에서 직접 확인할 수 없다. 정확히 하려면 글꼴을 Cache Storage 에 직접 넣고 blob 주소로 등록해야 해서(CORS fetch 필요) 이번에는 하지 않았다.
const SAVED_KEY = 'dio:remote-assets-saved:v1'
const readSaved = () => { try { return new Set(JSON.parse(globalThis.localStorage?.getItem(SAVED_KEY) ?? '[]')) } catch { return new Set() } }
let saved = null

/** 이미 받아 쓴 적이 있는 파일인가 */
export function isRemoteAssetSaved(asset) {
  saved ??= readSaved()
  return saved.has(asset.key)
}

/** 받아 쓴 파일로 기억한다(웹 전용. 네이티브는 파일이 있는지로 안다) */
export function markRemoteAssetSaved(asset) {
  saved ??= readSaved()
  if (saved.has(asset.key)) return
  saved.add(asset.key)
  try { globalThis.localStorage?.setItem(SAVED_KEY, JSON.stringify([...saved])) } catch { /* 기억하지 못하면 다음에 받기 표시가 다시 보일 뿐이다 */ }
}

/**
 * 받지 못한 글꼴의 @font-face 규칙을 지운다(웹 전용). expo-font 웹은 같은 이름 · 주소의 규칙이 있으면 새로 넣지 않고,
 * 실패한 글꼴에도 document.fonts.load 가 성공처럼 끝나서, 다시 받기를 눌러도 실제로는 받지 않고 받음으로 바뀌었다(브라우저 확인).
 * expo-font 의 unloadAsync 는 불러온 적 없는 글꼴이면 아무것도 하지 않아 쓸 수 없다.
 */
export function discardFailedFontFace(family) {
  const sheet = globalThis.document?.getElementById?.('expo-generated-fonts')?.sheet
  if (!sheet) return
  for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
    const name = sheet.cssRules[index]?.style?.fontFamily?.trim().replace(/^["']|["']$/g, '')
    if (name === family) sheet.deleteRule(index)
  }
}

/** 받은 것으로 기억했지만 불러오지 못한 파일(캐시가 지워진 채 오프라인 등): 기억을 지워 다음부터 받기 표시를 보인다 */
export function forgetRemoteAssetSaved(asset) {
  saved ??= readSaved()
  if (!saved.delete(asset.key)) return
  try { globalThis.localStorage?.setItem(SAVED_KEY, JSON.stringify([...saved])) } catch { /* 위와 같다 */ }
}

// 웹은 브라우저가 글꼴을 받으므로 진행률을 알 수 없다(목록은 진행 막대 대신 도는 표시를 보인다)
export const subscribeRemoteAssetProgress = () => () => {}
export const remoteAssetProgress = () => undefined

/** 원격 텍스트 파일(스티커 팩 JSON 등)을 읽는다 */
export async function readRemoteText(asset) {
  const response = await fetch(await fetchRemoteAsset(asset))
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response.text()
}
