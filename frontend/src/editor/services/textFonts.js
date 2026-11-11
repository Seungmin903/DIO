import { loadAsync } from 'expo-font'
import { isTextFontFamilyFailed, markTextFontLoaded, markTextFontFailed, notifyTextFontState, resolveFontId, setTextFontDownloader, setTextFontRequester, DEFAULT_TEXT_SETTINGS, getTextFonts } from '../utils/text'
import { refreshPersonalFonts } from '../../handwriting/library.js'
import { paperDeviceFontIds } from '../templates/planners.js'
import { isRemoteAsset, remoteAsset } from '../../shared/remoteAssets/remoteAssets.js'
import { discardFailedFontFace, fetchRemoteAsset, forgetRemoteAssetSaved, isRemoteAssetSaved, markRemoteAssetSaved, remoteAssetProgress, subscribeRemoteAssetProgress } from '../../shared/remoteAssets/remoteAssetFile'

// 글꼴 파일. 패키지 index 를 쓰면 모든 굵기 파일이 함께 묶이므로 쓰는 굵기 파일만 직접 가져온다.
// remoteAsset 은 번들에 넣지 않고 처음 쓸 때 에셋 저장소에서 내려받는다(src/shared/remoteAssets).
const FONT_FILES = {
  'Pretendard-Regular': require('../../../assets/fonts/pretendard/Pretendard-Regular.otf'),
  'Pretendard-Bold': require('../../../assets/fonts/pretendard/Pretendard-Bold.otf'),
  NanumGothic: require('@expo-google-fonts/nanum-gothic/400Regular/NanumGothic_400Regular.ttf'),
  NanumGothicBold: require('@expo-google-fonts/nanum-gothic/700Bold/NanumGothic_700Bold.ttf'),
  NanumMyeongjo: require('@expo-google-fonts/nanum-myeongjo/400Regular/NanumMyeongjo_400Regular.ttf'),
  NanumMyeongjoBold: require('@expo-google-fonts/nanum-myeongjo/700Bold/NanumMyeongjo_700Bold.ttf'),
  GowunDodum: remoteAsset('fonts/gowundodum/GowunDodum-Regular.ttf'),
  GowunBatang: remoteAsset('fonts/gowunbatang/GowunBatang-Regular.ttf'),
  GowunBatangBold: remoteAsset('fonts/gowunbatang/GowunBatang-Bold.ttf'),
  MaruBuri: remoteAsset('fonts/maruburi/MaruBuri-Regular.ttf'),
  MaruBuriBold: remoteAsset('fonts/maruburi/MaruBuri-Bold.ttf'),
  NanumPenScript: require('@expo-google-fonts/nanum-pen-script/400Regular/NanumPenScript_400Regular.ttf'),
  PoorStory: require('@expo-google-fonts/poor-story/400Regular/PoorStory_400Regular.ttf'),
}

