import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createTapePreferences } from '../src/editor/services/tapePreferences.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/DecorDrawer.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
// 스티커 분류 계산(stickerLibrary)은 실제 모듈을 같은 가짜 의존성으로 불러 쓴다
const library = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/stickerLibrary.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const load = (source, deps) => { const module = { exports: {} }; new Function('require', 'module', 'exports', source)(id => deps[id], module, module.exports); return module.exports }
const sizes = [{ id: 'standard', w: 180, h: 34 }, { id: 'wide', w: 200, h: 68 }]
const make = save => createTapePreferences({ load: async () => ({ size: 'wide', palette: 'sky', pattern: 'dot' }), save: save || (async () => true), sizes: sizes.map(s => s.id), palettes: ['sky', 'pink'], patterns: ['dot', 'solid'], defaultSize: 'standard' })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
function drawer(store, callbacks = {}, ready = true, saveStatus = {}, hooks = {}) {
  const mocks = {
    react: { createContext: () => ({ Provider: 'provider' }), useContext: () => 4, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}], ...hooks },
    'react-native': { View: 'view', Text: 'text', Platform: { OS: 'web', select: values => values.web }, StyleSheet: { create: value => value } },
    '../../../shared/theme': { colors: {}, radius: {}, shadow: {} },
    '../../constants': { TAPE_SIZES: sizes, TAPE_DEFAULT: { size: 'standard', palette: 'pink' }, TAPE_PATTERN_NAMES: { dot: '도트', solid: '무지' }, PHOTO_FRAME_ASSETS: [{ id: 'polaroid', name: '폴라로이드', kind: 'border' }] },
    '../../hooks/useCustomDecor': { RECENT_LIMIT: 8, stickerKey: item => item.id, useCustomDecor: () => ({ loaded: true, lastStickerCategory: saveStatus.items?.lastStickerCategory ?? null, items: { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [] }, ...saveStatus }) },
    '../../hooks/useTapePreferences': { useTapePreferences: () => [store.getSnapshot(), store.update, ready] },
    '../../services/stickerSplit': { stickerSplit: { available: false } },
    '../../../auth/loginGate': { useLoginGate: () => (_feature, action) => action() }, // 로그인한 사용자: 그대로 통과
    '../../stickerAssets': { STICKER_GROUPS: [{ id: 'twemoji', items: [] }] },
    '../../hooks/usePan': { usePan: () => ({}) },
    '../ToolPanel': { toolPanelStyles: {}, ToolPanelHeader: 'header' },
    '../../utils/common': { clamp: value => value },
  }
  mocks['../../stickerLibrary'] = load(library, { './stickerAssets': mocks['../../stickerAssets'], './hooks/useCustomDecor': mocks['../../hooks/useCustomDecor'], './widgets/dday': { WIDGET_ITEMS: [{ widget: 'dday', style: 'label', name: '디데이 라벨' }] } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports)
  return module.exports.default({ tab: 'tape', ...callbacks })
}
const options = tree => nodes(tree).find(node => node.type === './TapeOptions')
test('스티커 칩 복원·선택 저장과 삭제·숨김 칩은 비어 있지 않은 첫 칩으로 대체', () => {
  const picked = [], items = { folders: [{ id: 'mine', name: '내 폴더', items: [] }], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], lastStickerCategory: 'folder:mine' }
  const render = () => drawer(make(), { tab: 'sticker' }, true, { items, setStickerCategory: id => picked.push(id) })
  const pills = () => nodes(render()).filter(node => node.type?.name === 'Pill')
  assert.equal(pills().find(node => node.props.active).props.label, '내 폴더')
  pills().find(node => node.props.label === 'Twemoji').props.onPress()
  assert.deepEqual(picked, ['twemoji'])
  // 즐겨찾기 · 최근이 비어 있으면 첫 분류로
  items.lastStickerCategory = 'folder:deleted'
  assert.equal(pills().find(node => node.props.active).props.label, 'Fluent Emoji')
  items.lastStickerCategory = 'twemoji'; items.hiddenCategories = ['twemoji']
  assert.equal(pills().find(node => node.props.active).props.label, 'Fluent Emoji')
  items.favorites = [{ id: 'a' }]
  assert.equal(pills().find(node => node.props.active).props.label, '즐겨찾기')
})

