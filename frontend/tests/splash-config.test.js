import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const plugins = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin)

// expo-splash-screen 은 Theme.App.SplashScreen 을 통째로 다시 쓴다. 나중에 등록한 플러그인의 스타일 수정이 먼저 실행되므로
// withSplashWindowBackground 가 앞에 있어야 빈 아이콘이 남는다(plugins/withSplashWindowBackground.js)
test('시작 화면 플러그인은 expo-splash-screen 보다 앞에 등록한다', () => {
  assert.ok(plugins.indexOf('./plugins/withSplashWindowBackground') >= 0)
  assert.ok(plugins.indexOf('./plugins/withSplashWindowBackground') < plugins.indexOf('expo-splash-screen'))
})

test('안드로이드 시작 화면은 로고 없이 바탕색만 두고 로고는 JS 시작 화면에서만 보인다', () => {
  // prebuild 와 같은 설정 계산(파일은 쓰지 않는다)으로 실제 styles.xml 값을 본다
  const cli = require.resolve('expo/bin/cli')
  const run = spawnSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  assert.equal(run.status, 0, run.stderr)
  const styles = JSON.parse(run.stdout)._internal.modResults.android.styles.resources.style
  const value = (theme, name) => styles.find(style => style.$.name === theme)?.item.find(item => item.$.name === name)?._
  assert.equal(value('Theme.App.SplashScreen', 'windowSplashScreenAnimatedIcon'), '@drawable/splash_icon_blank')
  assert.equal(value('AppTheme', 'android:windowBackground'), '@color/splashscreen_background')
})