// face(family) 하나를 한 번만 등록한다. 성공하면 쓸 수 있다고 알리고, 실패한 글꼴은 기본 글꼴로 남는다.
// 번들 글꼴은 다시 시도하지 않는다. 원격 글꼴은 네트워크 탓일 수 있어 REMOTE_RETRY_MS 가 지난 뒤 다음 요청에서 다시 받는다
// (렌더마다 요청이 오므로 실패하자마자 지우면 오프라인에서 끝없이 다시 받는다).
export const REMOTE_RETRY_MS = 30000
const loads = new Map()
// 받는 중인 원격 글꼴 face(목록에 받는 중 표시)
const downloading = new Set()
// 앱 글꼴은 FONT_FILES, 원격 목록(catalog.json)의 글꼴은 목록 항목의 files 에 face 별 파일이 있다
const fileOf = (font, family) => FONT_FILES[family] ?? font?.files?.[family]
// 결과는 { family, remote, ok }. 실패해도 거절하지 않는다(화면은 기본 글꼴로 그린다). 내보내기는 ok 를 보고 알린다(ensureExportFonts)
const OK = Object.freeze({ ok: true })
function loadFamily(family, font) {
  const file = fileOf(font, family)
  if (!file) return Promise.resolve(OK) // 내 폰트 등 파일이 따로 관리되는 글꼴
  if (!loads.has(family)) {
    const remote = isRemoteAsset(file)
    if (remote) { downloading.add(family); notifyTextFontState() }
    const job = remote ? fetchRemoteAsset(file).then(uri => loadAsync({ [family]: uri })).then(() => markRemoteAssetSaved(file)) : loadAsync({ [family]: file })
    const entry = job.finally(() => downloading.delete(family)).then(() => { markTextFontLoaded(family); return { family, remote, ok: true } }).catch(() => {
      if (remote) {
        forgetRemoteAssetSaved?.(file) // 받은 것으로 기억했는데 못 불러왔으면(웹 캐시가 지워진 채 오프라인 등) 다음부터 받기 표시
        discardFailedFontFace?.(family) // 웹: 실패한 @font-face 를 지워야 다시 받기가 실제로 다시 받는다
      }
      markTextFontFailed(family)
      // 그 사이 내보내기가 다시 받기 시작했으면 그 항목은 지우지 않는다
      if (remote) setTimeout(() => { if (loads.get(family) === entry) loads.delete(family) }, REMOTE_RETRY_MS)
      return { family, remote, ok: false }
    })
    loads.set(family, entry)
  }
  return loads.get(family)
}

function loadFont(font, bold) {
  const jobs = [loadFamily(font.family, font)]
  if (bold && font.boldFamily) jobs.push(loadFamily(font.boldFamily, font))
  return Promise.all(jobs)
}

// 글꼴을 찾거나 쓰는 곳(textStyle · loadedFontFamily · useTextFont)이 요청하면 그때 불러온다.
// 앱이 켜질 때 11개(약 57MB)를 한꺼번에 읽던 것을, 화면에 실제로 쓰이는 글꼴만 읽는 것으로 바꿨다.
// 렌더 경로에서 매번 불릴 수 있어, 이미 요청한 글꼴이면 Promise · 배열을 만들지 않고 Map 조회만 한다.
const needsLoad = (font, family) => fileOf(font, family) !== undefined && !loads.has(family)
setTextFontRequester((font, bold) => {
  if (needsLoad(font, font.family)) loadFamily(font.family, font)
  if (bold && font.boldFamily && needsLoad(font, font.boldFamily)) loadFamily(font.boldFamily, font)
})

// 글꼴 고르기 목록이 받았는지 · 받는 중인지를 보여 주고, 받기를 누르면 받는다(text.js textFontStatus · downloadTextFont)
setTextFontDownloader({
  // 받는 중 진행(1% 단위)은 글꼴 상태 알림(notifyTextFontState)과 따로 알린다. 상태 알림을 쓰면 글꼴을 쓰는
  // 캔버스 글자 · 목록 전체가 진행마다 다시 그려진다(리뷰 S15P31F106-743). 진행 막대(FontStatusMark)만 이것을 구독한다
  subscribeProgress: listener => subscribeRemoteAssetProgress?.(listener) ?? (() => {}),
  fileState: (font, family) => {
    const file = fileOf(font, family)
    if (!isRemoteAsset(file)) return 'bundled'
    if (downloading.has(family)) return 'downloading'
    return isRemoteAssetSaved(file) ? 'saved' : 'remote'
  },
  // 받는 중 진행률(0~1). 본 서체와 굵은 서체를 함께 받으므로 둘의 바이트를 더한다. 알 수 없으면(웹) null
  progress: font => {
    let total = 0, written = 0, known = false
    for (const family of [font.family, font.boldFamily]) {
      const file = family && fileOf(font, family)
      if (!isRemoteAsset(file)) continue
      total += file.size
      const now = remoteAssetProgress(file)
      if (now !== undefined) { written += now; known = true }
      // 다 받아 저장한 face 는 등록(loadAsync)이 끝날 때까지 꽉 찬 것으로 센다(막대가 도는 표시로 바뀌지 않게)
      else if (isRemoteAssetSaved(file)) { written += file.size; known = true }
      else if (!downloading.has(family)) written += file.size
    }
    return known && total ? Math.min(1, written / total) : null
  },
  download: font => {
    // 받지 못했던 원격 서체(본 · 굵은 서체 각각)는 다시 기다리지 않고 바로 다시 받는다. 받은 서체는 그대로 둔다
    for (const family of [font.family, font.boldFamily]) {
      if (family && isRemoteAsset(fileOf(font, family)) && isTextFontFamilyFailed(family)) loads.delete(family)
    }
    return loadFont(font, true)
  },
})

