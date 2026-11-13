import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { DIARY_PAGE_LIMIT, DIARY_PAGE_LIMIT_MESSAGE, PERSONAL_DIARY_LIMIT, PERSONAL_DIARY_LIMIT_MESSAGE } from '../src/shared/freeTierLimits.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const ast = babel.parseSync(readFileSync(new URL('../App.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
const handlers = {}
let guestLimit
expo('@babel/traverse').default(ast, { VariableDeclarator(path) {
  if (['create', 'save'].includes(path.node.id.name) && path.getFunctionParent()?.node.id?.name === 'DiaryAppContent') handlers[path.node.id.name] = path.node
  if (path.node.id.name === 'guestDiaryLimitReached') guestLimit = path.node
} })

function fixture(overrides = {}) {
  const notices = [], openings = [], writes = []
  const unexpectedEdit = () => assert.fail('생성 테스트에서 기존 문서를 수정하면 안 된다')
  const env = {
    useCallback: fn => fn, member: false, guestDiaryLimitReached: false,
    savingRef: { current: false }, pendingCreateId: { current: null },
    notify: (...args) => notices.push(args), setCreateOpen: value => openings.push(value), setEditingDiaryId() {},
    diaryState: { store: { checkPersonalDiaryCapacity: async () => {}, create: async () => ({ id: 'new' }) } },
    editingDiaryId: null, diaries: [], setSaving: value => writes.push(['saving', value]),
    normalizeTemplateConfig: () => ({ orientation: 'portrait' }), normalizePaperAppearance: () => ({}),
    createId: () => 'new', createDefaultDoc: () => ({ pages: [] }), withPdfPages: doc => doc,
    saveJSON: async () => { writes.push('persist'); return true }, STORAGE_KEYS: { doc: 'doc' },
    addDiary: async () => true, enterEditor: async () => {}, rememberEditorDoc() {},
    setActive() {}, setDiaries() {}, setCarousel() {},
    opening: { current: null }, setEditorOrientation() {}, setTabIds() {}, setPage() {},
    editorDocKey: unexpectedEdit, loadEditorDoc: unexpectedEdit, saveEditorDoc: unexpectedEdit,
    DIARY_PAGE_LIMIT, DIARY_PAGE_LIMIT_MESSAGE, PERSONAL_DIARY_LIMIT_MESSAGE, ...overrides,
  }
  if (Object.hasOwn(overrides, 'diaries') && !Object.hasOwn(overrides, 'guestDiaryLimitReached')) {
    const { code } = babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'script', directives: [], body: [{ type: 'VariableDeclaration', kind: 'const', declarations: [guestLimit] }] } }, undefined, { configFile: false, babelrc: false })
    env.guestDiaryLimitReached = new Function('member', 'diaries', 'PERSONAL_DIARY_LIMIT', code + '\nreturn guestDiaryLimitReached')(env.member, env.diaries, PERSONAL_DIARY_LIMIT)
  }
  const compiled = Object.entries(handlers).map(([name, node]) => {
    const handlerAst = { type: 'File', program: { type: 'Program', sourceType: 'script', directives: [], body: [{ type: 'VariableDeclaration', kind: 'const', declarations: [node] }] } }
    const missing = new Set()
    expo('@babel/traverse').default(handlerAst, { ReferencedIdentifier(path) {
      const id = path.node.name
      if (!path.scope.hasBinding(id) && !Object.hasOwn(env, id) && !Object.hasOwn(globalThis, id)) missing.add(id)
    } })
    assert.equal(missing.size, 0, `App.js ${name} 테스트에 필요한 의존성: ${[...missing].join(', ')}`)
    const { code } = babel.transformFromAstSync(handlerAst, undefined, { configFile: false, babelrc: false })
    return [name, new Function(...Object.keys(env), code + `\nreturn ${name}`)(...Object.values(env))]
  })
  assert.equal(compiled.length, 2)
  return { ...Object.fromEntries(compiled), env, notices, openings, writes }
}

test('게스트 5권이면 생성 진입과 저장을 막는다', async () => {
  const ui = fixture({ guestDiaryLimitReached: true })
  await ui.create()
  assert.equal(ui.openings.length, 0)
  assert.equal(ui.notices[0][1], PERSONAL_DIARY_LIMIT_MESSAGE)
  assert.equal(await ui.save({ title: '새 다이어리' }), PERSONAL_DIARY_LIMIT_MESSAGE)
  assert.equal(ui.env.savingRef.current, false)
  assert.equal(ui.writes.length, 0)
})

test('게스트 4권에서 5권으로 바뀐 뒤 재렌더된 save는 6번째 저장을 막는다', async () => {
  const diaries = Array.from({ length: 4 }, (_, id) => ({ id: String(id), trashedAt: null }))
  const before = fixture({ diaries })
  assert.equal(await before.save({ title: '다섯 번째' }), undefined)
  assert.ok(before.writes.includes('persist'))
  const after = fixture({ diaries: [...diaries, { id: 'fifth', trashedAt: null }] })
  assert.equal(await after.save({ title: '여섯 번째' }), PERSONAL_DIARY_LIMIT_MESSAGE)
  assert.deepEqual(after.writes, [])
})

for (const code of ['PERSONAL_DIARY_LIMIT_REACHED', 'NETWORK_ERROR', 'STALE_ACCOUNT']) {
  test(`회원 생성 확인 ${code} 이후 잠금을 해제하고 재시도할 수 있다`, async () => {
    let fail = true
    const ui = fixture({ member: true, diaryState: { store: { checkPersonalDiaryCapacity: async () => {
      if (fail) throw Object.assign(Error('생성 확인 실패'), { code })
    } } } })
    await ui.create()
    assert.equal(ui.env.savingRef.current, false)
    assert.equal(ui.openings.length, 0)
    assert.equal(ui.notices.length, code === 'STALE_ACCOUNT' ? 0 : 1)
    fail = false
    await ui.create()
    assert.deepEqual(ui.openings, [true])
  })
}

test('게스트 생성 150쪽 초과는 저장 전에 거절하고 저장 잠금을 해제한다', async () => {
  const ui = fixture({ createDefaultDoc: () => ({ pages: Array.from({ length: 151 }) }) })
  assert.equal(await ui.save({ title: '새 다이어리' }), DIARY_PAGE_LIMIT_MESSAGE)
  assert.equal(ui.env.savingRef.current, false)
  assert.ok(!ui.writes.includes('persist'))
  assert.deepEqual(ui.writes, [['saving', true], ['saving', false]])
})

test('회원 저장 실패 후 저장 잠금과 진행 표시를 해제한다', async () => {
  const ui = fixture({ member: true, diaryState: { store: { create: async () => { throw Error('생성 한도 확인 실패') } } } })
  assert.equal(await ui.save({ title: '새 다이어리' }), '생성 한도 확인 실패')
  assert.equal(ui.env.savingRef.current, false)
  assert.deepEqual(ui.writes, [['saving', true], ['saving', false]])
})
