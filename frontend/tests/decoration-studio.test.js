import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { coverPhotoWithAspect } from '../src/diary/utils/coverPhotoCrop.js'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const transform = file => expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children, node.props?.right].flat(Infinity).flatMap(nodes)] // right: 구역 제목줄 오른쪽 동작
const find = (tree, label) => nodes(tree).find(n => n.props?.accessibilityLabel === label || n.props?.label === label || (n.type === '../components/StudioTool' && n.props.title === label))
const tick = () => new Promise(resolve => setImmediate(resolve))
// 스티커 만들기: '스티커 추가'를 눌러 뜬 동작 말풍선(DiaryActionBubble)의 항목을 이름으로 찾는다
const stickerAction = (ui, text) => {
  find(ui.render(), '스티커 추가').props.onPress()
  return nodes(ui.render()).find(n => n.type === '../components/DiaryActionBubble').props.actions.find(action => action.text === text)
}
function fixture({ supported = false, failFonts = false, family = null, failRemove = false, libraryReady = true, entries = [], cutout = true, platform = 'web', pickerCalls = [], pickedImage = null, discarded = [] } = {}) {
  const states = [], refs = [], deps = [], cleanups = [], saves = [], removals = []
  let si, ri, ei, studio = null, fontLoads = 0, backHandler = null
  const opened = [], draftRemovals = []
  const workflow = { subscribe(){}, getSnapshot: () => ({ loaded: true, entries }), removeDraft: async id => { draftRemovals.push(id) } }
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef(initial) { const i = ri++; return refs[i] ??= { current: initial } },
    useEffect(fn, next) { const i = ei++; if (!deps[i] || next.some((v,k)=>v!==deps[i][k])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn() } },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  }
  const custom = { loaded: true, items: { folders: [{ id: 'f1', name: '공용 폴더', items: [{ emoji: '🌼' }] }] },
    saveGenerated: async (...args) => { saves.push(args); return 'new-folder' },
    addFolder: name => { custom.items.folders.push({ id: 'f-new', name, items: [] }); return 'f-new' },
    renameFolder: (id, name) => { custom.items.folders.find(f => f.id === id).name = name },
    removeFolder: id => removals.push(['folder', id]), removeFromFolder: (...args) => removals.push(['sticker', ...args]), retrySave() {},
  }
  const library = { ready: libraryReady, covers: [{ id: 'c1', name: '봄 표지', cover: {} }], papers: [{ id: 'p1', name: '월간 속지', orientation: 'portrait', pages: [{}, {}] }],
    removeCover: async id => { removals.push(['cover', id]); return !failRemove }, removePaper: async id => { removals.push(['paper', id]); return !failRemove },
  }
  const load = id => {
    if (id === 'react') return react
    if (id.endsWith('/aiDisclosure')) return { AI_FONT_LABEL: 'AI 생성 글꼴', isAiHandwritingFont: () => false }
    if (id.endsWith('/featureFlags')) return { CUTOUT_ENTRANCE: cutout }
    if (id.endsWith('/useMyLibrary')) return { __esModule: true, default: () => library }
    if (id.endsWith('/useDefaultPaperStyle')) return { __esModule: true, default: () => ({ style: {}, ready: true, save: async () => true }) }
    if (id === 'react/jsx-runtime') return require(id)
    if (id === 'react-native') return { Platform: { OS: platform }, Keyboard: { dismiss() {} }, StyleSheet: {create:v=>v}, View:'View', Text:'Text', Pressable:'Pressable', ScrollView:'ScrollView' }
    if (id.endsWith('/services/image')) return { pickImages: async opts => { pickerCalls.push(['photo', opts.usage]); return pickedImage ? [pickedImage] : [] } }
    if (id.endsWith('/services/mediaStore')) return { discardGeneratedMedia: async items => { discarded.push(...items) } }
    if (id.endsWith('/utils/mediaRecovery.js')) return { mediaFailureMessage: error => error.message }
    if (id.endsWith('/utils/coverPhotoCrop')) return { coverPhotoWithAspect, coverCropPhoto() {}, COVER_PHOTO_RATIO: { portrait: 0.75, landscape: 4 / 3 } }
    if (id.endsWith('/utils/pdfPages')) return { pickPdfPages: async () => { pickerCalls.push(['pdf']); return null } }
    if (id.endsWith('/theme')) return {colors:{},radius:{},DISABLED_OPACITY:.4}
    if (id.endsWith('/useFillGrid')) return { __esModule: true, default: ({ cell, gap }) => ({ onLayout() {}, columns: 1, cellWidth: cell, spreadGap: gap }) } // 격자 폭 재기(훅 순서를 바꾸지 않게 상태 없이)
    if (id.endsWith('/styles')) return {styles:{}}
    if (id.endsWith('/studioBus')) return { subscribeStudio(){}, studioSnapshot:()=>studio, openFontStudio:(options)=>{opened.push(options);studio={}} }
    if (id.endsWith('/manager')) return { fontWorkflow: workflow }
    if (id.endsWith('/workflow')) return { listStatus: (_entries, entry) => ({ draft: '3 / 36 작성 중', processing: '생성 중 · 1,200 / 11,172', ready: '생성 완료' })[entry.status] }
    if (id.endsWith('/library')) return {refreshPersonalFonts:async()=>{fontLoads++;if(failFonts)throw Error('private');return [{id:'font',label:'테스트 글꼴'}]}}
    if (id.endsWith('/text')) return {loadedFontFamily:()=>family}
    if (id.endsWith('/stickerLibrary')) return {BASE_GROUPS:[{name:'기본 분류'}]}
    if (id.endsWith('/loginGate')) return { useLoginGate: () => (_feature, action) => action() } // 로그인한 사용자: 그대로 통과(게스트 안내는 login-gate.test.js)
    if (id.endsWith('/stickerLibrarySyncStatus.js')) return { useStickerLibrarySyncStatus: () => ({ error: null, pending: false, retry() {} }) }
    if (id.endsWith('/useCustomDecor')) return {useCustomDecor:()=>custom}
    if (id.endsWith('/stickerSplit')) return {stickerSplit:{available:supported,reason:'개발 빌드에서 사용할 수 있어요.'}}
    return { __esModule: true, default: id }
  }
  const mod = {exports:{}}
  new Function('require','module','exports',transform('../src/diary/screens/DecorationStudioScreen.js'))(load,mod,mod.exports)
  const render = () => { si=ri=ei=0; return mod.exports.default({compact:false,registerBackHandler:handler=>{backHandler=handler;return()=>{backHandler=null}}}) }
  // 종류 전환: 위쪽 분절 메뉴(StudioTabs)를 눌러 한 종류를 연다
  const tab = id => { nodes(render()).find(n => n.type === '../components/StudioTabs').props.onChange(id) }
  return {render, tab, back:()=>backHandler?.(), custom, saves, removals, opened, draftRemovals, closeFont(){studio=null}, get studio(){return studio}, get fontLoads(){return fontLoads}, unmount(){cleanups.forEach(fn=>fn?.())}}
}
test('iOS 공방의 사진·PDF 선택은 메뉴가 닫힌 뒤 한 번만 연다', async () => {
  const previous = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = callback => callback()
  try {
    for (const [tab, label, action, expected] of [
      ['tapes', '테이프 추가', '사진으로 만들기', ['photo', 'tape']],
      ['covers', '표지 추가', '사진으로 만들기', ['photo', 'photo']],
      ['covers', '표지 추가', 'PDF로 만들기', ['pdf']],
    ]) {
      const calls = [], ui = fixture({ platform: 'ios', pickerCalls: calls })
      ui.render(); await tick(); ui.tab(tab)
      find(ui.render(), label).props.onPress()
      let bubble = nodes(ui.render()).find(n => n.type === '../components/DiaryActionBubble')
      const choose = bubble.props.actions.find(item => item.text === action).onPress
      choose(); choose()
      bubble = nodes(ui.render()).find(n => n.type === '../components/DiaryActionBubble')
      assert.equal(bubble.props.visible, false)
      assert.deepEqual(calls, [])
      bubble.props.onDismiss(); bubble.props.onDismiss()
      await tick()
      assert.deepEqual(calls, [expected])
      ui.unmount()
    }
  } finally { globalThis.requestAnimationFrame = previous }
})
test('사진 크기가 잘못되면 가져온 미디어를 정리하고 오류를 표시한다', async () => {
  const item = { mediaFileId: 'bad', width: 100, height: 0 }, discarded = []
  const ui = fixture({ pickedImage: item, discarded }); ui.render(); await tick(); ui.tab('covers')
  find(ui.render(), '표지 추가').props.onPress()
  const bubble = nodes(ui.render()).find(n => n.type === '../components/DiaryActionBubble')
  bubble.props.actions.find(action => action.text === '사진으로 만들기').onPress()
  await tick(); await tick()
  assert.deepEqual(discarded, [item])
  assert.ok(nodes(ui.render()).some(n => n.props.children === '사진 크기를 확인하지 못했어요.'))
  ui.unmount()
})
test('iOS 메뉴 닫힘 취소·이벤트 유실 후 다시 선택할 수 있고 이전 닫힘은 새 요청을 열지 않는다', async () => {
  const oldTimeout = globalThis.setTimeout, oldClear = globalThis.clearTimeout, oldFrame = globalThis.requestAnimationFrame
  const timers = new Map(); let seq = 0
  globalThis.setTimeout = fn => { const id = ++seq; timers.set(id, fn); return id }
  globalThis.clearTimeout = id => timers.delete(id)
  globalThis.requestAnimationFrame = fn => fn()
  try {
    const calls = [], ui = fixture({ platform: 'ios', pickerCalls: calls })
    ui.render(); await tick(); ui.tab('tapes')
    const open = () => {
      find(ui.render(), '테이프 추가').props.onPress()
      const menu = nodes(ui.render()).find(n => n.type === '../components/DiaryActionBubble')
      menu.props.actions.find(item => item.text === '사진으로 만들기').onPress()
      return nodes(ui.render()).find(n => n.type === '../components/DiaryActionBubble')
    }
    const first = open(); first.props.onClose()
    const second = open(); first.props.onDismiss()
    assert.deepEqual(calls, [])
    second.props.onDismiss(); await tick()
    assert.deepEqual(calls, [['photo', 'tape']])
    const third = open(); [...timers.values()][0]() // 닫힘 이벤트가 오지 않는 경우
    assert.equal(nodes(ui.render()).some(n => n.type === '../components/DiaryActionBubble'), false)
    assert.ok(nodes(ui.render()).some(n => n.props.children === '사진을 불러오지 못했어요. 다시 시도해 주세요.'))
    const fourth = open(); third.props.onDismiss(); fourth.props.onDismiss(); await tick()
    assert.deepEqual(calls, [['photo', 'tape'], ['photo', 'tape']])
    open(); ui.tab('covers'); assert.equal(timers.size, 0)
    ui.unmount()
  } finally { globalThis.setTimeout = oldTimeout; globalThis.clearTimeout = oldClear; globalThis.requestAnimationFrame = oldFrame }
})
test('폰트 제작 재사용·닫기 후 목록 새로고침과 파일 오류 안내를 제공한다', async () => {
  const ui = fixture(); ui.render(); await tick()
  assert.equal(find(ui.render(),'폰트 관리'),undefined)
  assert.ok(nodes(ui.render()).some(n=>n.props.children==='폰트를 불러오지 못했어요.'))
  find(ui.render(),'폰트 추가').props.onPress()
  assert.ok(ui.studio)
  ui.render(); ui.closeFont(); ui.render(); await tick()
  assert.equal(ui.fontLoads,2)
  ui.unmount()
  const failed = fixture({failFonts:true}); failed.render(); await tick()
  assert.ok(find(failed.render(),'폰트 목록 다시 불러오기'))
  assert.equal(nodes(failed.render()).some(n=>n.props.children==='private'),false)
  failed.unmount()
})
test('미지원 시트 분리는 차단하고 API 연결된 사진 오리기 입구를 노출한다', async () => {
  const ui = fixture(); ui.render(); await tick(); ui.tab('stickers')
  assert.equal(stickerAction(ui,'스티커 시트 분리').disabled,true)
  assert.equal(stickerAction(ui,'사진 속 대상 오리기').text,'사진 속 대상 오리기')
  assert.equal(ui.saves.length,0)
  ui.unmount()
  const off = fixture({ cutout: false }); off.render(); await tick(); off.tab('stickers')
  assert.equal(stickerAction(off,'사진 속 대상 오리기'),undefined)
  off.unmount()
})
test('사진 오리기 저장은 공방 보관함 저장 함수를 호출한다', async () => {
  const ui = fixture(); ui.render(); await tick(); ui.tab('stickers')
  stickerAction(ui, '사진 속 대상 오리기').onPress()
  const modal = nodes(ui.render()).find(n => n.type?.includes?.('StickerCutoutModal'))
  await modal.props.onSave(undefined, ' 내 스티커 ', [{ emoji: '🌼' }])
  assert.deepEqual(ui.saves, [[undefined, ' 내 스티커 ', [{ emoji: '🌼' }]]])
  ui.unmount()
})
test('시트 분리 저장은 기존 보관함 함수를 사용하고 삭제는 확인 전까지 반영하지 않는다', async () => {
  const ui=fixture({supported:true}); ui.render(); await tick(); ui.tab('stickers')
  stickerAction(ui,'스티커 시트 분리').onPress()
  const modal=nodes(ui.render()).find(n=>n.type?.includes?.('StickerSplitModal'))
  await modal.props.onSave(undefined,' 기본 분류 ',[{emoji:'🌼'}])
  await modal.props.onSave(undefined,' 공용 폴더 ',[{emoji:'⭐'}])
  assert.deepEqual(ui.saves,[[undefined,'기본 분류',[{emoji:'🌼'}]],[undefined,'공용 폴더',[{emoji:'⭐'}]]])
  modal.props.onClose()
  find(ui.render(),'공용 폴더 스티커 폴더').props.onPress()
  find(ui.render(),'1번 스티커 삭제').props.onPress()
  let confirm=nodes(ui.render()).find(n=>n.props.confirmLabel==='삭제')
  confirm.props.onCancel(); assert.deepEqual(ui.removals,[])
  find(ui.render(),'스티커 폴더 삭제').props.onPress()
  confirm=nodes(ui.render()).find(n=>n.props.confirmLabel==='삭제')
  confirm.props.onConfirm()
  assert.deepEqual(ui.removals,[['folder','f1']])
  ui.unmount()
})