/** 글꼴 id 들의 파일을 불러오고 끝날 때까지 기다린다. bold 면 굵은 서체도 함께 */
export function ensureTextFonts(ids, { bold = false } = {}) {
  const jobs = []
  for (const id of new Set(ids)) {
    const font = getTextFonts().find(f => f.id === resolveFontId(id))
    if (font) jobs.push(loadFont(font, bold))
  }
  return Promise.all(jobs)
}

/** 요소들이 쓰는 글꼴(bold 인 요소는 굵은 서체까지)을 불러온다. 내보내기 전에 기다린다 */
export function ensureTextFontsFor(objects, extraIds = []) {
  const jobs = [ensureTextFonts(extraIds, { bold: true })]
  for (const o of objects) {
    if (!['text', 'shape'].includes(o.type) || !o.text) continue
    const bold = Boolean(o.bold)
    jobs.push(ensureTextFonts([o.font ?? DEFAULT_TEXT_SETTINGS.font], { bold }))
  }
  return Promise.all(jobs)
}

/**
 * 내보내기 직전에 기다릴 글꼴: 글자 요소가 쓰는 글꼴(굵게면 Bold까지)과, 속지가 앱 글꼴로 그리는 글(데일리 플래너가 비추는 글의 마루부리).
 * snapshot 은 createExportSnapshot 의 결과다(template = { backgroundAssetId, templateVersion } | null).
 */
export const ensureExportFonts = async snapshot => {
  const load = () => ensureTextFontsFor(snapshot.objects, snapshot.template ? paperDeviceFontIds(snapshot.template.backgroundAssetId) : [])
  const failedRemote = results => results.flat(Infinity).filter(result => result?.remote && !result.ok).map(result => result.family)
  // 원격 글꼴을 받지 못했으면(오프라인 · 저장소 장애) 다시 기다리지 않고 한 번 바로 다시 받는다
  let failed = failedRemote(await load())
  if (failed.length) {
    for (const family of failed) loads.delete(family)
    failed = failedRemote(await load())
  }
  // 그래도 못 받으면 기본 글꼴로 바뀐 결과물을 조용히 내보내지 않고 알린다(PageImageSurface 가 EXPORT_FONT_FAILED 로 바꾼다)
  if (failed.length) throw new Error('글꼴을 받지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.')
}

const PRELOAD_DELAY_MS = 600
let loading = null

/**
 * 앱이 켜지고 첫 화면이 그려진 뒤(PRELOAD_DELAY_MS) 기본 글꼴과 내 폰트 목록만 미리 준비한다.
 * InteractionManager.runAfterInteractions 는 쓰지 않는다: 이 앱에서는 그 콜백이 9초가 지나도 실행되지 않았다(안드로이드 실기기에서 확인, 원인은 조사하지 않음).
 * 다른 앱 글꼴은 문서가 쓰거나 글꼴 목록을 열 때 불러온다.
 */
export function preloadTextFonts() {
  if (!loading) {
    loading = new Promise(resolve => setTimeout(resolve, PRELOAD_DELAY_MS)).then(() => Promise.all([
      ensureTextFonts([DEFAULT_TEXT_SETTINGS.font]),
      refreshPersonalFonts().catch(() => {}),
    ]))
  }
  return loading
}
