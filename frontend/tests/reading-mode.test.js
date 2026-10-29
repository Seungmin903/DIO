import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as gestures from '../src/editor/utils/readingGestures.js'
import * as pageRepeat from '../src/editor/utils/pageRepeat.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/chrome/ReadingChrome.js', import.meta.url), 'utf8')
const { code } = expo('@babel/core').transformSync(source, { configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
function chrome({ effects = false, appListeners = [], cleanups = [] } = {}) {
  const mod = { exports: {} }
  const load = id => {
    if (id === 'react') return { useRef: current => ({current}), useState: initial => [initial, () => {}], useEffect(fn) {if(effects){const cleanup=fn();if(cleanup)cleanups.push(cleanup)}} }
    if (id === 'react-native') return { Pressable: 'button', Text: 'text', View: 'view', StyleSheet: {create: x => x},
      AppState:{addEventListener(_name,listener){appListeners.push(listener);return {remove(){appListeners.splice(appListeners.indexOf(listener),1)}}}} }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {}, DISABLED_OPACITY: 0.4 }
    if (id.endsWith('/readingGestures.js')) return gestures
    if (id.endsWith('/pageRepeat.js')) return pageRepeat
    if (id.endsWith('/BrandLogo') || id.endsWith('/Icon')) return () => null
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, mod, mod.exports)
  return mod.exports
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found }
  return null
}
test('슬라이더는 해제할 때만 페이지를 변경하고 취소하면 변경하지 않는다', () => {
  for (const cancel of [false,true]) {
    const calls = [], tree = chrome().ReadingNavigation({index:0,count:5,onSelect:i => calls.push(i)})
    const slider = find(tree, node => node.props?.accessibilityRole === 'adjustable').props
    slider.onLayout({nativeEvent:{layout:{width:400}}})
    slider.onResponderGrant({nativeEvent:{pageX:100,locationX:100}})
    slider.onResponderMove({nativeEvent:{pageX:300}})
    assert.deepEqual(calls, [])
    if (cancel) slider.onResponderTerminate(); else slider.onResponderRelease()
    assert.deepEqual(calls, cancel ? [] : [3])
  }
})
test('한 페이지 슬라이더는 터치를 받지 않고 키보드 탐색은 경계를 넘지 않는다', () => {
  const calls = [], one = find(chrome().ReadingNavigation({index:0,count:1,onSelect:i=>calls.push(i)}), n=>n.props?.accessibilityRole==='adjustable').props
  assert.equal(one.onStartShouldSetResponder(),false)
  const slider = find(chrome().ReadingNavigation({index:0,count:3,onSelect:i=>calls.push(i)}), n=>n.props?.accessibilityRole==='adjustable').props
  slider.onKeyDown({key:'ArrowLeft',preventDefault(){}}); slider.onKeyDown({key:'End',preventDefault(){}})
  assert.deepEqual(calls,[0,2])
})
test('탭·스와이프의 시간·거리·대각선·핀치 경계를 적용한다', () => {
  const action = patch => gestures.readingGestureAction({dx:0,dy:0,x:500,width:1000,duration:20,scale:1,...patch})
  assert.equal(action({duration:351}),null)
  assert.equal(action({dx:-47}),null)
  assert.equal(action({dx:-48,dy:32}),'next')
  assert.equal(action({dx:-48,dy:33}),null)
  assert.equal(action({dx:-100,scale:1.01,duration:300}),null)
  assert.equal(action({pinched:true}),null)
  assert.equal(action({cancelled:true}),null)
  assert.equal(gestures.pageFromProgress(-10,100,5),0)
  assert.equal(gestures.pageFromProgress(110,100,5),4)
})

test('확대 상태에서만 빠른 수평 스와이프를 구분하고 느린 드래그의 빠른 마무리는 넘기지 않는다', () => {
  const action = patch => gestures.readingGestureAction({dx:-100,dy:0,x:500,width:1000,duration:100,scale:2,...patch})
  assert.equal(action({}),'next')
  assert.equal(action({dx:100}),'previous')
  assert.equal(action({dx:-48,duration:96}),'next')
  assert.equal(action({dx:-48,duration:97}),null)
  assert.equal(action({duration:251}),null)
  assert.equal(action({dragged:true}),null)
  assert.equal(action({dy:80}),null)
  assert.equal(action({scale:1,duration:2000,dragged:true}),'next')
  const slow = gestures.readingDragLocked({dx:60,dy:0,duration:200,scale:2})
  assert.equal(slow,true)
  assert.equal(gestures.readingDragLocked({dx:200,dy:0,duration:220,scale:2,dragged:slow}),true)
  assert.equal(gestures.readingDragLocked({dx:5,dy:0,duration:1000,scale:2}),false)
  assert.equal(gestures.readingDragLocked({dx:0,dy:30,duration:20,scale:2}),true)
})

test('읽기 하단 메뉴 안에서 화면 맞춤과 편집 전환을 제공하고 권한 없는 편집 전환은 숨긴다', () => {
  for (const canEdit of [false,true]) {
    const calls=[], tree=chrome().ReadingNavigation({index:1,count:3,canEdit,onFit:()=>calls.push('fit'),onToggle:()=>calls.push('edit')})
    assert.equal(tree.props.testID,'reading-bottom-menu')
    find(tree,n=>n.props?.label==='화면에 맞춤').props.onPress()
    const edit=find(tree,n=>n.props?.label==='편집 모드로 전환')
    assert.equal(Boolean(edit),canEdit)
    edit?.props.onPress()
    assert.deepEqual(calls,canEdit?['fit','edit']:['fit'])
  }
})

