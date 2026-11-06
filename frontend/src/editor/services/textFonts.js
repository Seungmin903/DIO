import { loadAsync } from 'expo-font'
import { markTextFontLoaded, markTextFontFailed, resolveFontId, setTextFontRequester, DEFAULT_TEXT_SETTINGS, TEXT_FONTS } from '../utils/text'
import { refreshPersonalFonts } from '../../handwriting/library.js'
import { paperDeviceFontIds } from '../templates/planners.js'
import { isRemoteAsset, remoteAsset } from '../../shared/remoteAssets/remoteAssets.js'
import { fetchRemoteAsset } from '../../shared/remoteAssets/remoteAssetFile'

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
function loadFamily(family) {
  const file = FONT_FILES[family]
  if (!file) return Promise.resolve() // 내 폰트 등 파일이 따로 관리되는 글꼴
  if (!loads.has(family)) {
    const remote = isRemoteAsset(file)
    const job = remote ? fetchRemoteAsset(file).then(uri => loadAsync({ [family]: uri })) : loadAsync({ [family]: file })
    loads.set(family, job.then(() => markTextFontLoaded(family)).catch(() => {
      markTextFontFailed(family)
      if (remote) setTimeout(() => loads.delete(family), REMOTE_RETRY_MS)
    }))
  }
  return loads.get(family)
}

function loadFont(font, bold) {
  const jobs = [loadFamily(font.family)]
  if (bold && font.boldFamily) jobs.push(loadFamily(font.boldFamily))
  return Promise.all(jobs)
}

// 글꼴을 찾거나 쓰는 곳(textStyle · loadedFontFamily · useTextFont)이 요청하면 그때 불러온다.
// 앱이 켜질 때 11개(약 57MB)를 한꺼번에 읽던 것을, 화면에 실제로 쓰이는 글꼴만 읽는 것으로 바꿨다.
// 렌더 경로에서 매번 불릴 수 있어, 이미 요청한 글꼴이면 Promise · 배열을 만들지 않고 Map 조회만 한다.
const needsLoad = family => FONT_FILES[family] !== undefined && !loads.has(family)
setTextFontRequester((font, bold) => {
  if (needsLoad(font.family)) loadFamily(font.family)
  if (bold && font.boldFamily && needsLoad(font.boldFamily)) loadFamily(font.boldFamily)
})

/** 글꼴 id 들의 파일을 불러오고 끝날 때까지 기다린다. bold 면 굵은 서체도 함께 */
export function ensureTextFonts(ids, { bold = false } = {}) {
  const jobs = []
  for (const id of new Set(ids)) {
    const font = TEXT_FONTS.find(f => f.id === resolveFontId(id))
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
export const ensureExportFonts = snapshot => ensureTextFontsFor(snapshot.objects, snapshot.template ? paperDeviceFontIds(snapshot.template.backgroundAssetId) : [])

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
