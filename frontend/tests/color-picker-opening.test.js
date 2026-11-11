import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
function load(file, overrides={}){
 const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]})
 const module={exports:{}}
 const mocks={react:{useRef:value=>({current:value}),useState:value=>[typeof value==='function'?value():value,()=>{}],useEffect(){}},'react-native':{Platform:{OS:'ios'},View:'view',ScrollView:'scroll',Pressable:'button',Text:'text',useWindowDimensions:()=>({width:390,height:844}),StyleSheet:{create:v=>v}},...overrides}
 new Function('require','module','exports',code)(id=>{
  if(mocks[id])return mocks[id]
  if(id==='react/jsx-runtime')return require(id)
  if(id.endsWith('/theme'))return {colors:{},bubble:{}}
  if(id.endsWith('/usePalettes'))return {tapeColors:()=>({bg:'#111111',fg:'#222222'})}
  if(id.endsWith('/eyedropper'))return {eyedropperMode:'screenTap'}
  return {__esModule:true,default:id}
 },module,module.exports)
 return module.exports.default
}
const nodes=node=>node&&typeof node==='object'?[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]:[]

test('기본 색 복원 실패 후 재시도 중과 성공 후에는 이전 오류를 지운다',async()=>{
 const state=[];let cursor=0,fail=true,finish
 const palette={edited:true,reset(){return fail?Promise.reject(Error('write failed')):new Promise(resolve=>{finish=()=>{palette.edited=false;resolve()}})}}
 const Component=load('diary/components/StudioPresets.js',{
  react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=value}]}},
  '../../editor/hooks/usePalettes':{usePalette:()=>palette},
 })
 const group=Component({}).props.children('100%')[0]
 const render=()=>{cursor=0;return group.type(group.props)}
 const reset=tree=>nodes(tree)[1].props.right.props.onPress()
 const alert=tree=>nodes(tree).find(n=>n.props?.accessibilityRole==='alert')
 let tree=render();assert.equal(alert(tree),undefined)
 await reset(tree);tree=render();const failure=alert(tree);assert.ok(failure)
 fail=false;const pending=reset(tree);tree=render();assert.equal(alert(tree),undefined)
 finish();await pending;tree=render();assert.equal(alert(tree),undefined)
 assert.equal(nodes(tree)[1].props.right,null)
 assert.equal(failure.props.style.fontSize,12.5)
})
test('팔레트 편집은 네이티브 위치 측정이 없거나 늦어도 즉시 공용 창 열기를 요청한다',()=>{
 const open=[];const Component=load('editor/components/controls/EditablePalette.js',{'../../hooks/usePalettes':{usePalette:()=>({colors:['#123456'],loaded:true,replace(){}})}})
 const tree=Component({scope:'pen',label:'펜',initiallyEditing:true,onOpenEditor:value=>open.push(value)})
 const button=nodes(tree).find(n=>n.props?.accessibilityLabel==='펜 팔레트 1번 색 편집');button.props.ref({measureInWindow(){}});button.props.onLayout();button.props.onPress()
 assert.equal(open.length,1);assert.equal(open[0].anchor,null);assert.equal(open[0].title,'펜 색')
})
test('공용 창은 닫기·HEX 옆 아이콘을 제공하고 별도 저장·내 색상 버튼 없이 최신 색을 확정한다',async()=>{
 const saved=[];const Component=load('diary/components/PresetColorEditor.js')
 const tree=Component({title:'글자 색',value:'#123456',onDone:color=>saved.push(color),onClose(){}})
 const children=nodes(tree)
 assert.ok(children.find(n=>n.props?.accessibilityLabel==='글자 색 창 닫기'))
 const picker=children.find(n=>n.type.endsWith?.('/ColorPicker'))
 assert.ok(picker.props.trailing)
 assert.equal(nodes(picker.props.trailing).some(n=>n.type==='text'),false)
 picker.props.onChange('#654321');await tree.props.onClose();assert.deepEqual(saved,['#654321'])
})


test('직접 지정 원은 기존 7칸을 바꾸지 않고 현재 펜 색에만 적용한다',async()=>{
 const open=[],picked=[],replaced=[]
 const Component=load('editor/components/controls/EditablePalette.js',{'../../hooks/usePalettes':{usePalette:()=>({colors:Array(7).fill('#123456'),loaded:true,replace:(...args)=>replaced.push(args)})}})
 const tree=Component({scope:'pen',label:'펜',value:'#654321',allowDirect:true,onPick:c=>picked.push(c),onOpenEditor:r=>open.push(r)})
 const buttons=nodes(tree).filter(n=>n.type==='button')
 assert.equal(buttons.filter(n=>n.props.accessibilityLabel.startsWith('펜 색상 ')).length,7)
 buttons.find(n=>n.props.accessibilityLabel==='펜 색 직접 지정').props.onPress()
 assert.equal(open[0].value,'#654321');await open[0].onDone('#ABCDEF')
 assert.deepEqual(picked,['#ABCDEF']);assert.deepEqual(replaced,[])
})

test('팔레트 불러오기 실패 후 재시도가 성공하면 이전 오류와 재시도 안내를 없앤다',async()=>{
 const state=[];let cursor=0,fail=true
 const palette={colors:['#123456'],loaded:false,async retry(){if(fail)throw Error('read failed');this.loaded=true}}
 const Component=load('editor/components/controls/EditablePalette.js',{
  react:{useRef:value=>({current:value}),useEffect(){},useState:initial=>{
   const index=cursor++;if(!(index in state))state[index]=initial
   return [state[index],next=>{state[index]=typeof next==='function'?next(state[index]):next}]
  }},
  '../../hooks/usePalettes':{usePalette:()=>palette},
 })
 const render=()=>{cursor=0;return Component({scope:'pen',label:'펜',value:'#123456'})}
 const retry=tree=>nodes(tree).find(n=>n.props?.accessibilityLabel==='펜 팔레트 다시 불러오기')
 const errorShown=tree=>nodes(tree).some(n=>n.type==='text'&&n.props.children==='팔레트를 불러오지 못했어요.')
 let tree=render();assert.ok(retry(tree));assert.equal(errorShown(tree),false)
 await retry(tree).props.onPress();tree=render();assert.equal(errorShown(tree),true)
 fail=false;await retry(tree).props.onPress();tree=render()
 assert.equal(palette.loaded,true);assert.equal(errorShown(tree),false);assert.equal(retry(tree),undefined)
})
