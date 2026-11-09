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
// 테이프 분류(기본 폴더 무늬 · 레이스 + 내 폴더)도 실제 모듈을 같은 가짜 의존성으로 쓴다
const tapeLibrarySource = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/tapeLibrary.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const load = (source, deps) => { const module = { exports: {} }; new Function('require', 'module', 'exports', source)(id => deps[id], module, module.exports); return module.exports }
const sizes = [{ id: 'slim', w: 200, h: 11 }, { id: 'standard', w: 180, h: 34 }, { id: 'wide', w: 200, h: 68 }]
const make = save => createTapePreferences({ load: async () => ({ size: 'wide', palette: 'sky', pattern: 'dot' }), save: save || (async () => true), sizes: sizes.map(s => s.id), palettes: ['sky', 'pink'], patterns: ['dot', 'solid'], defaultSize: 'standard' })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
function drawer(store, callbacks = {}, ready = true, saveStatus = {}, hooks = {}, flags = {}) {
  const mocks = {
    react: { createContext: () => ({ Provider: 'provider' }), useContext: () => 4, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}], ...hooks },
    'react-native': { View: 'view', Text: 'text', Platform: { OS: 'web', select: values => values.web }, StyleSheet: { create: value => value } },
    '../../../shared/theme': { colors: {}, radius: {}, shadow: {} },
    '../../constants': { TAPE_SIZES: sizes, TAPE_DEFAULT: { size: 'standard', palette: 'pink' }, TAPE_PALETTES: [{ id: 'sky', name: '하늘' }, { id: 'pink', name: '딸기' }], TAPE_PATTERN_NAMES: { dot: '도트', solid: '무지', 'lace-flower': '아이렛' }, PHOTO_FRAME_ASSETS: [{ id: 'polaroid', name: '폴라로이드', kind: 'border', group: 'basic' }, { id: 'ticket-movie', name: '영화 티켓', kind: 'border', group: 'ticket' }], PHOTO_FRAME_GROUPS: [{ id: 'basic', name: '기본' }, { id: 'ticket', name: '티켓' }] },
    '../../hooks/useCustomDecor': { RECENT_LIMIT: 12, stickerKey: item => item.id, widgetKey: item => item.frame ?? item.memo ?? item.style, tapeKey: item => item.src ?? `pattern:${item.pattern}`,
      useCustomDecor: () => ({ loaded: true, lastStickerCategory: saveStatus.items?.lastStickerCategory ?? null, items: { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], tapeFolders: [] },
        markRecentTape() {}, setTapeCategory() {}, toggleTapeFavorite() {}, markRecentWidget() {}, toggleWidgetFavorite() {}, ...saveStatus }) },
    '../../hooks/usePalettes': { tapeColors: id => (id.startsWith('custom:') ? { bg: id.split(':')[1], fg: id.split(':')[2] } : { bg: '#EEE', fg: '#999' }), usePalette: () => ({ colors: ['sky', 'pink'] }) },
    '../../hooks/useTapePreferences': { useTapePreferences: () => [store.getSnapshot(), store.update, ready] },
    '../../hooks/useStickerPacks': { useStickerPacks: () => 0 },
    '../../services/stickerSplit': { stickerSplit: { available: false } },
    '../../../auth/loginGate': { useLoginGate: () => (_feature, action) => action() }, // 로그인한 사용자: 그대로 통과
    '../../../shared/featureFlags': { CUTOUT_ENTRANCE: false, ...flags },
    '../../widgets/dday': { WIDGET_ITEMS: [{ widget: 'dday', style: 'label', name: '디데이 라벨' }] },
    '../../widgets/memo': { MEMO_ITEMS: [{ kind: 'memo', memo: 'plain', name: '무지 메모' }, { kind: 'memo', memo: 'lined', name: '줄 메모' }] },
    '../../hooks/usePan': { usePan: () => ({}) },
    '../ToolPanel': { toolPanelStyles: {}, ToolPanelHeader: 'header' },
    '../../utils/common': { clamp: value => value },
    './PhotoFramePicker': { FramePreview: 'FramePreview', frameLabel: frame => `사진 틀 ${frame.name}` },
  }
  mocks['../../stickerLibrary'] = load(library, { './hooks/useCustomDecor': mocks['../../hooks/useCustomDecor'], './builtinStickers': { stickerPacks: () => [{ id: 'builtin:dio-moa', name: '디오&모아', items: [] }] } })
  mocks['../../tapeLibrary'] = load(tapeLibrarySource, { './hooks/useCustomDecor': mocks['../../hooks/useCustomDecor'], './constants': mocks['../../constants'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports)
  return module.exports.default({ tab: 'tape', ...callbacks })
}
// 테이프 칸(이름은 화면 읽기 이름) · 공용 고정 팔레트
const tapeTile = (tree, name) => nodes(tree).find(node => node.type?.name === 'Tile' && node.props.label === name)
const editablePalette = tree => nodes(tree).find(node => node.type === '../controls/EditablePalette')
test('스티커 칩 복원·선택 저장과 삭제·숨김 칩은 비어 있지 않은 첫 칩으로 대체', () => {
  const picked = [], items = { folders: [{ id: 'mine', name: '내 폴더', items: [] }, { id: 'trip', name: '여행', items: [] }], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], lastStickerCategory: 'folder:mine' }
  const render = () => drawer(make(), { tab: 'sticker' }, true, { items, setStickerCategory: id => picked.push(id) })
  const pills = () => nodes(render()).filter(node => node.type?.name === 'Pill')
  assert.equal(pills().find(node => node.props.active).props.label, '내 폴더')
  // 기본 분류는 디오&모아 하나: 즐겨찾기 · 최근 · 디오&모아 · 내 폴더 · 새 폴더
  assert.deepEqual(pills().map(node => node.props.label), ['즐겨찾기', '최근', '디오&모아', '내 폴더', '여행', '새 폴더'])
  pills().find(node => node.props.label === '여행').props.onPress()
  assert.deepEqual(picked, ['folder:trip'])
  // 즐겨찾기 · 최근이 비어 있으면 첫 분류(디오&모아)로
  items.lastStickerCategory = 'folder:deleted'
  assert.equal(pills().find(node => node.props.active).props.label, '디오&모아')
  items.favorites = [{ id: 'a' }]
  assert.equal(pills().find(node => node.props.active).props.label, '즐겨찾기')
})

