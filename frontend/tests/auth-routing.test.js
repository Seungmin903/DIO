import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
const code=babel.transformSync(readFileSync(new URL('../App.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
// useState 순서: previewSession · booting · loginRequest
function root(dev,mode,session=null,loginRequest=null){
 let calls=0
 const states=[session,true,loginRequest]
 const mod={exports:{}},mocks={react:{useState:()=>[states[calls++],()=>{}],useEffect(){},useCallback:f=>f,useRef:current=>({current})},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>{}},'react-native':{Platform:{OS:'web'},StatusBar:'StatusBar',View:'View',StyleSheet:{absoluteFill:{}}},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},'expo-font':{useFonts:()=>[true,null]},'./src/shared/pretendardFiles':{PRETENDARD_FILES:{}},'./src/diary/styles':{styles:{}},'./src/shared/useHiddenNavigationBar':{useHiddenNavigationBar(){}}}
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
  }, './photoUpload': { buildPhotoBody() {} }, 'expo/fetch': { fetch() {} },
   './developmentAccessStore': { createDevelopmentAccessStore: () => { stores++; return 'store'; } } }
  let stores = 0
  new Function('require', 'module', 'exports', '__DEV__', 'process', source)(id => mocks[id], mod, mod.exports, dev,
   { env: { EXPO_PUBLIC_API_BASE_URL: 'https://server.example', EXPO_PUBLIC_AUTH_TOKEN_HEADER: 'X-DIO-Access-Token' } })
  assert.equal(mod.exports.authService.baseUrl, mod.exports.apiBaseUrl)
  assert.equal(mod.exports.authService.accessTokenHeader, mod.exports.accessTokenHeader)
  assert.equal(mod.exports.accessTokenHeader, 'X-DIO-Access-Token')
  assert.equal(mod.exports.authService.allowDevelopmentAccess, dev)
  // 운영 빌드는 저장된 개발 서버 접속 정보를 만들지도 읽지도 않는다.
  assert.equal(mod.exports.authService.developmentAccessStore, dev ? 'store' : null)
  assert.equal(stores, dev ? 1 : 0)
 }
})
test('처음에는 게스트 보관함으로 시작하고, 로그인 화면은 필요한 기능에서만 뜬다',()=>{
 // 게스트 세션을 만드는 짧은 시작 구간에도 로그인 화면을 강제로 띄우지 않는다.
 assert.equal(has(root(true,undefined),'./src/auth/AuthScreen'),false)
 const guest={nickname:'소연',mode:'guest'}
 assert.equal(has(root(true,undefined,guest),'./src/auth/AuthScreen'),false)
 // 로그인이 필요한 기능에서 연 경우: 지금 화면(보관함)은 그대로 두고 로그인 화면을 위에 겹친다.
 const asked=root(true,undefined,guest,{feature:'사진 속 대상 오리기',action(){}}),auth=nodes(asked).find(n=>n.type==='./src/auth/AuthScreen')
 assert.ok(auth);assert.ok(has(asked,'LocalDiaryApp'))
 assert.equal(auth.props.onDeveloperBypass,undefined);assert.equal(typeof auth.props.onClose,'function')
 // 게스트는 로그인 필요한 기능을 열 수 없고, 실제 로그인 세션만 통과한다.
 const gate=session=>nodes(root(true,undefined,session)).find(n=>n.props?.onLogin)
 assert.equal(gate(guest).props.authenticated,false);assert.equal(gate({mode:'authenticated',userId:'1'}).props.authenticated,true)
})
test('게스트는 로컬 보관함이고 실제 로그인만 회원 API로 진입한다',()=>{
 const tree=root(true,undefined,{nickname:'소연',mode:'guest'}),diary=nodes(tree).find(n=>n.type?.name==='LocalDiaryApp')
 assert.equal(diary.props.previewUser.nickname,'소연');assert.equal(typeof diary.props.onEndPreview,'function')
 assert.ok(has(root(false,undefined,{mode:'registered',userId:'1'}),'LocalDiaryApp'))
 const member=root(false,undefined,{mode:'authenticated',userId:'1'})
 assert.ok(has(member,'MemberDiaryApp'));assert.equal(has(member,'LocalDiaryApp'),false)
 assert.equal(nodes(member).find(n=>n.type?.name==='MemberDiaryApp').key,'authenticated:1')
})
test('앱 시작 흐름은 개발자 선택 화면이나 개발 전용 목 보관함을 불러오지 않는다',()=>{
 const source=readFileSync(new URL('../App.js',import.meta.url),'utf8')
 assert.equal(source.includes('./src/dev/StartModeScreen'),false)
 assert.equal(source.includes('./src/diary/screens/ConnectedDiaryLibrary'),false)
 assert.equal(source.includes('./src/diary/screens/MockLibraryApp'),false)
})