test('폰트 목록은 실제 글꼴 미리보기이며 공방 진입은 폰트 추가 하나다', async () => {
  const ui=fixture({family:'MyFont'}); ui.render(); await tick();
  const tree=ui.render();
  const preview=find(tree,'테스트 글꼴 미리보기');
  assert.equal(preview.props.style[1].fontFamily,'MyFont');
  assert.equal(find(tree,'테스트 글꼴 폰트 관리'),undefined);
  find(tree,'폰트 추가').props.onPress(); assert.ok(ui.studio);
  ui.unmount();
});
test('폰트 추가는 공방의 자체 목록을 거치지 않고 바로 새 폰트 입력으로 연다', async () => {
  const ui=fixture(); ui.render(); await tick();
  find(ui.render(),'폰트 추가').props.onPress();
  assert.deepEqual(ui.opened,[{create:true}]);
  ui.unmount();
});
test('공방 폰트 목록은 만들던 · 생성 중인 폰트도 보여 주고 누르면 그 폰트 화면으로 바로 간다', async () => {
  const entries=[{id:'e1',name:'내 글씨 1',status:'draft'},{id:'e2',name:'내 글씨 2',status:'processing',job:{completed:1200}},{id:'e3',name:'내 글씨 3',status:'ready',fontId:'font'}];
  const ui=fixture({family:'MyFont',entries}); ui.render(); await tick();
  const tree=ui.render();
  const draft=find(tree,'내 글씨 1 3 / 36 작성 중'), running=find(tree,'내 글씨 2 생성 중 · 1,200 / 11,172');
  assert.ok(draft&&running);
  assert.ok(nodes(running).some(n=>n.props?.children==='생성 중 · 1,200 / 11,172'));
  assert.equal(nodes(tree).filter(n=>n.props?.accessibilityLabel==='테스트 글꼴 미리보기').length,1); // 항목과 연결된 폰트는 따로 한 줄 더 나오지 않는다
  assert.equal(find(tree,'내 글씨 3 생성 완료').props.accessibilityRole,'button');
  running.props.onPress();
  assert.deepEqual(ui.opened,[{open:'e2'}]);
  ui.unmount();
});
test('작성 중인 폰트만 지울 수 있고 확인을 거친 뒤에 지운다', async () => {
  const entries=[{id:'e1',name:'내 글씨 1',status:'draft'},{id:'e2',name:'내 글씨 2',status:'processing'}];
  const ui=fixture({entries}); ui.render(); await tick();
  assert.equal(find(ui.render(),'내 글씨 2 삭제'),undefined);
  find(ui.render(),'내 글씨 1 삭제').props.onPress();
  const dialog=nodes(ui.render()).find(n=>n.props?.title==='이 폰트를 지울까요?');
  assert.ok(dialog);
  assert.deepEqual(ui.draftRemovals,[]);
  await dialog.props.onConfirm(); await tick();
  assert.deepEqual(ui.draftRemovals,['e1']);
  ui.unmount();
});
test('스티커 새 폴더: 시트 분리 없이 만들고 바로 들어가 이름을 고친다', async () => {
  const ui=fixture({supported:true}); ui.render(); await tick(); ui.tab('stickers')
  stickerAction(ui,'새 폴더').onPress()
  const opened=ui.render()
  assert.equal(find(opened,'스티커 폴더 이름').props.value,'새 폴더')
  assert.ok(find(opened,'스티커 추가')) // 폴더 안 머리줄 아래 추가 버튼
  find(opened,'스티커 폴더 이름').props.onChangeText('여름')
  find(ui.render(),'스티커 폴더 이름 저장').props.onPress()
  assert.equal(nodes(ui.render()).some(n=>n.props?.accessibilityLabel==='스티커 폴더 이름'),false)
  find(ui.render(),'스티커 폴더 목록').props.onPress()
  assert.ok(find(ui.render(),'여름 스티커 폴더'))
  ui.unmount()
})
test('폴더 안의 뒤로가기는 목록을 먼저 복원하고 이후 상위 화면에 넘긴다', async () => {
  const ui=fixture(); ui.render(); await tick(); ui.tab('stickers');
  assert.equal(ui.back(),false);
  find(ui.render(),'공용 폴더 스티커 폴더').props.onPress(); ui.render();
  assert.equal(ui.back(),true);
  assert.ok(find(ui.render(),'공용 폴더 스티커 폴더'));
  assert.equal(ui.back(),false);
  ui.unmount();
});
const sections = tree => nodes(tree).filter(n => n.type === '../components/StudioSection')
const confirmOf = tree => nodes(tree).find(n => n.props?.confirmLabel === '삭제')
test('공방은 내 폰트 · 스티커 · 테이프 · 표지 · 속지 · 도구 여섯 종류를 분절 메뉴로 하나씩 열고 폴라로이드 보드는 없다', async () => {
  const ui = fixture(); ui.render(); await tick()
  const tabs = nodes(ui.render()).find(n => n.type === '../components/StudioTabs')
  assert.deepEqual(tabs.props.tabs.map(t => t.label), ['폰트', '스티커', '테이프', '표지', '속지', '도구'])
  const titles = []
  for (const id of ['fonts', 'stickers', 'tapes', 'covers', 'papers', 'presets']) {
    ui.tab(id)
    const tree = ui.render()
    assert.equal(sections(tree).length, 1) // 한 번에 한 종류만
    titles.push(sections(tree)[0].props.title)
    assert.equal(nodes(tree).some(n => String(n.type).includes('WorkshopBoard')), false)
    if (id === 'presets') assert.ok(nodes(tree).some(n => n.type === '../components/StudioPresets'))
    // 기본 속지 설정(새 다이어리의 처음 값)은 내 속지 구역 안에 있다
    if (id === 'papers') assert.ok(nodes(sections(tree)[0]).some(n => n.type === '../components/StudioPaperStyle'))
  }
  assert.deepEqual(titles, ['폰트', '스티커', '테이프', '표지', '속지', '도구'])
  ui.unmount()
})
test('내 표지 · 속지는 확인을 거친 뒤에만 지우고 저장에 실패하면 알린다', async () => {
  const ui = fixture(); ui.render(); await tick(); ui.tab('covers')
  const shelf = kind => nodes(ui.render()).find(n => n.type === '../components/StudioShelf' && n.props.kind === kind)
  assert.equal(shelf('cover').props.items[0].id, 'c1')
  shelf('cover').props.onRemove(shelf('cover').props.items[0])
  assert.equal(confirmOf(ui.render()).props.title, '이 표지를 지울까요?')
  confirmOf(ui.render()).props.onCancel()
  assert.deepEqual(ui.removals, [])
  assert.equal(confirmOf(ui.render()).props.open, false)
  ui.tab('papers')
  shelf('paper').props.onRemove(shelf('paper').props.items[0])
  assert.equal(confirmOf(ui.render()).props.title, '이 속지를 지울까요?')
  await confirmOf(ui.render()).props.onConfirm()
  assert.deepEqual(ui.removals, [['paper', 'p1']])
  assert.equal(nodes(ui.render()).some(n => n.props?.accessibilityRole === 'alert' && String(n.props.children).includes('지우지 못했어요')), false)
  ui.unmount()
  const failed = fixture({ failRemove: true }); failed.render(); await tick(); failed.tab('covers')
  const cover = nodes(failed.render()).find(n => n.type === '../components/StudioShelf' && n.props.kind === 'cover')
  cover.props.onRemove(cover.props.items[0])
  await confirmOf(failed.render()).props.onConfirm()
  assert.ok(nodes(failed.render()).some(n => n.props?.accessibilityRole === 'alert' && n.props.children === '표지를 지우지 못했어요. 다시 시도해 주세요.'))
  failed.unmount()
})
test('내 표지 · 속지를 읽는 중에는 목록 대신 불러오는 중이라고 말한다', async () => {
  const ui = fixture({ libraryReady: false }); ui.render(); await tick()
  ui.tab('covers')
  let tree = ui.render()
  assert.ok(nodes(tree).some(n => n.props?.children === '표지를 불러오고 있어요.'))
  assert.equal(nodes(tree).some(n => n.type === '../components/StudioShelf'), false)
  ui.tab('papers')
  tree = ui.render()
  assert.ok(nodes(tree).some(n => n.props?.children === '속지를 불러오고 있어요.'))
  assert.equal(nodes(tree).some(n => n.type === '../components/StudioShelf'), false)
  ui.unmount()
})