test('위젯 칸은 메모지 · 디데이 · 사진 틀 칩으로 나누고 칸을 누르면 그 위젯을 붙인다', () => {
  const added = []
  const tree = drawer(make(), { tab: 'widget', onAdd: item => added.push(item) })
  assert.deepEqual(nodes(tree).filter(node => node.type?.name === 'Pill').map(node => node.props.label), ['즐겨찾기', '최근', '메모지', '디데이', '사진 틀'])
  const tiles = nodes(tree).filter(node => node.type?.name === 'Tile')
  assert.deepEqual(tiles.map(node => node.props.label), ['무지 메모', '줄 메모'])
  tiles[1].props.onPress()
  assert.deepEqual(added, [{ kind: 'memo', memo: 'lined', name: '줄 메모' }])
})

test('사진 틀 칩은 기본 · 티켓 묶음으로 빈 틀을 붙이고, 보관함에는 사진 칸이 없다', () => {
  const added = [], states = []
  let cursor = 0
  const hooks = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] } }
  const render = () => { cursor = 0; return drawer(make(), { tab: 'widget', onAdd: item => added.push(item) }, true, {}, hooks) }
  nodes(render()).find(node => node.type?.name === 'Pill' && node.props.label === '사진 틀').props.onPress()
  const tree = render()
  assert.deepEqual(nodes(tree).filter(node => node.type?.name === 'Section').map(node => node.props.title), ['기본', '티켓'])
  // 메모 · 디데이와 같은 칸(Tile)으로 묶음마다 그 묶음의 틀만 보인다
  const tiles = nodes(tree).filter(node => node.type?.name === 'Tile')
  assert.equal(tiles.length, 2)
  tiles[0].props.onPress()
  assert.deepEqual(added, [{ kind: 'frame', frame: 'polaroid' }])
  assert.equal(nodes(drawer(make(), { tab: 'photo' })).some(node => node.props?.frame), false)
})

test('보관함은 훅의 저장 실패·진행 상태와 최신 내용 재시도를 안내에 전달한다', () => {
  const retrySave = () => Promise.resolve(true)
  const tree = drawer(make(), {}, true, { saveError: '저장 실패', savePending: true, retrySave })
  const notice = nodes(tree).find(node => node.type === './DecorSaveNotice')
  assert.equal(notice.props.error, '저장 실패')
  assert.equal(notice.props.pending, true)
  assert.equal(notice.props.onRetry, retrySave)
})

test('복원·재마운트는 삽입하지 않고 무늬 칸을 누를 때마다 고른 색으로 한 장씩 추가한다', async () => {
  const store = make(), added = [], calls = { onAdd: item => added.push(item) }
  await store.ensureLoaded()
  drawer(store, calls)
  assert.equal(added.length, 0)
  // 처음 칩은 기본 폴더 '무늬'이고 레이스는 따로 있다
  assert.deepEqual(nodes(drawer(store, calls)).filter(node => node.type?.name === 'Pill').map(node => node.props.label), ['즐겨찾기', '최근', '무늬', '레이스', '새 폴더'])
  editablePalette(drawer(store, calls)).props.onPick('custom:#AABBCC:#112233')
  assert.equal(added.length, 0)
  tapeTile(drawer(store, calls), '도트').props.onPress()
  tapeTile(drawer(store, calls), '도트').props.onPress()
  assert.equal(added.length, 2)
  assert.deepEqual(added[0], { kind: 'tape', palette: 'custom:#AABBCC:#112233', pattern: 'dot', edge: 'straight', name: '도트' })
})

