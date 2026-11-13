import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mediaFailureMessage } from '../src/editor/utils/mediaRecovery.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const ast = babel.parseSync(readFileSync(new URL('../src/editor/screens/EditorScreen.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
let handler
expo('@babel/traverse').default(ast, { VariableDeclarator(path) {
  if (path.node.id.name === 'showPhotoFailure') handler = path.node
} })
assert.ok(handler)
const { code } = babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'script', directives: [], body: [{ type: 'VariableDeclaration', kind: 'const', declarations: [handler] }] } }, undefined, { configFile: false, babelrc: false })

for (const errorCode of ['GUEST_PHOTO_INDEX_DAMAGED', 'MEMBER_PHOTO_INDEX_DAMAGED', 'PHOTO_LIBRARY_NOT_READY', 'PHOTO_CAPACITY_CHECK_FAILED']) {
  test(`편집 화면은 ${errorCode}의 전용 안내와 기록 ID를 그대로 표시한다`, () => {
    const calls = [], retry = () => {}
    const show = new Function('mediaFailureMessage', 'notify', 'showToast', code + '\nreturn showPhotoFailure')(
      mediaFailureMessage, () => assert.fail('저장 한도 확인창과 섞지 않는다'), (...args) => calls.push(args),
    )
    const message = `사진 기록 확인 안내 · 기록 ID: dio:photo:test:${errorCode}`
    const error = Object.assign(new Error(message), { code: errorCode })
    show(error, retry)
    assert.deepEqual(calls, [[errorCode === 'PHOTO_CAPACITY_CHECK_FAILED' ? '사진 보관함을 확인하지 못했어요. 다시 시도해 주세요.' : message, retry]])
  })
}

test('실제 오류 변환 함수를 거친 사진 200장 한도 문구가 중앙 팝업에 그대로 표시된다', () => {
  const calls = []
  const show = new Function('mediaFailureMessage', 'notify', 'showToast', code + '\nreturn showPhotoFailure')(
    mediaFailureMessage, (...args) => calls.push(args), () => assert.fail('한도 안내는 토스트가 아니다'),
  )
  show(Object.assign(new Error('사진 저장 한도는 200장이에요.'), { code: 'STORAGE_LIMIT_REACHED' }))
  assert.deepEqual(calls, [['사진 저장 한도', '사진 저장 한도는 200장이에요.']])
})
