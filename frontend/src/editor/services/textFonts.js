import { loadAsync } from 'expo-font'
import { markTextFontLoaded, TEXT_FONTS } from '../utils/text'

// 글꼴 파일. 패키지 index 를 쓰면 모든 굵기 파일이 함께 묶이므로 쓰는 굵기 파일만 직접 가져온다.
const FONT_FILES = {
  NanumGothic: require('@expo-google-fonts/nanum-gothic/400Regular/NanumGothic_400Regular.ttf'),
  NanumMyeongjo: require('@expo-google-fonts/nanum-myeongjo/400Regular/NanumMyeongjo_400Regular.ttf'),
  NanumPenScript: require('@expo-google-fonts/nanum-pen-script/400Regular/NanumPenScript_400Regular.ttf'),
  PoorStory: require('@expo-google-fonts/poor-story/400Regular/PoorStory_400Regular.ttf'),
}

let loading = null

/**
 * 텍스트 글꼴을 한 번만, 하나씩 불러온다. (모두 합쳐 15MB 안팎이라 앱이 켜질 때 미리 시작한다)
 * 불러온 글꼴부터 쓸 수 있고, 아직이면 기본 글꼴로 보인다. 실패한 글꼴은 기본 글꼴로 남는다.
 */
export function preloadTextFonts() {
  if (!loading) {
    loading = Promise.all(
      TEXT_FONTS.filter((font) => font.family).map((font) =>
        loadAsync({ [font.family]: FONT_FILES[font.family] })
          .then(() => markTextFontLoaded(font.family))
          .catch(() => {}),
      ),
    )
  }
  return loading
}