test('복원 전에는 색 줄을 숨기고 무늬를 붙이지 않으며, 기본색으로 삽입한 경우 실제 색을 기억한다', async () => {
  const store = make(), added = []
  const before = drawer(store, { onAdd: item => added.push(item) }, false)
  assert.equal(editablePalette(before), undefined)
  tapeTile(before, '무지').props.onPress()
  assert.equal(added.length, 0)
  await store.ensureLoaded()
  await store.update({ palette: null })
  tapeTile(drawer(store, { onAdd() {} }), '무지').props.onPress()
  assert.equal(store.getSnapshot().palette, 'pink')
})

test('설정 저장 실패를 안내해도 새 테이프 삽입·메모리 설정은 유지한다', async () => {
  const store = make(async () => false), notices = [], added = []
  await store.ensureLoaded()
  tapeTile(drawer(store, { onAdd: item => added.push(item), onToast: text => notices.push(text) }), '무지').props.onPress()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(added.length, 1)
  assert.equal(store.getSnapshot().pattern, 'solid')
  assert.match(notices[0], /설정을 저장하지 못했어요/)
})

test('레이스 칩은 레이스 무늬만, 내 폴더는 사진 테이프만 보이고 색 줄은 내 폴더에서 숨긴다', async () => {
  const store = make()
  await store.ensureLoaded()
  const lace = drawer(store, {}, true, { items: { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], tapeFolders: [], lastTapeCategory: 'base:lace' } })
  assert.deepEqual(nodes(lace).filter(node => node.type?.name === 'Tile').map(node => node.props.label), ['아이렛'])
  assert.ok(editablePalette(lace))
  const mine = drawer(store, {}, true, { items: { folders: [], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [],
    tapeFolders: [{ id: 'trip', name: '여행', items: [{ id: 't1', src: 'blob:t1', name: '기차표' }] }], lastTapeCategory: 'folder:trip' } })
  // 내 폴더는 스티커 폴더와 같은 FolderView(편집 · 추가 · 폴더 삭제)로 그린다
  const view = nodes(mine).find(node => node.type?.name === 'FolderView')
  assert.deepEqual(view.props.folder.items.map(item => item.name), ['기차표'])
  assert.equal(view.props.noun, '테이프')
  assert.equal(editablePalette(mine), undefined)
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
  assert.equal(pills.length,2);
  assert.equal(new Set(pills.map(n=>n.key)).size,2);
  // 이름은 폴더 '편집' 중 제목 자리에서 고친다. 빈 이름으로 끝내면 바꾸지 않는다
  const folderView=()=>nodes(render()).find(n=>n.props.folder?.id==='new' && n.props.onEdit);
  assert.ok(folderView());
  folderView().props.onEdit();
  assert.equal(folderView().props.editing,true);
  folderView().props.onRenameChange('  ');
  folderView().props.onRenameCommit();
  assert.deepEqual(calls,[['add','Twemoji']]);
  folderView().props.onRenameChange('여행');
  folderView().props.onRenameCommit();
  assert.deepEqual(calls.at(-1),['rename','new','여행']);
  assert.equal(items.folders.find(f=>f.id==='old').name,'Twemoji');
});

test('테이프 즐겨찾기는 무늬와 그때 고른 색을 함께 담고, 칸 아래에 이름을 보인다', async () => {
  const store = make(), faved = []
  await store.ensureLoaded()
  const tree = drawer(store, { onToast() {} }, true, { toggleTapeFavorite: item => faved.push(item) })
  const dot = tapeTile(tree, '도트')
  assert.equal(dot.props.caption, '도트')
  dot.props.onLongPress()
  assert.deepEqual(faved, [{ pattern: 'dot', name: '도트', palette: 'sky' }])
})

test('위젯 · 스티커 · 테이프 칸마다 왼쪽 위 별로 즐겨찾기를 넣고 빼고, 위젯은 누르면 최근에 남는다', async () => {
  const store = make(), faved = [], recent = [], added = []
  await store.ensureLoaded()
  const tree = drawer(store, { tab: 'widget', onAdd: item => added.push(item), onToast() {} }, true, { toggleWidgetFavorite: item => faved.push(item), markRecentWidget: item => recent.push(item) })
  const memo = nodes(tree).find(node => node.type?.name === 'Tile' && node.props.label === '줄 메모')
  memo.props.onFavorite()
  memo.props.onPress()
  assert.deepEqual(faved.map(item => item.memo), ['lined'])
  assert.deepEqual(recent.map(item => item.memo), ['lined'])
  assert.deepEqual(added.map(item => item.memo), ['lined'])
  // 테이프 칸도 같은 별 버튼을 가진다
  assert.equal(typeof tapeTile(drawer(store, { onToast() {} }), '도트').props.onFavorite, 'function')
})

