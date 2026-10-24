import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as query from '../src/diary/utils/libraryQuery.js';
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'));
const babel = expo('@babel/core');
function compile(file) {
 return babel.transformSync(readFileSync(new URL(file,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
}
function setup(file, storage = {}, native = {}) {
 const state=[], refs=[], effects=[], cleanups=[]; let cursor=0, refCursor=0, effectCursor=0;
 const hooks={memo: fn=>fn,useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef:initial=>{const i=refCursor++;return refs[i]??=( {current:initial} )},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:(fn,deps)=>{const i=effectCursor++;if(!effects[i]||deps.some((v,j)=>v!==effects[i][j])){cleanups[i]?.();effects[i]=deps;cleanups[i]=fn();}}};
 class Value { constructor(v){this.v=v} interpolate(){return 1} setValue(v){this.v=v} }
 const styles=new Proxy({},{get:(_,name)=>name});
 const mocks={'../../editor/services/storage':storage,react:hooks,'react-native':{Platform:{OS:'web'},...native,View:'view',Text:'text',Pressable:'press',TextInput:'input',ScrollView:'scroll',FlatList:'list',Animated:{timing:()=>({start(){},stop(){}}),Value,View:'view',Text:'text',createAnimatedComponent:()=> 'list',event:()=>()=>{}},Easing:{cubic:()=>{},out:x=>x}},'../constants':{C:{},FILTERS:[{id:'personal',label:'모든 다이어리'},{id:'favorite',label:'즐겨찾기'}],CAROUSEL_STEP:250,CAROUSEL_ITEM_WIDTH:220,CAROUSEL_GAP:30},'../styles':{styles},'../utils/libraryQuery':query,'../hooks/useLibraryMetadata':{useLibraryMetadata:()=>({a:{pageCount:2},b:{pageCount:5}})}};
 const module={exports:{}};
 new Function('require','module','exports',compile(file))(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),module,module.exports);
 const render=props=>{cursor=0;refCursor=0;effectCursor=0;return module.exports.default(props)};
 render.unmount=()=>cleanups.forEach(fn=>fn?.());
 return render;
}
const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
test('보관함 검색·초기화·빈 결과·정렬 선택을 연결하고 생성 카드는 검색 밖에서 유지한다',()=>{
 const render=setup('../src/diary/screens/LibraryScreen.js');
 const props={compact:true,diaries:[{id:'a',title:'여행',createdAt:'2026-10-20'},{id:'b',title:'일기',createdAt:'2026-10-21'}],metadata:{a:{pageCount:2},b:{pageCount:5}},sort:'updated',onSortChange:value=>{props.sort=value},filter:'personal',view:'grid',carousel:0,onCarouselChange:()=>{},onCreate:()=>{}};
 const find=(tree,label)=>nodes(tree).find(n=>(n.props.accessibilityLabel??n.props.label)===label);
 let tree=render(props);
 assert.ok(nodes(tree).some(n=>n.type==='../components/CreateDiaryCard'));
 find(tree,'다이어리 검색').props.onPress();tree=render(props);
 assert.ok(!nodes(tree).some(n=>n.type==='../components/CreateDiaryCard'));
 assert.equal(tree.type,'../components/LibrarySearchScreen');
 tree.props.onQueryChange('여행');tree=render(props);
 assert.deepEqual(tree.props.diaries.map(d=>d.id),['a']);
 tree.props.onQueryChange('없는 것');tree=render(props);
 assert.equal(tree.props.diaries.length,0);
 tree.props.onBack();tree=render(props);
 find(tree,'다이어리 검색').props.onPress();tree=render(props);
 assert.equal(tree.props.query,'');
 tree.props.onBack();tree=render(props);
 find(tree,'다이어리 정렬').props.onPress();tree=render(props);
 const options=nodes(tree).filter(n=>n.props.accessibilityRole==='radio');assert.equal(options.length,4);
 options[2].props.onPress();tree=render(props);
 assert.deepEqual(nodes(tree).filter(n=>n.type==='../components/DiaryCard').map(n=>n.props.diary.id),['b','a']);
 assert.ok(nodes(tree).some(n=>n.type==='../components/CreateDiaryCard'));
});
test('접힌·펼친 사이드바 모두 생성 버튼 없이 기존 탐색을 제공한다',()=>{
 const render=setup('../src/diary/components/SideRail.js');
 for(const collapsed of [true,false]){
 const tree=render({collapsed,page:'library',filter:'personal'});
 const labels=nodes(tree).map(n=>n.props.accessibilityLabel);
 assert.ok(!labels.includes('새 다이어리'));
 for(const label of ['모든 다이어리','즐겨찾기','내 공간','휴지통'])assert.ok(labels.includes(label));
 }
});


test('검색 화면은 입력 전에 최근 검색어를 표시하고 제출·재검색·개별 및 전체 삭제를 저장한다', async()=>{
 const writes=[];
 const render=setup('../src/diary/components/LibrarySearchScreen.js', {loadJSON:async()=>['2026','위클리'],saveJSON:async(_,value)=>{writes.push(value);return true;}});
 const props={compact:false,query:'',diaries:[],onQueryChange:value=>{props.query=value},onBack:()=>{}};
 const find=(tree,label)=>nodes(tree).find(n=>(n.props.accessibilityLabel??n.props.label)===label);
 render(props);await new Promise(resolve=>setImmediate(resolve));
 let tree=render(props);
 assert.ok(find(tree,'2026 다시 검색'));
 assert.ok(!nodes(tree).some(n=>n.props.accessibilityLabel==='다이어리 정렬'));
 find(tree,'2026 다시 검색').props.onPress();tree=render(props);
 assert.equal(props.query,'2026');
 assert.ok(nodes(tree).some(n=>n.type==='./EmptyState'&&n.props.title==='검색 결과가 없어요.'));
 find(tree,'검색어 지우기').props.onPress();tree=render(props);
 find(tree,'2026 검색어 삭제').props.onPress();tree=render(props);
 assert.ok(!find(tree,'2026 다시 검색'));
 find(tree,'다이어리 제목 검색').props.onChangeText('여행');tree=render(props);
 find(tree,'다이어리 제목 검색').props.onSubmitEditing();tree=render(props);
 find(tree,'검색어 지우기').props.onPress();tree=render(props);
 assert.ok(find(tree,'여행 다시 검색'));
 find(tree,'최근 검색어 전체 지우기').props.onPress();tree=render(props);
 assert.ok(!find(tree,'여행 다시 검색'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(writes.at(-1),[]);
});


test('Android 시스템 뒤로가기는 검색 닫기를 호출해 이벤트를 소비하고 종료 시 구독을 해제한다',()=>{
 let listener, removed=0, closed=0;
 const render=setup('../src/diary/components/LibrarySearchScreen.js',{loadJSON:async()=>[]},{Platform:{OS:'android'},BackHandler:{addEventListener:(name,fn)=>{assert.equal(name,'hardwareBackPress');listener=fn;return {remove:()=>{removed++}};}}});
 const props={query:'여행',diaries:[],onBack:()=>{closed++}};
 render(props);
 assert.equal(listener(),true);
 assert.equal(closed,1);
 const nextBack=()=>{closed+=10};
 render({...props,onBack:nextBack});
 assert.equal(removed,1);
 assert.equal(listener(),true);
 assert.equal(closed,11);
 render.unmount();
 assert.equal(removed,2);
});
