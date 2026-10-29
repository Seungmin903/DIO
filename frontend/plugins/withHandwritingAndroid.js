const { withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins')

// Optional local toolchain override. The normal RN/Expo NDK stays the default.
module.exports = function withHandwritingAndroid(config) {
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
    const marker = '// DIO isolated handwriting development build'
    if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += `\n${marker}\nandroid { buildTypes { debug { applicationIdSuffix '.handwritingdev'; resValue 'string', 'app_name', 'DIO Font Dev' } } }\n`
    const licenseMarker = '// DIO offline license/source build gate'
    if (!mod.modResults.contents.includes(licenseMarker)) mod.modResults.contents += `\n${licenseMarker}\ndef dioLicenseCheck = tasks.register('verifyDioLicenseAssets', Exec) {\n    workingDir rootDir.parentFile\n    commandLine 'node', new File(rootDir.parentFile, 'scripts/verify-prepared-licenses.cjs').absolutePath, 'android'\n}\ntasks.named('preBuild').configure { dependsOn dioLicenseCheck }\n`
    const bundleMarker = '// DIO license JSON must invalidate the Hermes bundle'
    if (!mod.modResults.contents.includes(bundleMarker)) mod.modResults.contents += `\n${bundleMarker}\ntasks.configureEach { task ->\n    if (task.name.startsWith('createBundle') && task.name.endsWith('JsAndAssets')) {\n        task.inputs.files(new File(rootDir.parentFile, 'src/licenses/generated/android.json'), new File(rootDir.parentFile, 'src/diary/data/contentLicenses.json'))\n    }\n}\n`
    const pathMarker = '// DIO bounded CMake object paths on Windows'
    if (!mod.modResults.contents.includes(pathMarker)) mod.modResults.contents += `\n${pathMarker}\nif (System.getProperty('os.name').toLowerCase().contains('windows')) {\n    android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_OBJECT_PATH_MAX=128'\n    android.externalNativeBuild.cmake.buildStagingDirectory new File(System.getProperty('user.home'), '.dio-cxx')\n}\n`
    return mod
  })
}
