import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { datedMonthId, datedBaseId } from '../src/editor/templates/dated.js'
import { getTemplate } from '../src/editor/templates/catalog.js'
import { serverTemplateReference, serverTemplateConfigFor, localTemplateReference, toServerInitialPageSelections, DATED_CONFIG_KEY } from '../src/editor/templates/serverCatalog.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const id = datedMonthId('monthly', 2027, 3, 'portrait')
const base = datedBaseId(id)

test('날짜 속지는 같은 양식의 만년형 서버 행으로 만들고, 날짜 ID 는 설정의 datedTemplate 에 둔다(게스트와 같은 ID)', () => {
  const template = getTemplate(id)
  assert.deepEqual(serverTemplateReference(id, template.templateVersion, 'portrait'), serverTemplateReference(base, template.templateVersion, 'portrait'))
  assert.deepEqual(serverTemplateConfigFor(id), { [DATED_CONFIG_KEY]: id })
  assert.deepEqual(serverTemplateConfigFor(base), {})
})

test('읽을 때: 설정의 datedTemplate 이 그 만년형 속지의 날짜판이면 날짜 ID 로 그린다(아니면 만년형 그대로)', () => {
  const { templateCode, templateVersion } = serverTemplateReference(id, '1.0.0', 'portrait')
  assert.equal(localTemplateReference(templateCode, templateVersion, { datedTemplate: id }).backgroundAssetId, id)
  assert.equal(localTemplateReference(templateCode, templateVersion, {}).backgroundAssetId, base)
  // 다른 양식의 날짜 ID 는 받지 않는다
  const weekly = 'dated-weekly-blocks-2027-03-01-portrait'
  assert.equal(localTemplateReference(templateCode, templateVersion, { datedTemplate: weekly }).backgroundAssetId, base)
})

test('생성 요청에는 datedTemplate 을 빼고 보내며(서버가 설정 키를 제한), 어느 페이지에 넣을지 함께 돌려준다', () => {
  const { templateCode, templateVersion } = serverTemplateReference(id, '1.0.0', 'portrait')
  const config = { width: 768, height: 1024, paperAppearance: { backgroundColor: '#FFFFFF', layoutColor: '#292929' }, datedTemplate: id }
  const [selection] = toServerInitialPageSelections([{ templateId: id, templateCode, templateVersion, templateConfig: config }])
  assert.equal(selection.datedTemplate, id)
  assert.equal(DATED_CONFIG_KEY in JSON.parse(selection.configurationJson), false)
  // 앱 ID 와 설정의 날짜가 다르면 거부
  assert.throws(() => toServerInitialPageSelections([{ templateId: id, templateCode, templateVersion, templateConfig: { ...config, datedTemplate: 'dated-monthly-2027-04-portrait' } }]))
})

test('회원 새 다이어리: 만든 뒤 날짜 페이지 설정에 datedTemplate 을 넣고, 편집기 페이지 추가도 날짜 속지를 만든다', () => {
  const store = read('../src/diary/services/memberAppStore.js')
  assert.match(store, /if \(dated\.length\) \{ await api\.setDatedPages\(dated\); active\(\) \}/)
  const api = read('../src/diary/services/memberDiaryApi.js')
  assert.match(api, /async setDatedPages\(pages, options = \{\}\)/)
  assert.match(api, /body\.page\.templateConfig\?\.datedTemplate !== templateConfig\.datedTemplate/)
  assert.match(read('../src/collaboration/serverPages.js'), /if\(isDatedId\(backgroundAssetId\)\)base=datedBaseId\(backgroundAssetId\)/)
  // 회원도 날짜 있음 · 날짜 없이를 고른다(속지 글꼴만 서버에 칸이 없어 고르지 않는다)
  const modal = read('../src/diary/components/DiaryCreateModal.js')
  assert.doesNotMatch(modal, /dated: false/)
  assert.doesNotMatch(read('../src/diary/components/PaperOptions.js'), /undatedOnly/)
})

test('기간 시작(해 · 달) 두 칸은 날짜 있음 · 날짜 없이와 같은 반반 폭 · 사이 6', () => {
  const options = read('../src/diary/components/PaperOptions.js')
  assert.match(options, /period: \{ flexDirection: 'row', gap: 6 \}/)
  assert.match(options, /stepper: \{ flex: 1, minWidth: 0,[^}]*borderColor: colors\.cardBorder \}/)
})