// 스티커 칸의 별: 모양만 두고(누르는 곳 아님) 넣고 빼기는 칸 길게 누르기 · 접근성 동작 '즐겨찾기'다(사용자 결정 2026-11-05)
test('스티커 칸의 별은 누르는 곳이 아니고, 길게 누르기와 접근성 동작으로 즐겨찾기를 바꾼다', () => {
  const items = { folders: [{ id: 'mine', name: '내 폴더', items: [{ id: 's1', emoji: '🌼' }] }], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], lastStickerCategory: 'folder:mine' }
  const toggled = []
  const view = nodes(drawer(make(), { tab: 'sticker', onToast() {} }, true, { items, toggleFavorite: item => toggled.push(item.id) })).find(node => node.type?.name === 'FolderView')
  const tile = nodes(view.type(view.props)).find(node => node.type?.name === 'Tile' && node.props.onFavorite)
  assert.ok(tile, '즐겨찾기가 가능한 칸')
  const rendered = nodes(tile.type(tile.props))
  // 별은 터치를 받지 않는 View 안에만 있다
  assert.ok(!rendered.some(node => node.type === 'Pressable' && /즐겨찾기/.test(node.props.accessibilityLabel ?? '')))
  const press = rendered.find(node => node.props?.onLongPress)
  assert.equal(press.props.accessibilityHint, '길게 누르면 즐겨찾기')
  assert.deepEqual(press.props.accessibilityActions.map(action => action.name), ['favorite'])
  press.props.onLongPress()
  press.props.onAccessibilityAction({ nativeEvent: { actionName: 'favorite' } })
  assert.equal(toggled.length, 2)
})

// 폴더의 + 말풍선: FolderView 를 열린 상태(adding)로 펼쳐 동작 목록을 본다
const folderActions = (flags) => {
  const items = { folders: [{ id: 'mine', name: '내 폴더', items: [] }], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], lastStickerCategory: 'folder:mine' }
  // 서랍 전체는 기본 훅으로 그리고, FolderView 만 따로 펼친다. FolderView 의 첫 useState 가 adding 이라 그 호출만 열린 값으로 준다
  let index = null // null: 서랍 전체를 그리는 중(기본값 그대로), 숫자: FolderView 안의 useState 호출 순서
  const hooks = { useState: value => { const opened = index !== null && index++ === 0; return [opened ? { anchor: {} } : typeof value === 'function' ? value() : value, () => {}] } }
  const view = nodes(drawer(make(), { tab: 'sticker' }, true, { items }, hooks, flags)).find(node => node.type?.name === 'FolderView')
  index = 0
  const bubble = nodes(view.type(view.props)).find(node => Array.isArray(node.props?.actions))
  return bubble.props.actions.map(action => action.id)
}
test('스티커 폴더의 추가 말풍선은 오리기 입구를 스위치로 감추고, 켜면 돌려놓는다', () => {
  assert.deepEqual(folderActions(), ['image', 'split'])
  assert.deepEqual(folderActions({ CUTOUT_ENTRANCE: true }), ['image', 'split', 'cutout'])
})

test('사진 오리기 저장은 편집기 보관함에 반영하고 저장한 폴더를 연다', async () => {
  const states = [], saves = [], categories = [], notices = []
  let cursor = 0
  const folder = { id: 'mine', name: '내 스티커', items: [] }
  const hooks = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] } }
  const custom = { items: { folders: [folder], favorites: [], recentStickers: [], categoryOrder: [], hiddenCategories: [], tapes: [], lastStickerCategory: 'folder:mine' },
    saveGenerated: async (...args) => { saves.push(args); return 'mine' }, setStickerCategory: id => categories.push(id) }
  const render = () => { cursor = 0; return drawer(make(), { tab: 'sticker', onToast: text => notices.push(text) }, true, custom, hooks, { CUTOUT_ENTRANCE: true }) }
  render()
  // DecorDrawer의 cutoutFolder 상태(8번째 useState)를 연 폴더로 두고 모달의 저장 콜백을 직접 검증한다.
  states[7] = folder
  const modal = nodes(render()).find(node => node.type?.includes?.('StickerCutoutModal'))
  await modal.props.onSave('mine', '내 스티커', [{ emoji: '🌼' }])
  assert.deepEqual(saves, [['mine', '내 스티커', [{ emoji: '🌼' }]]])
  assert.deepEqual(categories, ['folder:mine'])
  assert.deepEqual(notices, ['스티커를 폴더에 저장했어요.'])
})
