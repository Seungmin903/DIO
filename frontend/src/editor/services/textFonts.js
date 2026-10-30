import { loadAsync } from 'expo-font'
import { markTextFontLoaded, markTextFontFailed } from '../utils/text'
import { refreshPersonalFonts } from '../../handwriting/library.js'

// 글꼴 파일. 패키지 index 를 쓰면 모든 굵기 파일이 함께 묶이므로 쓰는 굵기 파일만 직접 가져온다.
const FONT_FILES = {
  NanumGothic: require('@expo-google-fonts/nanum-gothic/400Regular/NanumGothic_400Regular.ttf'),
  NanumGothicBold: require('@expo-google-fonts/nanum-gothic/700Bold/NanumGothic_700Bold.ttf'),
  NanumMyeongjo: require('@expo-google-fonts/nanum-myeongjo/400Regular/NanumMyeongjo_400Regular.ttf'),
  NanumMyeongjoBold: require('@expo-google-fonts/nanum-myeongjo/700Bold/NanumMyeongjo_700Bold.ttf'),
  GowunDodum: require('../../../assets/fonts/gowundodum/GowunDodum-Regular.ttf'),
  GowunBatang: require('../../../assets/fonts/gowunbatang/GowunBatang-Regular.ttf'),
  GowunBatangBold: require('../../../assets/fonts/gowunbatang/GowunBatang-Bold.ttf'),
  NanumPenScript: require('@expo-google-fonts/nanum-pen-script/400Regular/NanumPenScript_400Regular.ttf'),
  PoorStory: require('@expo-google-fonts/poor-story/400Regular/PoorStory_400Regular.ttf'),
}

let loading = null

/**
 * Regular와 실제 Bold 파일을 별도 face로 한 번 불러온다. 앱이 켜질 때 미리 시작한다.
 * 불러온 글꼴부터 쓸 수 있고, 아직이면 기본 글꼴로 보인다. 실패한 글꼴은 기본 글꼴로 남는다.
 */
export function preloadTextFonts() {
  if (!loading) {
    loading = Promise.all(
      [...Object.entries(FONT_FILES).map(([family, file]) =>
        loadAsync({ [family]: file })
          .then(() => markTextFontLoaded(family))
          .catch(() => markTextFontFailed(family)),
      ), refreshPersonalFonts().catch(() => {})],
    )
  }
  return loading
}
