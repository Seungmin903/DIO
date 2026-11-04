import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
const code=babel.transformSync(readFileSync(new URL('../App.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
// useState 순서: previewSession · booting · loginRequest
// probe 를 주면 useEffect 를 모아 두고 네이티브 시작 화면을 내린 횟수(hidden) · 예전 예시 다이어리 정리 횟수(cleaned)를 센다
function root(dev,mode,session=null,loginRequest=null,probe=null){
 let calls=0
 const states=[session,true,loginRequest]
 const mod={exports:{}},mocks={react:{useState:()=>[states[calls++],()=>{}],useEffect(fn){probe?.effects.push(fn)},useCallback:f=>f,useRef:current=>({current})},'./src/auth/guestProfileDevice':{guestProfile:{start:async session=>session}},'./src/diary/services/legacyMockCleanup':{clearMockLibrary:async()=>{if(probe)probe.cleaned=(probe.cleaned||0)+1}},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>{if(probe)probe.hidden++}},'react-native':{Platform:{OS:'web'},StatusBar:'StatusBar',View:'View',Text:'Text',StyleSheet:{absoluteFill:{},create:value=>value}},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},'expo-font':{useFonts:()=>[true,null]},'./src/shared/pretendardFiles':{PRETENDARD_FILES:{}},'./src/diary/styles':{styles:{}},'./src/shared/useHiddenNavigationBar':{useHiddenNavigationBar(){}}}
 new Function('require','module','exports','__DEV__','process',code)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),mod,mod.exports,dev,{env:{EXPO_PUBLIC_DIARY_SOURCE:mode}})
 return mod.exports.default()
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
const has=(tree,name)=>nodes(tree).some(n=>n.type===name||n.type?.name===name)

test('authService 모듈은 공용 주소·헤더를 선언한 뒤 생성 인자로 전달하고 운영 개발접속을 끈다', () => {
 const source = babel.transformSync(readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
 }).code
 for (const dev of [true, false]) {
  const mod = { exports: {} }
  const mocks = { 'react-native': { Platform: { OS: 'android' } }, './authApi': {
   authBaseUrl: value => `${value}/api/v1`, createAuthApi: options => options,
  }, './photoUpload': { buildPhotoBody() {} }, './googleLogin': { signInWithGoogle() {} }, './appleLogin': { signInWithApple() {} }, './appleLogin': { signInWithApple() {} }, 'expo/fetch': { fetch() {} },
   './developmentAccessStore': { createDevelopmentAccessStore: options => { stores++; storeOptions = options; return 'store'; } },
   './legacyAccessKeychain': { legacyAccessKeychain: 'keychain' } }
  let stores = 0, storeOptions = null
  new Function('require', 'module', 'exports', '__DEV__', 'process', source)(id => mocks[id], mod, mod.exports, dev,
   { env: { EXPO_PUBLIC_API_BASE_URL: 'https://server.example', EXPO_PUBLIC_AUTH_TOKEN_HEADER: 'X-DIO-Access-Token' } })
  assert.equal(mod.exports.authService.baseUrl, mod.exports.apiBaseUrl)
  assert.equal(mod.exports.authService.accessTokenHeader, mod.exports.accessTokenHeader)
  assert.equal(mod.exports.accessTokenHeader, 'X-DIO-Access-Token')
  assert.equal(mod.exports.authService.allowDevelopmentAccess, dev)
  // 운영 빌드는 저장된 개발 서버 접속 정보를 만들지도 읽지도 않는다.
  assert.equal(mod.exports.authService.developmentAccessStore, dev ? 'store' : null)
  assert.equal(stores, dev ? 1 : 0)
  // 개발 빌드는 예전 빌드가 남긴 Keychain 접속 정보를 지울 수 있게 보안 저장소를 넘긴다
  assert.deepEqual(storeOptions, dev ? { platform: 'android', legacyKeychain: 'keychain' } : null)
 }
})
test('API 주소가 없는 정적 웹 번들도 모듈 로드 단계에서 중단되지 않는다', () => {
 const source = babel.transformSync(readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
 }).code
 const mod = { exports: {} }
 const mocks = { 'react-native': { Platform: { OS: 'web' } }, './authApi': { authBaseUrl: value => value, createAuthApi: options => options },
  './photoUpload': { buildPhotoBody() {} }, './googleLogin': { signInWithGoogle() {} }, './appleLogin': { signInWithApple() {} },
  './developmentAccessStore': { createDevelopmentAccessStore() {} }, './legacyAccessKeychain': { legacyAccessKeychain: 'keychain' }, 'expo/fetch': { fetch() {} } }
 new Function('require', 'module', 'exports', '__DEV__', 'process', source)(id => mocks[id], mod, mod.exports, false, { env: {} })
 assert.equal(mod.exports.apiConfigurationError, false)
 assert.equal(mod.exports.apiBaseUrl, 'http://localhost:8080/api')
})
test('API 주소가 없는 네이티브 릴리스는 시작 설정 오류로 분기한다', () => {
 const source = babel.transformSync(readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
 }).code
 const mod = { exports: {} }
 const mocks = { 'react-native': { Platform: { OS: 'android' } }, './authApi': { authBaseUrl: value => value, createAuthApi: options => options },
  './photoUpload': { buildPhotoBody() {} }, './googleLogin': { signInWithGoogle() {} }, './appleLogin': { signInWithApple() {} },
  './developmentAccessStore': { createDevelopmentAccessStore() {} }, './legacyAccessKeychain': { legacyAccessKeychain: 'keychain' }, 'expo/fetch': { fetch() {} } }
 new Function('require', 'module', 'exports', '__DEV__', 'process', source)(id => mocks[id], mod, mod.exports, false, { env: {} })
 assert.equal(mod.exports.apiConfigurationError, true)
})
test('배포 EAS 프로필은 HTTPS 운영 API 주소를 번들에 주입한다', () => {
 const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'))
 for (const [profile, origin] of [['preview', 'https://k15f106.p.ssafy.io:8444'], ['production', 'https://k15f106.p.ssafy.io']]) {
  const url = eas.build[profile].env.EXPO_PUBLIC_API_BASE_URL
  assert.equal(new URL(url).protocol, 'https:')
  assert.notEqual(new URL(url).hostname, '10.0.2.2')
  assert.equal(new URL(url).origin, origin)
 }
})
test('처음 실행은 고르는 화면 없이 게스트로 시작하고, 로그인 화면은 로그인이 필요한 기능에서만 뜬다',()=>{
 // 세션을 만드는 동안은 로그인 화면을 그리지 않는다(게스트로 곧바로 시작)
 assert.equal(has(root(true,undefined),'./src/auth/AuthScreen'),false)
 assert.equal(has(root(false,'mock'),'./src/auth/AuthScreen'),false)
 const guest={nickname:'소연',mode:'guest'}
 assert.equal(has(root(true,undefined,guest),'./src/auth/AuthScreen'),false)
 // 로그인이 필요한 기능에서 연 경우: 지금 화면(보관함)은 그대로 두고 로그인 화면을 위에 겹친다. 나중에가 있다
 const asked=root(true,undefined,guest,{feature:'사진 속 대상 오리기',action(){}}),auth=nodes(asked).find(n=>n.type==='./src/auth/AuthScreen')
 assert.ok(auth);assert.ok(has(asked,'LocalDiaryApp'))
 assert.equal(typeof auth.props.onClose,'function')
 // 게스트는 로그인이 필요한 기능이 막혀 있다
 const gate=session=>nodes(root(true,undefined,session)).find(n=>n.props?.onLogin)
 assert.equal(gate(guest).props.authenticated,false)
})
test('게스트·체험은 로컬 보관함이고 실제 로그인만 회원 API로 진입한다',()=>{
 const tree=root(true,undefined,{nickname:'소연',mode:'guest'}),diary=nodes(tree).find(n=>n.type?.name==='LocalDiaryApp')
 assert.equal(diary.props.previewUser.nickname,'소연');assert.equal(typeof diary.props.onEndPreview,'function')
 assert.ok(has(root(false,undefined,{mode:'registered',userId:'1'}),'LocalDiaryApp'))
 const member=root(false,undefined,{mode:'authenticated',userId:'1'})
 assert.ok(has(member,'MemberDiaryApp'));assert.equal(has(member,'LocalDiaryApp'),false)
 assert.equal(nodes(member).find(n=>n.type?.name==='MemberDiaryApp').key,'authenticated:1')
})
test('개발 전용 보관함 목 모드는 기존 경로를 유지한다',()=>{
 assert.ok(has(root(true,'mock'),'./src/diary/screens/ConnectedDiaryLibrary'))
 assert.ok(has(root(true,'mock-library'),'./src/diary/screens/MockLibraryApp'))
})