test('보관함은 훅의 저장 실패·진행 상태와 최신 내용 재시도를 안내에 전달한다', () => {
  const retrySave = () => Promise.resolve(true)
  const tree = drawer(make(), {}, true, { saveError: '저장 실패', savePending: true, retrySave })
  const notice = nodes(tree).find(node => node.type === './DecorSaveNotice')
  assert.equal(notice.props.error, '저장 실패')
  assert.equal(notice.props.pending, true)
  assert.equal(notice.props.onRetry, retrySave)
})

test('복원·재마운트는 삽입하지 않고 무늬 선택 시 복원한 색·규격으로 한 장씩 추가한다', async () => {
  const store = make(), added = [], calls = { onAdd: item => added.push(item) }
  await store.ensureLoaded()
  assert.equal(options(drawer(store, calls)).props.tape.palette, 'sky')
  assert.equal(added.length, 0)
  options(drawer(store, calls)).props.onUpdate({ palette: 'custom:#AABBCC:#112233' })
  assert.equal(added.length, 0)
  options(drawer(store, calls)).props.onUpdate({ pattern: 'dot' })
  options(drawer(store, calls)).props.onUpdate({ pattern: 'dot' })
  assert.equal(added.length, 2)
  assert.deepEqual(added[0], { kind: 'tape', size: 'wide', palette: 'custom:#AABBCC:#112233', pattern: 'dot', edge: 'straight', name: '도트' })
})

test('복원 전 도구 입력을 막고 기본색으로 삽입한 경우 실제 색을 기억한다', async () => {
  const store = make()
  assert.equal(options(drawer(store, {}, false)), undefined)
  await store.ensureLoaded()
  await store.update({ palette: null })
  options(drawer(store, { onAdd() {} })).props.onUpdate({ pattern: 'solid' })
  assert.equal(store.getSnapshot().palette, 'pink')
})

test('설정 저장 실패를 안내해도 새 테이프 삽입·메모리 설정은 유지한다', async () => {
  const store = make(async () => false), notices = [], added = []
  await store.ensureLoaded()
  options(drawer(store, { onAdd: item => added.push(item), onToast: text => notices.push(text) })).props.onUpdate({ pattern: 'solid' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(added.length, 1)
  assert.equal(store.getSnapshot().pattern, 'solid')
  assert.match(notices[0], /설정을 저장하지 못했어요/)
})

test('드로어에서 기존 폴더·내장 분류와 같은 이름으로 생성·이름 변경해도 ID로 구분한다', () => {
  const states=[], calls=[]; let cursor=0;
  const items={folders:[{id:'old',name:'Twemoji',items:[]},{id:'other',name:'여행',items:[]}],favorites:[],recentStickers:[],categoryOrder:[],hiddenCategories:[],tapes:[]};
  const custom={items,lastStickerCategory:null,
    setStickerCategory(id){custom.lastStickerCategory=id},
    addFolder(name){calls.push(['add',name]);items.folders.push({id:'new',name,items:[]});return 'new'},
    renameFolder(id,name){calls.push(['rename',id,name]);items.folders.find(f=>f.id===id).name=name},
  };
  const hooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]}};
  const render=()=>{cursor=0;return drawer(make(),{tab:'sticker'},true,custom,hooks)};
  const find=(tree,label)=>nodes(tree).find(n=>n.props.accessibilityLabel===label || n.props.label===label);
  find(render(),'새 폴더').props.onPress();
  find(render(),'폴더 이름').props.onChangeText(' Twemoji ');
  assert.equal(find(render(),'폴더 이름 확인').props.disabled,false);
  find(render(),'폴더 이름 확인').props.onPress();
  assert.deepEqual(calls,[['add','Twemoji']]);
  const pills=nodes(render()).filter(n=>n.type?.name==='Pill' && n.props.label==='Twemoji');
  assert.equal(pills.length,3);
  assert.equal(new Set(pills.map(n=>n.key)).size,3);
  const folder=nodes(render()).find(n=>n.props.folder?.id==='new' && n.props.onRename);
  assert.ok(folder);
  folder.props.onRename();
  let renamed=nodes(render()).find(n=>n.props.folder?.id==='new' && n.props.onRename);
  renamed.props.onRenameChange('  ');
  assert.equal(nodes(render()).find(n=>n.props.folder?.id==='new' && n.props.onRename).props.canCommitRename,false);
  renamed.props.onRenameChange('여행');
  renamed=nodes(render()).find(n=>n.props.folder?.id==='new' && n.props.onRename);
  assert.equal(renamed.props.canCommitRename,true);
  renamed.props.onRenameCommit();
  assert.deepEqual(calls.at(-1),['rename','new','여행']);
  assert.equal(items.folders.find(f=>f.id==='old').name,'Twemoji');
});
