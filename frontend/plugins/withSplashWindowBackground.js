const fs = require('fs')
const path = require('path')
const { withAndroidStyles, withDangerousMod, AndroidConfig } = require('expo/config-plugins')

/**
 * 안드로이드는 로고를 JS 시작 화면(src/shared/BootSplash.js, PNG)에서 한 번만 보인다. 그 전 화면은 같은 바탕색만 깐다.
 * - 안드로이드 12 이상의 시스템 시작 화면(Theme.App.SplashScreen)은 로고를 낮은 해상도로 다시 그려 흐렸다. 아이콘을 빈 그림으로 둔다.
 * - 창 바탕(AppTheme)은 시작 화면이 내려간 뒤 JS 번들이 실행되기 전까지(개발 빌드는 2초쯤) 보인다. 여기에 로고를 두면
 *   로고 → 빈 화면 → 로고로 두 번 뜨는 것처럼 보여서 바탕색만 둔다.
 * expo-splash-screen 이 Theme.App.SplashScreen 을 통째로 다시 쓰므로, app.json 에서 이 플러그인을 expo-splash-screen 보다 앞에 둔다
 * (나중에 등록한 플러그인의 스타일 수정이 먼저 실행된다).
 * 네이티브 설정이라 개발 빌드를 다시 만들어야 적용된다.
 */
const BLANK_ICON = 'splash_icon_blank'
const BLANK_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- plugins/withSplashWindowBackground.js 가 만든다: 시스템 시작 화면의 빈 아이콘 -->
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="@android:color/transparent" />
</shape>
`

module.exports = function withSplashWindowBackground(config) {
  config = withDangerousMod(config, ['android', async mod => {
    const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/drawable')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${BLANK_ICON}.xml`), BLANK_XML)
    return mod
  }])
  return withAndroidStyles(config, mod => {
    mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:windowBackground',
      value: '@color/splashscreen_background',
    })
    mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
      add: true,
      parent: { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' },
      name: 'windowSplashScreenAnimatedIcon',
      value: `@drawable/${BLANK_ICON}`,
    })
    return mod
  })
}
