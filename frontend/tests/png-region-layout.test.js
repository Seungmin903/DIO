import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
function load(path, mocks) {
 const code=expo('@babel/core').transformSync(readFileSync(new URL(path,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
 const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id]??{__esModule:true,default:id},mod,mod.exports);return mod.exports
}
const flatten=style=>Object.assign({},...[style].flat(Infinity).filter(Boolean))
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const c of [tree.props?.children].flat(Infinity)){const found=find(c,predicate);if(found)return found}return null}
function parentOf(tree,type){if(!tree||typeof tree!=='object')return null;const children=[tree.props?.children].flat(Infinity);if(children.some(c=>c?.type===type))return tree;for(const c of children){const p=parentOf(c,type);if(p)return p}return null}
function screen(width,stablePreview) {
 const native={Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:s=>s},useWindowDimensions:()=>({width})}
 const {default:ExportScreen}=load('../src/editor/components/ExportScreen.js',{'react/jsx-runtime':jsx,'react-native':native,'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'../../shared/theme':{colors:{},DISABLED_OPACITY:0.5},'./ToolPanel':{toolPanelStyles:{card:{},content:{}}}})
 return ExportScreen({title:'QA',preview:'preview',children:'options',stablePreview})
}
test('영역 선택의 폰 옵션 공간은 내용 변화와 무관한 고정 높이이고 안에서 스크롤한다',()=>{
 const tree=screen(390,true),card=parentOf(tree,'ScrollView')
 assert.ok(card)
 const style=flatten(card.props.style)
 assert.equal(style.height,'45%');assert.equal(style.maxHeight,'45%');assert.equal(style.flexShrink,0)
 assert.equal(card.props.children.type,'ScrollView')
 assert.equal(flatten(find(tree,node=>node.props?.children==='preview').props.style).minHeight,0)
})
test('다른 내보내기 화면과 넓은 화면에는 고정 높이를 강제하지 않는다',()=>{
 for(const [width,stable]of [[390,false],[1100,true],[1100,false]]){
  const tree=screen(width,stable),card=parentOf(tree,'ScrollView')
  assert.equal(flatten(card.props.style).height,undefined)
  assert.equal(flatten(find(tree,node=>node.props?.children==='preview').props.style).minHeight,200)
 }
})
test('실제 영역 선택 화면이 안정된 미리보기를 요청한다',()=>{
 const react={useState:initial=>[initial,()=>{}],useRef:value=>({current:value}),useEffect:()=>{}}
 const {default:Selector}=load('../src/editor/components/RegionExportSelector.js',{'react/jsx-runtime':jsx,react,'react-native':{StyleSheet:{create:s=>s},Text:'Text',View:'View'},'../utils/pageGeometry.js':{pageSize:()=>({width:1280,height:1800})},'../utils/regionGeometry.js':{REGION_PRESETS:{free:{label:'자유'}},fitRegionPreset:r=>r,regionOutput:()=>({width:2560,height:3600,magnification:2}),validRegion:()=>true},'./ExportScreen':{__esModule:true,default:'ExportScreen',ExportButton:'ExportButton',InfoRow:'InfoRow',Note:'Note'},'./ToolPanel':{toolPanelStyles:{}}})
 const tree=Selector({page:{id:'page'}})
 assert.equal(tree.type,'ExportScreen');assert.equal(tree.props.stablePreview,true)
})
