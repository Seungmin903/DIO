const { withMainApplication, withAppDelegate } = require('expo/config-plugins')

/**
 * iOS는 development 프로필 또는 명시적 opt-in에 포인터 이벤트를 켠다.
 * EAS preview·production도 명시적으로 opt-in한다. 배포 빌드 기기 QA가 필요하다.
 * Android의 기존 설정은 유지한다.
 * 터치 이벤트에는 펜·손가락 구분이 없어서, pointerType('pen' | 'touch')으로 펜만 그리게 하려고 쓴다. (src/editor/utils/stylus.js)
 * 네이티브 설정이라 개발 빌드를 다시 만들어야 적용된다. Expo Go 에서는 꺼진 채로 동작한다.
 */
const LINE = 'com.facebook.react.config.ReactFeatureFlags.dispatchPointerEvents = true'

module.exports = function withPointerEvents(config) {
  config = withAppDelegate(config, mod => {
    mod.modResults.contents = enableIOSPointers(mod.modResults.contents, mod.modResults.language,
      shouldEnableIOSPointers(process.env.EAS_BUILD_PROFILE, process.env.DIO_IOS_POINTER_EVENTS))
    return mod
  })
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

// Fail loudly if Expo's generated entry point changes; a silent miss would leave
// iPad pressure unavailable even in a newly built development client.
function enableIOSPointers(contents, language, enabled = true) {
  const swift = language === 'swift'
  const value = swift ? enabled ? 'true' : 'false' : enabled ? 'YES' : 'NO'
  const call = `RCTSetDispatchW3CPointerEvents(${value})${swift ? '' : ';'}`
  // Also turn off a call left by a previous local development prebuild.
  if (/RCTSetDispatchW3CPointerEvents\((?:true|false|YES|NO)\);?/.test(contents)) {
    return contents.replace(/RCTSetDispatchW3CPointerEvents\((?:true|false|YES|NO)\);?/g, call)
  }
  if (!enabled) return contents
  const pattern = swift ? /(didFinishLaunchingWithOptions[\s\S]*?\)\s*->\s*Bool\s*\{)/
    : /(didFinishLaunchingWithOptions[\s\S]*?\{)/
  if (!pattern.test(contents)) throw new Error('withPointerEvents: iOS AppDelegate launch entry not found')
  if (swift && !/^import React$/m.test(contents)) contents = `import React\n${contents}`
  if (!swift && !contents.includes('<React/RCTConstants.h>')) contents = `#import <React/RCTConstants.h>\n${contents}`
  return contents.replace(pattern, `$1\n    ${call}`)
}
module.exports.enableIOSPointers = enableIOSPointers
function shouldEnableIOSPointers(profile, override) {
  return override === '1' || (override !== '0' && profile === 'development')
}
module.exports.shouldEnableIOSPointers = shouldEnableIOSPointers
