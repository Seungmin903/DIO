import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as text from '../src/editor/utils/text.js'
import { waitForExportFonts } from '../src/editor/utils/exportFonts.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))

test('글꼴 로더는 쓰이는 글꼴만 한 번씩 등록하고 실패한 face를 사용할 수 없는 상태로 알린다', async () => {
  const calls = [], pending = new Map()
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/textFonts.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'expo-font') return { loadAsync: files => { calls.push(files); return new Promise((resolve, reject) => pending.set(Object.keys(files)[0], { resolve, reject })) } }
    if (id === '../utils/text') return text
    if (id === '../../handwriting/library.js') return { refreshPersonalFonts: async () => [] }
    if (id.endsWith('.ttf')) return id
    return require(id)
  }, module, module.exports)
  // 앱이 켜져도 기본 글꼴 하나만 불러온다 (11개를 한꺼번에 읽지 않는다)
  mock.timers.enable({ apis: ['setTimeout'] })
  const job = module.exports.preloadTextFonts()
  assert.equal(module.exports.preloadTextFonts(), job)
  assert.equal(calls.length, 0) // 첫 화면이 그려지기 전에는 아무것도 읽지 않는다
  mock.timers.tick(600)
  await new Promise(resolve => setImmediate(resolve))
  mock.timers.reset()
  assert.deepEqual(calls.flatMap(Object.keys), ['NanumGothic'])
  // 글꼴을 찾는 순간 그 글꼴(굵게면 굵은 서체까지)만 한 번 불러온다
  text.textStyle({ font: 'maruburi', bold: true }, 1, 'ios'); text.textStyle({ font: 'maruburi', bold: true }, 1, 'ios')
  assert.deepEqual(calls.flatMap(Object.keys), ['NanumGothic', 'MaruBuri', 'MaruBuriBold'])
  assert.equal(text.textStyleReady('nanum-gothic', 'bold'), false)
  assert.deepEqual(calls.flatMap(Object.keys).slice(3), ['NanumGothicBold'])
  const files = Object.assign({}, ...calls)
  assert.match(files.NanumGothicBold, /700Bold\/NanumGothic_700Bold.ttf$/)
  assert.match(files.MaruBuri, /MaruBuri-Regular.ttf$/)
  assert.match(files.MaruBuriBold, /MaruBuri-Bold.ttf$/)
  // 목록에 있는 글꼴을 직접 기다려 불러올 수도 있다 (내보내기 전). 이미 요청한 face는 다시 부르지 않는다
  const ensured = module.exports.ensureTextFonts(['nanum-myeongjo', 'gowun-dodum', 'maruburi', 'sans'], { bold: true })
  assert.deepEqual(calls.flatMap(Object.keys).slice(4).sort(), ['GowunDodum', 'NanumMyeongjo', 'NanumMyeongjoBold'])
  assert.equal(calls.length, 7)
  for (const [family, task] of pending) family === 'NanumMyeongjoBold' ? task.reject(Error('font unavailable')) : task.resolve()
  await Promise.all([job, ensured])
  assert.equal(text.textStyleReady('nanum-gothic', 'bold'), true)
  assert.equal(text.textStyleReady('nanum-myeongjo', 'bold'), false)
  assert.match(text.textFontSnapshot('nanum-myeongjo'), /NanumMyeongjoBold:error/)
  assert.equal(text.textStyle({ font: 'nanum-myeongjo', bold: true }, 1, 'ios').fontFamily, 'NanumMyeongjo')
  assert.equal(calls.length, 7) // 실패한 글꼴도 다시 시도하지 않는다
  // 내보내기 전에는 요소가 쓰는 글꼴만 (굵게 쓴 것은 굵은 서체까지) 기다린다
  const before = calls.length
  const forExport = module.exports.ensureTextFontsFor([{ type: 'text', text: '가', font: 'gowun-batang', bold: true }, { type: 'image' }])
  assert.deepEqual(calls.slice(before).flatMap(Object.keys), ['GowunBatang', 'GowunBatangBold'])
  for (const task of pending.values()) task.resolve()
  await forExport
})

test('나눔 굵게는 등록된 Bold face를 직접 선택하고 해제 시 Regular로 돌아간다', () => {
  text.markTextFontLoaded('NanumMyeongjoBold')
  for (const [id, family] of [['nanum-gothic', 'NanumGothic'], ['nanum-myeongjo', 'NanumMyeongjo'], ['gowun-batang', 'GowunBatang'], ['maruburi', 'MaruBuri']]) for (const platform of ['ios', 'android', 'web']) {
    const bold = text.textStyle({ font: id, bold: true, italic: true }, 1.5, platform)
    assert.equal(bold.fontFamily, family + 'Bold')
    assert.equal(bold.fontWeight, '400')
    assert.equal(bold.fontStyle, 'normal')
    assert.equal(text.textStyle({ font: id, bold: false }, 1, platform).fontFamily, family)
  }
})

