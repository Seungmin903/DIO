const fs = require('fs')
const path = require('path')
const { withAndroidStyles, withDangerousMod, AndroidConfig } = require('expo/config-plugins')

/**
 * 안드로이드 창 바탕에 시작 화면과 같은 자리 · 크기의 로고를 깐다.
 * 시작 화면이 내려간 뒤 JS 번들이 실행되기 전까지(개발 빌드는 2초쯤) 창 바탕이 그대로 보이는데,
 * 여기에 로고가 있어야 시작 화면 → JS 시작 화면(src/shared/BootSplash.js) → 보관함으로 로고가 끊기지 않는다.
 * 로고 그림은 expo-splash-screen 이 만든 splashscreen_logo(288dp 칸, 가운데 로고)를 그대로 가운데에 놓는다.
 * 네이티브 설정이라 개발 빌드를 다시 만들어야 적용된다.
 */
const DRAWABLE = 'splash_window_background'
const XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- plugins/withSplashWindowBackground.js 가 만든다 -->
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background" />
  <item>
    <bitmap android:gravity="center" android:src="@drawable/splashscreen_logo" />
  </item>
</layer-list>
`

module.exports = function withSplashWindowBackground(config) {
  config = withDangerousMod(config, ['android', async mod => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/drawable')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${DRAWABLE}.xml`), XML)
    return mod
  }])
  return withAndroidStyles(config, mod => {
    mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:windowBackground',
      value: `@drawable/${DRAWABLE}`,
    })
    return mod
  })
}