test('부팅 중 첫 화면에 BootSplash 를 그리고, 그린 뒤에야 네이티브 시작 화면을 내린다',()=>{
 const probe={effects:[],hidden:0}
 const first=root(false,undefined,null,null,probe)
 // 로고는 BootSplash 가 그린다(안드로이드 네이티브 시작 화면은 바탕색만). 첫 렌더에 빠지면 로고 없는 빈 화면이 보인다
 assert.ok(has(first,'./src/shared/BootSplash'))
 assert.equal(probe.hidden,0,'렌더 중에는 내리지 않는다')
 // 다른 마운트 효과(8초 안전 타이머 등)는 실행만 하고 타이머는 걸지 않는다
 const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0
 try{for(const effect of probe.effects){try{effect()}catch{}}}finally{globalThis.setTimeout=timer}
 assert.ok(probe.hidden>=1,'첫 화면이 그려진 뒤(마운트 효과) 네이티브 시작 화면을 내린다')
})

test('목업 판정은 따로 그리는 세 화면(mock · mock-library · mock-sharing)만: 다른 mock* 값은 게스트로 시작하고, 개발 빌드의 게스트 시작마다 예전 예시 다이어리를 정리한다',async()=>{
 for(const [dev,mode,cleans] of [[true,'mock',false],[true,'mock-library',false],[true,'mock-sharing',false],[true,'mock-other',true],[true,undefined,true],[false,undefined,false]]){
  const probe={effects:[],hidden:0,cleaned:0}
  root(dev,mode,null,null,probe)
  const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0
  try{for(const effect of probe.effects){try{effect()}catch{}}}finally{globalThis.setTimeout=timer}
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(probe.cleaned>0,cleans,`${dev?'개발':'운영'} ${mode}`)
 }
})
test('내 공간의 로그인 · 회원가입처럼 기능 없이 연 로그인 요청({})도 지금 화면 위에 로그인 화면을 띄우고 닫을 수 있다',()=>{
 const guest={mode:'preview',provider:'guest',nickname:'방문자'}
 const tree=root(false,undefined,guest,{}),auth=nodes(tree).find(n=>n.type==='./src/auth/AuthScreen')
 assert.ok(auth);assert.ok(has(tree,'LocalDiaryApp'))
 assert.equal(typeof auth.props.onClose,'function');assert.equal(typeof auth.props.onContinue,'function')
})