test('원본 서체가 없는 굵기는 미지원이며 글꼴 전환 시 호환되지 않는 설정만 해제한다(기울임은 모든 글꼴이 지원)', () => {
  for (const id of ['nanum-pen', 'poor-story', 'gowun-dodum']) {
    assert.deepEqual(text.textStyleSupport(id, 'ios'), { bold: false, italic: true })
    const patch = text.textFontChangePatch({ bold: true, italic: true }, id, 'ios')
    assert.deepEqual(patch, { font: id, bold: false, italic: true })
    const style = text.textStyle({ font: id, bold: true, italic: true }, 1, 'ios')
    assert.equal(style.fontWeight, '400'); assert.equal(style.fontStyle, 'normal')
  }
  assert.deepEqual(text.textFontChangePatch({ bold: true, italic: true }, 'nanum-gothic', 'ios'), { font: 'nanum-gothic', bold: true, italic: true })
})

test('예전 기본 고딕 · 기본 명조는 나눔고딕 · 나눔명조로 읽는다', () => {
  assert.equal(text.resolveFontId('sans'), 'nanum-gothic'); assert.equal(text.resolveFontId('serif'), 'nanum-myeongjo')
  assert.equal(text.DEFAULT_TEXT_SETTINGS.font, 'nanum-gothic')
  for (const platform of ['ios', 'android', 'web']) {
    for (const id of ['sans', 'serif']) {
      assert.deepEqual(text.textStyleSupport(id, platform), { bold: true, italic: true })
    }
  }
})

test('다른 글꼴 로드는 해당 글꼴 스냅샷을 바꾸지 않고 구독 해제 후 알림도 멈춘다', () => {
  const before = text.textFontSnapshot('nanum-gothic')
  let notifications = 0
  const unsubscribe = text.subscribeTextFonts(() => notifications++)
  text.markTextFontLoaded('PoorStory')
  assert.equal(text.textFontSnapshot('nanum-gothic'), before)
  assert.equal(notifications, 1)
  unsubscribe(); text.markTextFontLoaded('PoorStory')
  assert.equal(notifications, 1)
})

test('저장된 글꼴 ID/서식·부분 스타일은 유지하고 출력은 동일한 Bold face를 준비한다', async () => {
  const object = text.createText({ id: 'text', x: 20, y: 30, text: '한글 Bold', font: 'nanum-gothic', bold: true, styleRanges: [{ start: 3, end: 7, fontSize: 40 }] })
  const restored = JSON.parse(JSON.stringify(object))
  const snapshot = createExportSnapshot({ id: 'page', objects: [restored] })
  assert.equal(snapshot.objects[0].font, 'nanum-gothic')
  assert.equal(snapshot.objects[0].bold, true)
  assert.deepEqual(snapshot.objects[0].styleRanges, object.styleRanges)
  let request
  await waitForExportFonts(snapshot.objects, { load: async (...args) => { request = args }, ready: Promise.resolve() })
  assert.deepEqual(request, ['normal 400 28px NanumGothicBold', '한글 Bold'])
  assert.equal(text.textStyle(snapshot.objects[0], 1, 'ios').fontFamily, 'NanumGothicBold')
})

test('배율이 0이어도 글자 크기는 1 이상이고 줄간격·자간이 같은 크기를 따른다', () => {
  const style = text.textStyle({ font: 'sans', fontSize: 20, lineSpacing: 1.5, letterSpacing: 0.1 }, 0, 'android')
  assert.equal(style.fontSize, 1)
  assert.equal(style.lineHeight, 1.5)
  assert.equal(style.letterSpacing, 0.1)
})

test('기울임은 글꼴 · 기기와 상관없이 같은 각도(12°)로 글자 상자를 기울이고 서체 기울임은 요청하지 않는다', () => {
  const fonts = ['sans', 'serif', 'nanum-gothic', 'nanum-myeongjo', 'gowun-dodum', 'gowun-batang', 'maruburi', 'nanum-pen', 'poor-story', 'mono', 'personal-00000000-0000-0000-0000-000000000000']
  for (const font of fonts) for (const platform of ['ios', 'android', 'web']) {
    const on = text.textStyle({ font, italic: true }, 1, platform), off = text.textStyle({ font, italic: false }, 1, platform)
    assert.deepEqual(on.transform, [{ skewX: '-12deg' }], `${font} ${platform}`)
    assert.equal(on.fontStyle, 'normal'); assert.equal(off.transform, undefined)
    assert.equal(on.fontFamily, off.fontFamily); assert.equal(on.fontSize, off.fontSize) // 글자 크기 · 줄 높이는 그대로
  }
  assert.equal(text.ITALIC_SKEW_DEG, 12)
})
