import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const ast = babel.parseSync(readFileSync(new URL('../src/diary/screens/DecorationStudioScreen.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
const handlers = {}
expo('@babel/traverse').default(ast, { VariableDeclarator(path) {
  if (['addStickerImages', 'addTapeFromPhoto'].includes(path.node.id.name)) handlers[path.node.id.name] = path.node
} })

for (const name of ['addStickerImages', 'addTapeFromPhoto']) {
  test(`공방 ${name}는 로딩 준비 안내를 사진 선택 실패로 바꾸지 않는다`, async () => {
    const message = '보관함을 읽은 뒤 다시 시도해 주세요.'
    const error = Object.assign(new Error(message), { code: 'CUSTOM_LIBRARY_NOT_READY' })
    const notices = [], shelf = [], env = {
      alive: { current: true }, setShelfError: value => shelf.push(value),
      notify: (...args) => notices.push(args),
      custom: { checkTapeCapacity: () => { throw error }, addToFolder: async () => { throw error } },
      pickImages: async () => [{ mediaFileId: 'new', width: 1, height: 1 }],
      discardGeneratedMedia: async () => {},
    }
    const { code } = babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'script', directives: [], body: [{ type: 'VariableDeclaration', kind: 'const', declarations: [handlers[name]] }] } }, undefined, { configFile: false, babelrc: false })
    const handler = new Function(...Object.keys(env), code + `\nreturn ${name}`)(...Object.values(env))
    await handler('folder')
    if (name === 'addStickerImages') assert.deepEqual(notices, [['보관함을 불러오는 중이에요', message]])
    else assert.deepEqual(shelf.at(-1), { kind: 'tape', message })
    assert.ok(!shelf.includes('tape') && !shelf.includes('sticker'))
  })
}
