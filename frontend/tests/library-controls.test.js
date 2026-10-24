import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as query from '../src/diary/utils/libraryQuery.js';
import * as selectionUtils from '../src/diary/utils/diarySelection.js';
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
 const mocks={'../../editor/services/storage':storage,react:hooks,'react-native':{Platform:{OS:'web'},...native,View:'view',Text:'text',Pressable:'press',TextInput:'input',ScrollView:'scroll',FlatList:'list',Animated:{timing:()=>({start(){},stop(){}}),Value,View:'view',Text:'text',createAnimatedComponent:()=> 'list',event:()=>()=>{}},Easing:{cubic:()=>{},out:x=>x}},'../constants':{C:{},FILTERS:[{id:'personal',label:'모든 다이어리'},{id:'favorite',label:'즐겨찾기'}],CAROUSEL_STEP:250,CAROUSEL_ITEM_WIDTH:220,CAROUSEL_GAP:30},'../styles':{styles},'../utils/diarySelection':selectionUtils,'../utils/libraryQuery':query,'../hooks/useLibraryMetadata':{useLibraryMetadata:()=>({a:{pageCount:2},b:{pageCount:5}})}};
 const module={exports:{}};
 new Function('require','module','exports',compile(file))(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),module,module.exports);
 const render=props=>{cursor=0;refCursor=0;effectCursor=0;return module.exports.default(props)};
 render.unmount=()=>cleanups.forEach(fn=>fn?.());
 return render;
}
const nodes=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
const findControl=(tree,label)=>nodes(tree).find(n=>(n.props.accessibilityLabel??n.props.label)===label);
test('API 모드의 검색 결과는 서버 순서를 유지하고 로딩·오류를 빈 결과로 표시하지 않는다', () => {
 const render=setup('../src/diary/screens/LibraryScreen.js');
 const props={compact:true,diaries:[{id:'b',title:'서버 첫 결과'},{id:'a',title:'서버 둘째 결과'}],filter:'favorite',sort:'title',view:'grid',carousel:0,onCarouselChange:()=>{},
  remoteQuery:{query:'서버',searchOpen:true,onQueryChange:()=>{},onSearchOpenChange:()=>{}},requestNotice:'request-state',suppressEmpty:true,historyKey:'mock-history'};
 const tree=render(props);
 assert.deepEqual(tree.props.diaries.map(d=>d.id),['b','a']);
 assert.equal(tree.props.requestNotice,'request-state');
 assert.equal(tree.props.suppressEmpty,true);
 assert.equal(tree.props.historyKey,'mock-history');
 assert.ok(!findControl(tree.props.optionsMenu,'편집'));
});

