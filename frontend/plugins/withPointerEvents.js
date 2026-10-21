const { withMainApplication } = require('expo/config-plugins')

/**
 * Android 에서 React Native 포인터 이벤트(onPointerDown 등)를 켠다.
 * 터치 이벤트에는 펜·손가락 구분이 없어서, pointerType('pen' | 'touch')으로 펜만 그리게 하려고 쓴다. (src/editor/utils/stylus.js)
 * 네이티브 설정이라 개발 빌드를 다시 만들어야 적용된다. Expo Go 에서는 꺼진 채로 동작한다.
 */
const LINE = 'com.facebook.react.config.ReactFeatureFlags.dispatchPointerEvents = true'

module.exports = function withPointerEvents(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('withPointerEvents: MainApplication.kt 만 지원합니다')
    if (!mod.modResults.contents.includes(LINE)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /super\.onCreate\(\)\r?\n/,
        (match) => `${match}    // 펜·손가락 구분용 포인터 이벤트 (plugins/withPointerEvents.js)\n    ${LINE}\n`,
      )
    }
    return mod
  })
}
