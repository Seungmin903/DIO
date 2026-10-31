import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as text from '../src/editor/utils/text.js'
import { waitForExportFonts } from '../src/editor/utils/exportFonts.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))

test('글꼴 로더는 실제 Regular/Bold 파일을 한 번 등록하고 실패한 face를 사용할 수 없는 상태로 알린다', async () => {
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
  const job = module.exports.preloadTextFonts()
  assert.equal(module.exports.preloadTextFonts(), job)
  assert.equal(calls.length, 11)
  const files = Object.assign({}, ...calls)
  assert.match(files.NanumGothicBold, /700Bold\/NanumGothic_700Bold.ttf$/)
  assert.match(files.NanumMyeongjoBold, /700Bold\/NanumMyeongjo_700Bold.ttf$/)
  assert.match(files.GowunDodum, /GowunDodum-Regular.ttf$/)
  assert.match(files.GowunBatangBold, /GowunBatang-Bold.ttf$/)
  assert.match(files.MaruBuri, /MaruBuri-Regular.ttf$/)
  assert.match(files.MaruBuriBold, /MaruBuri-Bold.ttf$/)
  assert.equal(text.textStyleReady('nanum-gothic', 'bold'), false)
  for (const [family, task] of pending) family === 'NanumMyeongjoBold' ? task.reject(Error('font unavailable')) : task.resolve()
  await job
  assert.equal(text.textStyleReady('nanum-gothic', 'bold'), true)
  assert.equal(text.textStyleReady('nanum-myeongjo', 'bold'), false)
  assert.match(text.textFontSnapshot('nanum-myeongjo'), /NanumMyeongjoBold:error/)
  assert.equal(text.textStyle({ font: 'nanum-myeongjo', bold: true }, 1, 'ios').fontFamily, 'NanumMyeongjo')
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

test('원본 서체가 없는 스타일은 미지원이며 글꼴 전환 시 호환되지 않는 설정만 해제한다', () => {
  for (const id of ['nanum-pen', 'poor-story', 'gowun-dodum']) {
    assert.deepEqual(text.textStyleSupport(id, 'ios'), { bold: false, italic: false })
    const patch = text.textFontChangePatch({ bold: true, italic: true }, id, 'ios')
    assert.deepEqual(patch, { font: id, bold: false, italic: false })
    const style = text.textStyle({ font: id, bold: true, italic: true }, 1, 'ios')
    assert.equal(style.fontWeight, '400'); assert.equal(style.fontStyle, 'normal')
  }
  assert.deepEqual(text.textStyleSupport('serif', 'ios'), { bold: false, italic: false })
  assert.deepEqual(text.textFontChangePatch({ bold: true, italic: true }, 'nanum-gothic', 'ios'), { font: 'nanum-gothic', bold: true, italic: false })
  assert.deepEqual(text.textStyleSupport('sans', 'ios'), { bold: true, italic: false })
  assert.deepEqual(text.textFontChangePatch({ bold: true, italic: true }, 'sans', 'ios'), { font: 'sans', bold: true, italic: false })
  for (const platform of ['android', 'web']) {
    assert.deepEqual(text.textStyleSupport('sans', platform), { bold: true, italic: true })
    assert.equal(text.textStyle({ font: 'sans', italic: true }, 1, platform).fontStyle, 'italic')
  }
  const system = text.textStyle({ font: 'sans', bold: true, italic: true }, 1, 'ios')
  assert.equal(system.fontFamily, 'System'); assert.equal(system.fontWeight, '700'); assert.equal(system.fontStyle, 'italic')
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