function timerClock() {
  let now=0, id=0
  const jobs=new Map()
  return {setTimer(fn,delay){jobs.set(++id,{fn,at:now+delay});return id},clearTimer(id){jobs.delete(id)},
    tick(ms){const end=now+ms;while(true){const next=[...jobs.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;jobs.delete(next[0]);next[1].fn()}now=end},size:()=>jobs.size}
}

test('짧게 누르면 한 장만 넘기고 길게 누르면 연속으로 넘긴 뒤 해제 시 추가하지 않는다', () => {
  const clock=timerClock(), calls=[]
  const repeat=pageRepeat.createPageRepeat(()=>{calls.push(calls.length+1);return calls.length<4},clock)
  repeat.start();clock.tick(349);repeat.release();repeat.press({gesture:true})
  assert.equal(calls.length,1)
  repeat.start();clock.tick(350+90*2);repeat.release();repeat.press({gesture:true});clock.tick(1000)
  assert.equal(calls.length,4)
  assert.equal(clock.size(),0)
})

test('페이지 끝·터치 취소·메뉴 해제에서 연속 넘김 타이머와 뒤늦은 클릭이 멈춘다', () => {
  for (const cancelBeforeFirst of [false,true]) {
    const clock=timerClock();let calls=0
    const repeat=pageRepeat.createPageRepeat(()=>{calls++;return calls<2},clock)
    repeat.start();clock.tick(cancelBeforeFirst?100:350);repeat.cancel();repeat.press({gesture:true});clock.tick(1000)
    assert.equal(calls,cancelBeforeFirst?0:1)
    assert.equal(clock.size(),0)
    repeat.start();clock.tick(1000)
    assert.equal(calls,2)
    assert.equal(clock.size(),0)
  }
})

test('실제 페이지 버튼은 배경 전환·unmount에서 반복을 정리하고 DOM API 없는 네이티브 window에서도 실행된다', t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000})
  const previous=globalThis.window, hadWindow=Object.hasOwn(globalThis,'window')
  globalThis.window={}
  try {
    const appListeners=[], cleanups=[], calls=[]
    const button=chrome({effects:true,appListeners,cleanups}).PageTurnAction({direction:1,index:0,count:4,onSelect:i=>calls.push(i)})
    button.props.onPressIn();t.mock.timers.tick(350)
    assert.deepEqual(calls,[1])
    appListeners[0]('background');t.mock.timers.tick(1000);button.props.onPress({type:'responderRelease',nativeEvent:{identifier:1,touches:[]}})
    assert.deepEqual(calls,[1])
    button.props.onPressIn();t.mock.timers.tick(350)
    assert.deepEqual(calls,[1,2])
    cleanups.forEach(cleanup=>cleanup());t.mock.timers.tick(1000)
    assert.deepEqual(calls,[1,2])
    assert.equal(appListeners.length,0)
  } finally {if(hadWindow)globalThis.window=previous;else delete globalThis.window}
})

test('비활성·앱 비활성화 정리 후 첫 독립 접근성 활성화부터 한 장씩 이동한다', () => {
  const clock=timerClock();let calls=0
  const repeat=pageRepeat.createPageRepeat(()=>{calls++;return true},clock)
  repeat.cancel();repeat.press()
  assert.equal(calls,1)
  repeat.cancel();repeat.press()
  assert.equal(calls,2)
  assert.equal(clock.size(),0)
})

test('입력 출처는 네이티브 접근성 click·브라우저 비포인터 click과 터치·마우스·키보드를 구분한다', () => {
  for (const event of [undefined,{type:'click',nativeEvent:{target:1}},{nativeEvent:{type:'click',detail:0,pointerType:''}}]) {
    assert.equal(pageRepeat.isGesturePagePress(event),false)
  }
  for (const event of [{type:'responderRelease',nativeEvent:{identifier:0,touches:[]}},
    {nativeEvent:{pointerType:'mouse',detail:1}},{type:'click',nativeEvent:{detail:1}},
    {type:'keyup',nativeEvent:{key:' '}}]) {
    assert.equal(pageRepeat.isGesturePagePress(event),true)
  }
})

test('취소된 누름 직후 새 접근성 활성화는 처리하고 뒤늦은 터치 해제는 추가 이동하지 않는다', () => {
  for(const long of [false,true]) {
    const clock=timerClock();let calls=0
    const repeat=pageRepeat.createPageRepeat(()=>{calls++;return true},clock)
    repeat.start();clock.tick(long?350:100);repeat.cancel();repeat.press()
    assert.equal(calls,long?2:1)
    repeat.press({gesture:true});clock.tick(1000)
    assert.equal(calls,long?2:1)
    assert.equal(clock.size(),0)
  }
})

test('실제 버튼은 background 복귀 후 onPressIn 없는 접근성 활성화를 첫 회부터 처리한다', () => {
  const appListeners=[],cleanups=[],calls=[]
  const button=chrome({effects:true,appListeners,cleanups}).PageTurnAction({direction:1,index:0,count:4,onSelect:i=>calls.push(i)})
  appListeners[0]('background');appListeners[0]('active')
  button.props.onPress({type:'click',nativeEvent:{detail:0}})
  assert.deepEqual(calls,[1])
  button.props.onPress()
  assert.deepEqual(calls,[1,2])
  cleanups.forEach(cleanup=>cleanup())
})