test('검색 중 오류·로딩에는 결과 없음과 0개 성공 문구를 숨긴다', () => {
 const render=setup('../src/diary/components/LibrarySearchScreen.js',{loadJSON:async()=>[],saveJSON:async()=>true});
 const tree=render({compact:true,query:'검색',diaries:[],suppressEmpty:true,requestNotice:'오류 안내'});
 assert.ok(nodes(tree).some(n=>n.props.children==='오류 안내') || nodes(tree).some(n=>[n.props.children].flat(Infinity).includes('오류 안내')));
 assert.ok(!nodes(tree).some(n=>n.type==='./EmptyState'));
 assert.ok(!nodes(tree).some(n=>typeof n.props.children==='string' && n.props.children.includes('검색 결과 0개')));
 render.unmount();
});
function selectionProps(compact=false) {
 const props={compact,diaries:[{id:'a',title:'여행',favorite:true},{id:'b',title:'일기',favorite:false}],filter:'personal',sort:'title',view:'grid',carousel:0,selection:null,onCarouselChange:()=>{}};
 props.onSelectionChange=value=>{props.selection=value};
 props.onFilterChange=value=>{props.filter=value};
 props.onSortChange=value=>{props.sort=value};
 return props;
}
test('폰·태블릿은 옵션 메뉴에서 편집에 진입하고 필터·정렬을 유지한다',()=>{
 for(const compact of [true,false]) {
  const render=setup('../src/diary/screens/LibraryScreen.js'),props=selectionProps(compact);
  let tree=render(props);
  assert.ok(!findControl(tree,'다이어리 선택'));
  assert.ok(!findControl(tree,'편집'));
  findControl(tree,'보관함 옵션').props.onPress();tree=render(props);
  assert.equal(nodes(tree).filter(n=>n.props.accessibilityRole==='radio').length,4);
  assert.ok(findControl(tree,'정렬 기준'));
  assert.equal(findControl(tree,'편집').props.accessibilityRole,'button');
  findControl(tree,'편집').props.onPress();tree=render(props);
  assert.deepEqual(props.selection,[]);
  assert.equal(props.sort,'title');assert.equal(props.filter,'personal');
  assert.ok(!findControl(tree,'보관함 옵션'));assert.ok(!findControl(tree,'다이어리 검색'));
  assert.ok(findControl(tree,'선택한 0개 휴지통으로 이동').props.disabled);
  assert.ok(!nodes(tree).some(n=>n.type==='../components/CreateDiaryCard'));
  const card=nodes(tree).find(n=>n.type==='../components/DiaryCard');
  card.props.onToggleSelect(card.props.diary);tree=render(props);
  assert.equal(props.selection.length,1);
  findControl(tree,'편집 완료').props.onPress();tree=render(props);
  assert.equal(props.selection,null);
  assert.equal(findControl(tree,'보관함 옵션').props.accessibilityState.expanded,false);
 }
});
test('빈 보관함과 빈 필터 결과에는 편집과 구분선이 없다',()=>{
 for(const diaries of [[],[{id:'a',title:'일기',favorite:false}]]) {
  const render=setup('../src/diary/screens/LibraryScreen.js'),props={...selectionProps(),diaries,filter:'favorite'};
  let tree=render(props);findControl(tree,'보관함 옵션').props.onPress();tree=render(props);
  assert.ok(!findControl(tree,'편집'));
  assert.ok(!nodes(tree).some(n=>n.props.style==='libraryOptionsDivider'));
  assert.equal(nodes(tree).filter(n=>n.props.accessibilityRole==='radio').length,4);
 }
});
test('검색 결과에서 선택·취소·삭제 요청은 검색어·필터·정렬과 대상 목록을 유지한다',()=>{
 const render=setup('../src/diary/screens/LibraryScreen.js'),props=selectionProps(true);let trashed;
 props.onTrashSelected=value=>{trashed=value};
 let tree=render(props);findControl(tree,'다이어리 검색').props.onPress();tree=render(props);
 tree.props.onQueryChange('없는 이름');tree=render(props);
 findControl(tree.props.optionsMenu,'보관함 옵션').props.onPress();tree=render(props);
 assert.ok(!findControl(tree.props.optionsMenu,'편집'));
 tree.props.onQueryChange('여행');tree=render(props);
 findControl(tree.props.optionsMenu,'편집').props.onPress();tree=render(props);
 assert.equal(tree.props.query,'여행');assert.equal(tree.props.selecting,true);
 assert.equal(tree.props.optionsMenu,false);assert.deepEqual(tree.props.diaries.map(d=>d.id),['a']);
 tree.props.onToggleSelect(tree.props.diaries[0]);tree=render(props);
 findControl(tree.props.selectionBar,'선택한 1개 휴지통으로 이동').props.onPress();
 assert.deepEqual(trashed,['a']);
 tree.props.onBack();tree=render(props);
 assert.equal(props.selection,null);assert.equal(tree.props.query,'여행');
 assert.equal(props.sort,'title');assert.equal(props.filter,'personal');
 assert.equal(findControl(tree.props.optionsMenu,'보관함 옵션').props.accessibilityState.expanded,false);
});
test('검색 관리 모드에서는 입력과 초기화를 막고 카드에 선택 상태를 전달한다',()=>{
 const render=setup('../src/diary/components/LibrarySearchScreen.js',{loadJSON:async()=>[],saveJSON:async()=>true});
 const toggle=()=>{},props={compact:true,query:'여행',diaries:[{id:'a',title:'여행'}],selecting:true,selected:['a'],onToggleSelect:toggle};
 let tree=render(props);
 assert.equal(findControl(tree,'다이어리 제목 검색').props.editable,false);
 assert.ok(!findControl(tree,'검색어 지우기'));
 const card=nodes(tree).find(n=>n.type==='./DiaryCard');
 assert.equal(card.props.selecting,true);assert.equal(card.props.selected,true);assert.equal(card.props.onToggleSelect,toggle);
 tree=render({...props,selecting:false});
 assert.equal(findControl(tree,'다이어리 제목 검색').props.editable,true);
 assert.ok(findControl(tree,'검색어 지우기'));
});
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
 find(tree,'보관함 옵션').props.onPress();tree=render(props);
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
 assert.ok(!nodes(tree).some(n=>n.props.accessibilityLabel==='보관함 옵션'));
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

