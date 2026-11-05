const { withProjectBuildGradle, withAppBuildGradle, withGradleProperties } = require('expo/config-plugins')
const crypto = require('crypto')
const path = require('path')

// Optional local toolchain override. The normal RN/Expo NDK stays the default.
module.exports = function withHandwritingAndroid(config) {
  // EAS 빌드 서버에서는 Skia · expo-modules-core 의 C++ 빌드가 동시에 돌면 메모리가 바닥나 Gradle 데몬이 죽는다.
  // EAS_BUILD 일 때만 동시 작업 수를 2로 줄인다(로컬 빌드 속도는 그대로).
  if (process.env.EAS_BUILD === 'true') {
    config = withGradleProperties(config, mod => {
      mod.modResults = mod.modResults.filter(item => !(item.type === 'property' && item.key === 'org.gradle.workers.max'))
      mod.modResults.push({ type: 'property', key: 'org.gradle.workers.max', value: '2' })
      return mod
    })
  }
  config = withProjectBuildGradle(config, mod => {
    const version = process.env.DIO_ANDROID_NDK_VERSION
    if (version) {
      if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid DIO_ANDROID_NDK_VERSION')
      const marker = 'apply plugin: "com.facebook.react.rootproject"'
      mod.modResults.contents = mod.modResults.contents.replace(marker, `ext.ndkVersion = '${version}' // DIO local toolchain override\n${marker}`)
    }
    return mod
  })
  return withAppBuildGradle(config, mod => {
    // 개발(debug) 빌드는 com.f106.DIO.dev 로 따로 설치해 Play 앱을 덮어쓰지 않는다. 예전 .handwritingdev 블록은 지운다.
    const legacyDevBlock = /\n?\/\/ DIO isolated handwriting development build\r?\nandroid \{ buildTypes \{ debug \{[^\r\n]*\} \} \}\r?\n?/g
    mod.modResults.contents = mod.modResults.contents.replace(legacyDevBlock, '\n')
    const marker = '// DIO isolated development build'
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += `\n${marker}\nandroid { buildTypes { debug { applicationIdSuffix '.dev'; resValue 'string', 'app_name', 'DIO Dev' } } }\n`
    const licenseMarker = '// DIO offline license/source build gate'
    if (!mod.modResults.contents.includes(licenseMarker)) mod.modResults.contents += `\n${licenseMarker}\ndef dioLicenseCheck = tasks.register('verifyDioLicenseAssets', Exec) {\n    workingDir rootDir.parentFile\n    commandLine 'node', new File(rootDir.parentFile, 'scripts/verify-prepared-licenses.cjs').absolutePath, 'android'\n}\ntasks.named('preBuild').configure { dependsOn dioLicenseCheck }\n`
    const bundleMarker = '// DIO license JSON must invalidate the Hermes bundle'
    if (!mod.modResults.contents.includes(bundleMarker)) mod.modResults.contents += `\n${bundleMarker}\ntasks.configureEach { task ->\n    if (task.name.startsWith('createBundle') && task.name.endsWith('JsAndAssets')) {\n        task.inputs.files(new File(rootDir.parentFile, 'src/licenses/generated/android.json'), new File(rootDir.parentFile, 'src/diary/data/contentLicenses.json'))\n    }\n}\n`
    const projectRoot = mod.modRequest.projectRoot || config._projectRoot || process.cwd()
    const projectHash = crypto.createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 12)
    const legacyPathBlock = /\n?\/\/ DIO bounded CMake object paths on Windows(?: v\d+)?\r?\nif \(System\.getProperty\('os\.name'\)\.toLowerCase\(\)\.contains\('windows'\)\) \{\r?\n\s*android\.defaultConfig\.externalNativeBuild\.cmake\.arguments '-DCMAKE_OBJECT_PATH_MAX=(?:128|240)'\r?\n\s*android\.externalNativeBuild\.cmake\.buildStagingDirectory new File\(System\.getProperty\('user\.home'\), '\.dio-cxx(?:\/[a-f0-9]+)?'\)\r?\n\}\r?\n?/g
    const pathMarker = '// DIO bounded CMake object paths on Windows v2'
    mod.modResults.contents = mod.modResults.contents.replace(legacyPathBlock, '\n')
    if (!mod.modResults.contents.includes(pathMarker)) mod.modResults.contents += `\n${pathMarker}\nif (System.getProperty('os.name').toLowerCase().contains('windows')) {\n    android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_OBJECT_PATH_MAX=128'\n    android.externalNativeBuild.cmake.buildStagingDirectory new File(System.getProperty('user.home'), '.dio-cxx/${projectHash}')\n}\n`
    return mod
  })
}
