import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as validation from '../src/auth/validation.js'
import test from 'node:test'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
const code=babel.transformSync(readFileSync(new URL('../src/auth/AuthScreen.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
function setup(service,photoPicker){
 const states=[],refs=[],deps=[],cleanups=[],keyboard={};let si=0,ri=0,ei=0,back
 const react={useState:initial=>{const i=si++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useRef:initial=>refs[ri++]??={current:initial},useEffect:(fn,next)=>{const i=ei++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){cleanups[i]?.();deps[i]=next;cleanups[i]=fn()}}}
 const native={Keyboard:{dismiss(){},addListener:(name,fn)=>{keyboard[name]=fn;return{remove(){delete keyboard[name]}}}},Platform:{OS:'android'},BackHandler:{addEventListener:(_,fn)=>{back=fn;return{remove(){}}}}};for(const name of ['ActivityIndicator','KeyboardAvoidingView','Pressable','ScrollView','Text','TextInput','View'])native[name]=name
 const mocks={react,'react-native':native,'react-native-safe-area-context':{SafeAreaView:'safe'},'../shared/useFormFactor':{useFormFactor:()=>({isPhone:false,formFactor:'tablet'})},'../shared/useOrientationLock':{useOrientationLock(){}},'./previewAuth':{previewAuth:service},'./validation':validation,'./styles':{authStyles:new Proxy({},{get:(_,key)=>key})},'../shared/theme':{colors:{}}}
 const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),mod,mod.exports)
 const sessions=[],render=()=>{si=ri=ei=0;return mod.exports.default({service,onContinue:session=>sessions.push(session),photoPicker})}
 return{render,sessions,keyboard,back:()=>back(),unmount:()=>cleanups.forEach(fn=>fn?.())}
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
const find=(tree,label)=>nodes(tree).find(n=>n.props.accessibilityLabel===label||n.props.label===label)
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('닉네임 변경 후 늦은 중복 확인 응답을 무시하고 완료 버튼을 잠근다',async()=>{
 let resolveCheck;const service={social:async()=>({provider:'kakao'}),checkNickname:()=>new Promise(r=>resolveCheck=r)}
 const ui=setup(service);find(ui.render(),'카카오로 로그인').props.onPress();await tick()
 let tree=ui.render();find(tree,'닉네임').props.onChange('소연');tree=ui.render();find(tree,'닉네임 중복 확인').props.onPress();find(ui.render(),'닉네임').props.onChange('다른이름');resolveCheck(true);await tick();tree=ui.render();assert.ok(find(tree,'가입 완료').props.disabled);assert.ok(!nodes(tree).some(n=>n.props.children==='사용할 수 있는 닉네임이에요.'));ui.unmount()
})
test('중복 제출을 막고 Android 뒤로가기 후 늦은 진입 응답을 무시한다',async()=>{
 let resolveSocial,calls=0;const ui=setup({social:()=>{calls++;return new Promise(r=>resolveSocial=r)}})
 const button=find(ui.render(),'카카오로 로그인');button.props.onPress();button.props.onPress();assert.equal(calls,1)
 find(ui.render(),'회원가입').props.onPress();ui.render();assert.equal(ui.back(),true);ui.render();resolveSocial({provider:'kakao'});await tick();assert.ok(find(ui.render(),'로그인'));assert.equal(ui.back(),false);assert.deepEqual(ui.sessions,[]);ui.unmount()
})

test('키보드가 열린 뒤 입력칸 위치를 재측정하고 가려진 만큼 스크롤한다',async()=>{
 const ui=setup({}),tree=ui.render(),moves=[]
 const scroll=nodes(tree).find(n=>n.type==='ScrollView')
 scroll.props.ref.current={measureInWindow:fn=>fn(0,0,390,300),scrollTo:value=>moves.push(value)}
 find(tree,'비밀번호').props.onInputFocus({measureInWindow:fn=>fn(24,350,300,48)})
 ui.keyboard.keyboardDidShow({endCoordinates:{screenY:300}})
 await new Promise(resolve=>setTimeout(resolve,120))
 assert.deepEqual(moves,[{y:114,animated:true}])
 find(tree,'이메일').props.onInputFocus({measureInWindow:fn=>fn(24,100,300,48)})
 await new Promise(resolve=>setTimeout(resolve,120))
 assert.equal(moves.length,1)
 ui.unmount();assert.deepEqual(ui.keyboard,{})
})

test('로그인 오류는 버튼 위에 표시하고 입력 수정 또는 5초 경과 시 해제한다',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const ui=setup({login:async()=>{throw new Error('이메일 또는 비밀번호가 맞지 않아요.')}})
 const fill=()=>{find(ui.render(),'이메일').props.onChange('wrong@example.com');find(ui.render(),'비밀번호').props.onChange('Wrong1234')}
 fill();find(ui.render(),'로그인').props.onPress();await tick()
 let tree=ui.render(),all=nodes(tree),alert=all.find(n=>n.props.accessibilityRole==='alert')
 assert.ok(alert);assert.ok(all.indexOf(alert)<all.indexOf(find(tree,'로그인')))
 find(tree,'이메일').props.onChange('other@example.com');assert.ok(!nodes(ui.render()).some(n=>n.props.accessibilityRole==='alert'))
 find(ui.render(),'로그인').props.onPress();await tick();ui.render()
 t.mock.timers.tick(5000)
 assert.ok(!nodes(ui.render()).some(n=>n.props.accessibilityRole==='alert'))
 ui.unmount()
})

test('프로필 사진 선택·취소·삭제를 처리한다',async()=>{
 const results=['file:///profile.jpg',null]
 const ui=setup({social:async()=>({provider:'kakao'})},async()=>results.shift())
 find(ui.render(),'카카오로 로그인').props.onPress();await tick()
 find(ui.render(),'프로필 사진 선택').props.onPress();await tick()
 assert.equal(find(ui.render(),'선택한 프로필 사진').props.source.uri,'file:///profile.jpg')
 find(ui.render(),'프로필 사진 선택').props.onPress();await tick()
 assert.equal(find(ui.render(),'선택한 프로필 사진').props.source.uri,'file:///profile.jpg')
 find(ui.render(),'프로필 사진 삭제').props.onPress()
 assert.equal(find(ui.render(),'선택한 프로필 사진'),undefined)
 ui.unmount()
})

test('회원가입 진입 시 입력·오류·스크롤을 초기화한다',()=>{
 const ui=setup({}),moves=[],tree=ui.render()
 nodes(tree).find(n=>n.type==='ScrollView').props.ref.current={scrollTo:value=>moves.push(value)}
 find(tree,'이메일').props.onChange('mistake@example.com');find(ui.render(),'비밀번호').props.onChange('Password123')
 find(ui.render(),'회원가입').props.onPress()
 for(const label of ['이메일','비밀번호','비밀번호 확인'])assert.equal(find(ui.render(),label).props.value,'')
 assert.deepEqual(moves,[{y:0,animated:false}]);ui.unmount()
})
test('중복 확인은 연타를 막고 재확인 중에는 가입을 막는다',async()=>{
 let resolveCheck,calls=0
 const ui=setup({social:async()=>({provider:'kakao'}),checkNickname:()=>{calls++;return new Promise(r=>resolveCheck=r)}})
 find(ui.render(),'카카오로 로그인').props.onPress();await tick();find(ui.render(),'닉네임').props.onChange('소연')
 let control=find(ui.render(),'닉네임 중복 확인');control.props.onPress();control.props.onPress();assert.equal(calls,1)
 resolveCheck(true);await tick();find(ui.render(),'전체 동의').props.onPress();assert.ok(!find(ui.render(),'가입 완료').props.disabled)
 find(ui.render(),'닉네임 중복 확인').props.onPress();assert.ok(find(ui.render(),'가입 완료').props.disabled)
 resolveCheck(true);await tick();ui.unmount()
})
test('사진 선택 도중 화면을 떠나면 늦은 결과를 적용하지 않는다',async()=>{
 let resolvePhoto
 const ui=setup({social:async()=>({provider:'kakao'})},()=>new Promise(r=>resolvePhoto=r))
 find(ui.render(),'카카오로 로그인').props.onPress();await tick();find(ui.render(),'프로필 사진 선택').props.onPress()
 ui.render();ui.back();resolvePhoto('file:///late.jpg');await tick()
 assert.ok(find(ui.render(),'로그인'));assert.equal(find(ui.render(),'선택한 프로필 사진'),undefined);ui.unmount()
})

test('이메일 가입 완료 후 자동 로그인하지 않고 이메일만 채운 로그인 화면으로 돌아간다',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const ui=setup({signup:async()=>({provider:'email',email:'new@example.com'}),checkNickname:async()=>true,completeProfile:async value=>({...value,mode:'preview'})})
 find(ui.render(),'회원가입').props.onPress()
 find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
 find(ui.render(),'다음').props.onPress();await tick();find(ui.render(),'닉네임').props.onChange('소연')
 find(ui.render(),'닉네임 중복 확인').props.onPress();await tick();find(ui.render(),'전체 동의').props.onPress()
 find(ui.render(),'가입 완료').props.onPress();await tick()
 const tree=ui.render();assert.ok(find(tree,'로그인'));assert.equal(find(tree,'이메일').props.value,'new@example.com');assert.equal(find(tree,'비밀번호').props.value,'');assert.deepEqual(ui.sessions,[]);const notice=nodes(tree).find(n=>n.props.children==='가입이 완료됐어요.');assert.equal(notice.props.accessibilityRole,'text');t.mock.timers.tick(2500);assert.ok(!nodes(ui.render()).some(n=>n.props.children==='가입이 완료됐어요.'));ui.unmount()
})

test('인증 화면의 접근성 역할은 설치된 React Native 네이티브 지원 값만 사용한다',()=>{
 const header=readFileSync(new URL('../node_modules/react-native/ReactCommon/react/renderer/components/view/AccessibilityPrimitives.h',import.meta.url),'utf8')
 const body=header.match(/enum class AccessibilityRole[^\{]*\{([\s\S]*?)\};/)[1]
 const supported=new Set(body.split(',').map(value=>value.trim().toLowerCase()))
 const visit=node=>{
  if(!node||typeof node!=='object')return
  if(node.type==='JSXAttribute'&&node.name?.name==='accessibilityRole'&&node.value?.type==='StringLiteral')assert.ok(supported.has(node.value.value.toLowerCase()),`네이티브 미지원 역할: ${node.value.value}`)
  for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}
 }
 for(const path of ['../src/auth/AuthScreen.js','../src/diary/screens/ProfileScreen.js'])visit(babel.parseSync(readFileSync(new URL(path,import.meta.url),'utf8'),{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}}))
})