test('전체 선택은 필터 결과 전부를 선택하고 전체 해제·부분 선택을 처리한다',()=>{
 for(const view of ['grid','carousel']) {
  const render=setup('../src/diary/screens/LibraryScreen.js'),props=selectionProps();
  props.view=view;props.selection=[];
  props.diaries=Array.from({length:20},(_,i)=>({id:String(i),title:String(i),favorite:i<5}));
  let tree=render(props);findControl(tree,'전체 선택').props.onPress();tree=render(props);
  assert.equal(props.selection.length,20);
  findControl(tree,'전체 해제').props.onPress();tree=render(props);assert.deepEqual(props.selection,[]);
  props.selection=['1'];tree=render(props);findControl(tree,'전체 선택').props.onPress();tree=render(props);
  assert.equal(props.selection.length,20);
  props.filter='favorite';tree=render(props);assert.equal(props.selection.length,5);
  findControl(tree,'전체 해제').props.onPress();tree=render(props);
  findControl(tree,'전체 선택').props.onPress();assert.deepEqual(new Set(props.selection),new Set(['0','1','2','3','4']));
 }
});
test('검색과 즐겨찾기의 교집합만 전체 선택하고 휴지통으로 전달한다',()=>{
 const render=setup('../src/diary/screens/LibraryScreen.js'),props=selectionProps();let trashed;
 props.diaries=[{id:'a',title:'여행 A',favorite:true},{id:'b',title:'여행 B',favorite:false},{id:'c',title:'일기',favorite:true}];
 props.filter='favorite';props.onTrashSelected=ids=>{trashed=ids};
 let tree=render(props);findControl(tree,'다이어리 검색').props.onPress();tree=render(props);
 tree.props.onQueryChange('여행');tree=render(props);findControl(tree.props.optionsMenu,'보관함 옵션').props.onPress();tree=render(props);
 findControl(tree.props.optionsMenu,'편집').props.onPress();tree=render(props);
 findControl(tree.props.selectionBar,'전체 선택').props.onPress();tree=render(props);assert.deepEqual(props.selection,['a']);
 findControl(tree.props.selectionBar,'선택한 1개 휴지통으로 이동').props.onPress();assert.deepEqual(trashed,['a']);
 findControl(tree.props.selectionBar,'편집 완료').props.onPress();tree=render(props);assert.equal(tree.props.query,'여행');assert.equal(props.filter,'favorite');
});
test('빈 결과와 이동 중에는 전체 선택을 막고 개별 선택도 유지한다',()=>{
 const render=setup('../src/diary/screens/LibraryScreen.js'),props=selectionProps();props.selection=[];props.diaries=[];
 let tree=render(props);assert.equal(findControl(tree,'전체 선택').props.disabled,true);
 props.diaries=[{id:'a',title:'일기'}];props.trashing=true;tree=render(props);
 assert.equal(findControl(tree,'전체 선택').props.disabled,true);assert.equal(findControl(tree,'편집 완료').props.disabled,true);
 findControl(tree,'전체 선택').props.onPress();assert.deepEqual(props.selection,[]);
 const card=nodes(tree).find(n=>n.type==='../components/DiaryCard');card.props.onToggleSelect(card.props.diary);assert.deepEqual(props.selection,[]);
});
