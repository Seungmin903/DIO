import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const transform = file => expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const find = (tree, label) => nodes(tree).find(n => n.props?.accessibilityLabel === label || n.props?.label === label)
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture({ supported = false, failFonts = false, family = null } = {}) {
  const states = [], refs = [], deps = [], cleanups = [], saves = [], removals = []
  let si, ri, ei, studio = null, fontLoads = 0, backHandler = null
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef(initial) { const i = ri++; return refs[i] ??= { current: initial } },
    useEffect(fn, next) { const i = ei++; if (!deps[i] || next.some((v,k)=>v!==deps[i][k])) { cleanups[i]?.(); deps[i] = next; cleanups[i] = fn() } },
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  }
  const custom = { loaded: true, items: { folders: [{ id: 'f1', name: '공용 폴더', items: [{ emoji: '🌼' }] }] },
    saveGenerated: async (...args) => { saves.push(args); return 'new-folder' },
    removeFolder: id => removals.push(['folder', id]), removeFromFolder: (...args) => removals.push(['sticker', ...args]), retrySave() {},
  }
  const load = id => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return require(id)
    if (id === 'react-native') return { StyleSheet: {create:v=>v}, View:'View', Text:'Text', Pressable:'Pressable', ScrollView:'ScrollView' }
    if (id.endsWith('/theme')) return {colors:{},radius:{},DISABLED_OPACITY:.4}
    if (id.endsWith('/styles')) return {styles:{}}
    if (id.endsWith('/studioBus')) return { subscribeStudio(){}, studioSnapshot:()=>studio, openFontStudio:()=>{studio={}} }
    if (id.endsWith('/library')) return {refreshPersonalFonts:async()=>{fontLoads++;if(failFonts)throw Error('private');return [{id:'font',label:'테스트 글꼴'}]}}
    if (id.endsWith('/text')) return {loadedFontFamily:()=>family}
    if (id.endsWith('/stickerLibrary')) return {BASE_GROUPS:[{name:'기본 분류'}]}
    if (id.endsWith('/useCustomDecor')) return {useCustomDecor:()=>custom}
    if (id.endsWith('/stickerSplit')) return {stickerSplit:{available:supported,reason:'개발 빌드에서 사용할 수 있어요.'}}
    return { __esModule: true, default: id }
  }
  const mod = {exports:{}}
  new Function('require','module','exports',transform('../src/diary/screens/DecorationStudioScreen.js'))(load,mod,mod.exports)
  const render = () => { si=ri=ei=0; return mod.exports.default({compact:false,registerBackHandler:handler=>{backHandler=handler;return()=>{backHandler=null}}}) }
  return {render, back:()=>backHandler?.(), custom, saves, removals, closeFont(){studio=null}, get studio(){return studio}, get fontLoads(){return fontLoads}, unmount(){cleanups.forEach(fn=>fn?.())}}
}
test('폰트 제작 재사용·닫기 후 목록 새로고침과 파일 오류 안내를 제공한다', async () => {
  const ui = fixture(); ui.render(); await tick()
  assert.ok(find(ui.render(),'폰트 관리'))
  assert.ok(nodes(ui.render()).some(n=>n.props.children==='폰트를 불러오지 못했어요. 폰트 관리에서 확인해 주세요.'))
  find(ui.render(),'내 폰트 만들기').props.onPress()
  assert.ok(ui.studio)
  ui.render(); ui.closeFont(); ui.render(); await tick()
  assert.equal(ui.fontLoads,2)
  ui.unmount()
  const failed = fixture({failFonts:true}); failed.render(); await tick()
  assert.ok(find(failed.render(),'폰트 목록 다시 불러오기'))
  assert.equal(nodes(failed.render()).some(n=>n.props.children==='private'),false)
  failed.unmount()
})
test('미지원 시트 분리는 차단하고 사진 오리기 목업 진입·닫기는 폴더를 만들지 않는다', async () => {
  const ui = fixture(); ui.render(); await tick()
  assert.equal(find(ui.render(),'스티커 시트 분리').props.disabled,true)
  find(ui.render(),'사진 속 대상 오리기').props.onPress()
  const modal = nodes(ui.render()).find(n=>n.type?.includes?.('StickerCutoutModal'))
  assert.ok(modal)
  modal.props.onClose()
  assert.equal(ui.saves.length,0)
  assert.equal(nodes(ui.render()).some(n=>n.type?.includes?.('StickerCutoutModal')),false)
  ui.unmount()
})
test('시트 분리 저장은 기존 보관함 함수를 사용하고 삭제는 확인 전까지 반영하지 않는다', async () => {
  const ui=fixture({supported:true}); ui.render(); await tick()
  find(ui.render(),'스티커 시트 분리').props.onPress()
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

test('폰트 목록은 실제 글꼴 미리보기이며 관리 진입을 구분한다', async () => {
  const ui=fixture({family:'MyFont'}); ui.render(); await tick();
  const tree=ui.render();
  const preview=find(tree,'테스트 글꼴 미리보기');
  assert.equal(preview.props.style[1].fontFamily,'MyFont');
  assert.equal(find(tree,'테스트 글꼴 폰트 관리'),undefined);
  find(tree,'폰트 관리').props.onPress(); assert.ok(ui.studio);
  ui.unmount();
});
test('폴더 안의 뒤로가기는 목록을 먼저 복원하고 이후 상위 화면에 넘긴다', async () => {
  const ui=fixture(); ui.render(); await tick();
  assert.equal(ui.back(),false);
  find(ui.render(),'공용 폴더 스티커 폴더').props.onPress(); ui.render();
  assert.equal(ui.back(),true);
  assert.ok(find(ui.render(),'공용 폴더 스티커 폴더'));
  assert.equal(ui.back(),false);
  ui.unmount();
});
