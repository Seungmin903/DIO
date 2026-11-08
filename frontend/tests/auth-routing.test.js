import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as apiBaseUrlPolicy from '../src/shared/apiBaseUrlPolicy.js'
import {createAuthApi} from '../src/auth/authApi.js'
import * as sessionExpiry from '../src/auth/sessionExpiry.js'
import * as routeMemory from '../src/diary/utils/routeMemory.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
const code=babel.transformSync(readFileSync(new URL('../App.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
// useState 순서: previewSession · booting · loginRequest
// probe 를 주면 useEffect 를 모아 두고 네이티브 시작 화면을 내린 횟수(hidden) · 예전 예시 다이어리 정리 횟수(cleaned)를 센다
function root(dev,mode,session=null,loginRequest=null,probe=null,apiConfigurationError=false){
 let calls=0
 const states=[session,probe?.booting??false,loginRequest,probe?.restoreState??{status:'loading',error:null},null,probe?.mailInvitation]
 const mod={exports:{}},mocks={'./src/diary/utils/routeMemory':routeMemory,'./src/shared/dialogs':{notify:(...args)=>probe?.notices?.push(args)},'./src/editor/utils/savePdfFile':{cleanupPdfShareCache:async()=>{}},'./src/auth/authService':{apiConfigurationError,authService:{logout:async()=>{if(probe?.logoutError)throw probe.logoutError},restoreSession:async()=>{if(probe?.restoreMock)return probe.restoreMock();if(probe?.restoreError)throw probe.restoreError;return probe?.restored??null}}},react:{useState:()=>{const index=calls++;return [states[index],value=>probe?.updates?.push({index,value})]},useEffect(fn){probe?.effects.push(fn)},useCallback:f=>f,useRef:current=>({current})},'./src/auth/guestProfileDevice':{guestProfile:{start:async session=>{if(probe)probe.guestStarts=(probe.guestStarts||0)+1;return session}}},'./src/diary/services/legacyMockCleanup':{clearMockLibrary:async()=>{if(probe)probe.cleaned=(probe.cleaned||0)+1}},'expo-splash-screen':{preventAutoHideAsync:async()=>{},hideAsync:async()=>{if(probe)probe.hidden++}},'react-native':{Platform:{OS:'web'},StatusBar:'StatusBar',View:'View',Text:'Text',StyleSheet:{absoluteFill:{},create:value=>value}},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},'expo-font':{useFonts:()=>[true,null]},'./src/shared/pretendardFiles':{PRETENDARD_FILES:{}},'./src/editor/services/textFonts':{preloadTextFonts(){}},'./src/shared/remoteAssets/remoteCatalogService':{loadRemoteCatalog(){}},'./src/diary/styles':{styles:{empty:{},emptyTitle:{},emptyCopy:{}}},'./src/shared/useHiddenNavigationBar':{useHiddenNavigationBar(){}}}
 mocks['expo-font']={useFonts:()=>[probe?.fontsLoaded??true,null]};
 mocks['react-native'].Platform.OS=probe?.platform??'web';
 mocks['./src/sharing/memberInviteLink']={subscribeMemberInviteLinks(_linking,onInvite){
  if(probe)probe.receiveMailInvite=onInvite;
  return ()=>{};
 }};
 mocks['./src/editor/utils/common']={setUuidGenerator(){}};
 mocks['./src/shared/BootSplash']={__esModule:true,default:'./src/shared/BootSplash',SPLASH:{backgroundColor:'#F0ECFD'}};
 Object.assign(mocks['./src/auth/authService'].authService, {
  getSessionKey:()=>probe?.sessionKey??null,
  getMemberSessionKey:userId=>probe?.memberSessionKey??`${userId}:1`,
  subscribeSessionExpired(listener){if(probe)probe.expireSession=listener;return()=>{if(probe)probe.expireSession=null}},
 });
 let refIndex=0;
 mocks.react.useRef=initial=>{
  if(!probe)return {current:initial};
  const refs=probe.refs??=[];
  return refs[refIndex++]??= {current:initial};
 };
 mocks.react.useState=()=>{
  const index=calls++;
  return [states[index],value=>{
   const next=typeof value==='function'?value(states[index]):value;
   states[index]=next;probe?.updates?.push({index,value:next});
  }];
 };
 mocks['./src/auth/guestProfileDevice'].guestProfile.start=async session=>{if(probe)probe.guestStarts=(probe.guestStarts||0)+1;return probe?.guestStart?probe.guestStart(session):session};
 new Function('require','module','exports','__DEV__','process',code)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),mod,mod.exports,dev,{env:{EXPO_PUBLIC_DIARY_SOURCE:mode}})
 return mod.exports.default()
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]

test('메일 초대는 게스트 로그인으로 이어지고 계정을 바꿔도 같은 초대 ID를 전달한다',async()=>{
 const invitation={inviteId:'123'};
 const guest={mode:'preview',provider:'guest'};
 const probe={effects:[],updates:[],mailInvitation:invitation,restoreState:{status:'done',error:null}};
 root(false,undefined,guest,null,probe);
 const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0;
 let cleanups;
 try{cleanups=probe.effects.map(effect=>effect())}finally{globalThis.setTimeout=timer}
 assert.ok(probe.updates.some(update=>update.index===2&&update.value));
 for(const cleanup of cleanups)if(typeof cleanup==='function')cleanup();

 const first={mode:'authenticated',userId:'7'};
 const signedIn={...probe,effects:[],updates:[],refs:[],sessionKey:'7:1'};
 const app=nodes(root(false,undefined,first,null,signedIn)).find(node=>node.props?.onSwitchInvitationAccount);
 assert.deepEqual(app.props.mailInvitation,invitation);
 app.props.onConsumeMailInvitation(invitation);
 signedIn.sessionKey=null;
 await app.props.onSwitchInvitationAccount(invitation.inviteId);
 assert.ok(signedIn.updates.some(update=>update.index===2&&update.value));
 assert.deepEqual(signedIn.updates.at(-1).value,invitation);
 const next={...signedIn,refs:[],sessionKey:'8:1',mailInvitation:signedIn.updates.at(-1).value};
 const nextApp=nodes(root(false,undefined,{mode:'authenticated',userId:'8'},null,next))
  .find(node=>node.props?.onSwitchInvitationAccount);
 assert.deepEqual(nextApp.props.mailInvitation,invitation);
});

async function failStartup(error) {
 const probe={effects:[],updates:[],hidden:0,restoreError:error,booting:true};
 root(false,undefined,null,null,probe);
 const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0;
 let cleanups;
 try{cleanups=probe.effects.map(fn=>fn())}finally{globalThis.setTimeout=timer}
 await new Promise(resolve=>setImmediate(resolve));
 probe.restoreState=probe.updates.filter(update=>update.index===3).at(-1).value;
 const before=nodes(root(false,undefined,null,null,probe));
 assert.ok(!before.some(node=>node.type==='./src/auth/SessionRestoreScreen'));
 before.find(node=>node.type==='./src/shared/BootSplash').props.onComplete();
 assert.ok(probe.updates.some(update=>update.index===1&&update.value===false));
 probe.booting=false;
 const screen=nodes(root(false,undefined,null,null,probe)).find(node=>node.type==='./src/auth/SessionRestoreScreen');
 return {probe,screen,cleanup:()=>cleanups.forEach(fn=>{if(typeof fn==='function')fn()})};
}

test('F-02: 복원 중 네트워크·503·저장소 오류는 게스트를 시작하지 않고 복구 화면을 표시한다',async()=>{
 for(const error of [{code:'NETWORK_ERROR'},{status:503},{code:'SECURE_STORE_UNAVAILABLE'}]){
  const {probe,screen,cleanup}=await failStartup(error);
  try{
   assert.equal(probe.guestStarts??0,0);assert.ok(screen);assert.equal(screen.props.error,error);
   assert.equal(screen.props.busy,false);
   assert.equal(has(root(false,undefined,null,null,probe),'./src/shared/BootSplash'),false);
   assert.ok(probe.hidden>0);
  }finally{cleanup()}
 }
});

test('F-02: 연결 재시도는 중복 요청을 막고 성공하면 게스트 초기화 없이 회원으로 복귀한다',async()=>{
 const {probe,screen,cleanup}=await failStartup({code:'NETWORK_ERROR'});
 try{
  let finish,calls=0;
  probe.restoreMock=()=>{calls++;return new Promise(resolve=>{finish=resolve})};
  const first=screen.props.onRetry(),second=screen.props.onRetry();
  assert.equal(calls,1);
  const member={mode:'authenticated',userId:'7',email:'member@example.com'};
  finish(member);await Promise.all([first,second]);
  assert.equal(probe.guestStarts??0,0);
  assert.equal(probe.updates.find(update=>update.index===0)?.value,member);
  assert.deepEqual(probe.updates.filter(update=>update.index===3).at(-1).value,{status:'done',error:null});
 }finally{cleanup()}
});

test('F-02: 실패한 재시도는 복구 화면을 유지하고 로그인 취소도 자동 게스트 전환하지 않는다',async()=>{
 const {probe,screen,cleanup}=await failStartup({status:503});
 try{
  await screen.props.onRetry();
  assert.equal(probe.guestStarts??0,0);
  assert.equal(probe.updates.filter(update=>update.index===3).at(-1).value.status,'error');
  screen.props.onLogin();
  const request=probe.updates.filter(update=>update.index===2).at(-1).value;
  const auth=nodes(root(false,undefined,null,request,probe)).find(node=>node.type==='./src/auth/AuthScreen');
  auth.props.onClose();
  assert.equal(probe.guestStarts??0,0);
  assert.ok(nodes(root(false,undefined,null,null,probe)).some(node=>node.type==='./src/auth/SessionRestoreScreen'));
 }finally{cleanup()}
});

test('F-02: 게스트로 계속을 명시적으로 선택할 때만 게스트 보관함을 연다',async()=>{
 const {probe,screen,cleanup}=await failStartup({code:'NETWORK_ERROR'});
 try{
  await screen.props.onGuest();
  assert.equal(probe.guestStarts,1);
  assert.equal(probe.updates.find(update=>update.index===0)?.value.provider,'guest');
 }finally{cleanup()}
});

test('F-02: 화면 이탈 뒤 끝난 복원 요청은 회원 화면을 다시 열지 않는다',async()=>{
 const {probe,screen,cleanup}=await failStartup({code:'NETWORK_ERROR'});
 let finish;
 probe.restoreMock=()=>new Promise(resolve=>{finish=resolve});
 const retry=screen.props.onRetry();cleanup();
 finish({mode:'authenticated',userId:'7'});await retry;
 assert.equal(probe.updates.some(update=>update.index===0),false);
});
const has=(tree,name)=>nodes(tree).some(n=>n.type===name||n.type?.name===name)

test('회원 목록·일괄 작업·휴지통은 일반 401을 만료로 표시하지 않고 실제 만료 표식만 구분한다',()=>{
 const render=(file,props)=>{
  const source=babel.transformSync(readFileSync(new URL(`../src/diary/components/${file}.js`,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
  const mod={exports:{}},mocks={'react-native':{View:'View',Text:'Text',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator'},'../styles':{styles:{}},'../constants':{C:{}},'../../auth/sessionExpiry.js':sessionExpiry};
  mocks['../../auth/AuthenticationRecovery']={__esModule:true,default:'AuthenticationRecovery',needsAuthenticationRecovery:error=>error?.status===401&&error.code!=='DEVELOPMENT_ACCESS_REQUIRED'};
  new Function('require','module','exports',source)(id=>id==='react/jsx-runtime'?require(id):mocks[id],mod,mod.exports);
  return nodes(mod.exports.default(props)).filter(node=>node.props?.accessibilityRole==='alert').map(node=>node.props.children);
 };
 for(const sessionExpired of [false,true]){
  const error={status:401,code:'INVALID_TOKEN',sessionExpired,message:'임의 서버 문구'};
  const expected=sessionExpired?sessionExpiry.SESSION_EXPIRED_MESSAGE:sessionExpiry.AUTHENTICATION_FAILED_MESSAGE;
  assert.deepEqual(render('MemberLibraryNotice',{library:{error},bulk:null}),[expected]);
  assert.deepEqual(render('MemberLibraryNotice',{library:{},bulk:{ids:['1'],succeeded:[],failed:[{error}]}}),[expected]);
  assert.deepEqual(render('MemberTrashNotice',{state:{trashError:error}}),[expected]);
 }
});

test('인증 모듈의 로그인 세대로 만료 중 저장소를 유지하고 같은 계정 재로그인 시에만 교체한다',async()=>{
 const source=babel.transformSync(readFileSync(new URL('../src/diary/hooks/useMemberDiaries.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 let memo=null,made=0;
 const auth=createAuthApi({baseUrl:'https://api.example.test',fetchImpl:async url=>url.endsWith('/login')?
  new Response(JSON.stringify({user:{userId:'7',email:'member@example.com',nickname:'회원'},accessToken:'access',refreshToken:'refresh',expiresIn:900})):
  new Response(JSON.stringify({code:'INVALID_TOKEN'}),{status:401})});
 const login=()=>auth.login({email:'member@example.com',password:'Password123!'});
 await login();
 const mocks={
  react:{useEffect(){},useSyncExternalStore:(_,get)=>get(),useMemo(fn,deps){if(!memo||deps.some((value,index)=>value!==memo.deps[index]))memo={deps,value:fn()};return memo.value}},
  '../../auth/authService':{authService:auth},
  '../services/memberAppStore.js':{createMemberAppStore:()=>({serial:++made,getSnapshot:()=>({diaries:[],trash:[]})})},
  '../services/memberDiaryApi.js':{createMemberDiaryApi:()=>({})},
  '../services/memberTransport.js':{createAuthenticatedMemberTransport:()=>({})},
  '../../collaboration/canvasMedia.js':{createMediaRequest:()=>()=>{},createCanvasMedia:()=>({dispose(){}})},
 };
 const mod={exports:{}};
 new Function('require','module','exports',source)(id=>mocks[id]??{},mod,mod.exports);
 const before=mod.exports.useMemberDiaries('7').store;
 const identity=auth.getMemberSessionKey('7');
 await assert.rejects(auth.refresh(),{code:'INVALID_TOKEN'});
 assert.equal(auth.getSessionKey(),null);
 assert.equal(auth.getMemberSessionKey('7'),identity);
 assert.equal(mod.exports.useMemberDiaries('7').store,before);
 // Repeated or abandoned renders cannot mutate the auth service's identity.
 mod.exports.useMemberDiaries('7');
 assert.equal(auth.getMemberSessionKey('7'),identity);
 await login();
 assert.notEqual(auth.getMemberSessionKey('7'),identity);
 assert.notEqual(mod.exports.useMemberDiaries('7').store,before);
 assert.equal(made,2);
});

test('부팅 만료 후 게스트에서 로그인 화면을 닫아도 게스트 초기화를 반복하지 않는다',async()=>{
 for(const session of [null,{mode:'preview',provider:'guest'},{mode:'authenticated',userId:'7'}]){
  const probe={effects:[],updates:[]};
  const tree=root(false,undefined,session,{sessionExpired:true},probe);
  nodes(tree).find(node=>node.type==='./src/auth/AuthScreen').props.onClose();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(probe.guestStarts||0,session?.mode==='authenticated'?1:0);
  assert.equal(probe.updates.some(update=>update.index===0),session?.mode==='authenticated');
 }
});

test('실제 세션 만료만 기존 로그인 화면을 열고 구독 해제·계정 교체 뒤 이벤트는 무시한다',()=>{
 const member={mode:'authenticated',userId:'7'},probe={effects:[],updates:[],hidden:0};
 const tree=root(false,undefined,member,{sessionExpired:true},probe);
 const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0;
 let cleanups;
 try{cleanups=probe.effects.map(fn=>fn())}finally{globalThis.setTimeout=timer}
 probe.expireSession({userId:'8',sessionKey:'8:1'});
 assert.equal(probe.updates.some(update=>update.index===2),false);
 probe.sessionKey='7:new';
 probe.expireSession({userId:'7',sessionKey:'7:1'});
 assert.equal(probe.updates.some(update=>update.index===2),false);
 probe.sessionKey=null;
 probe.expireSession({userId:'7',sessionKey:'7:1'});
 assert.ok(probe.updates.some(update=>update.index===2&&update.value.sessionExpired));
 const renewed={mode:'authenticated',userId:'8'};
 probe.memberSessionKey='8:2';
 nodes(tree).find(node=>node.type==='./src/auth/AuthScreen').props.onContinue(renewed);
 probe.updates.length=0;
 // No render or passive effects have run since onContinue.
 probe.expireSession({userId:'8',sessionKey:'8:2'});
 assert.ok(probe.updates.some(update=>update.index===2&&update.value.sessionExpired));
 probe.updates.length=0;
 probe.expireSession({userId:'8',sessionKey:'8:1'});
 assert.equal(probe.updates.length,0,'an older login generation cannot reopen the current overlay');
 for(const cleanup of cleanups)if(typeof cleanup==='function')cleanup();
 assert.equal(probe.expireSession,null);
});

test('만료 안내는 기존 로그인 화면을 재사용하고 닫으면 게스트, 로그인 성공 시 회원 화면으로 복귀한다',async()=>{
 const member={mode:'authenticated',userId:'7'},probe={effects:[],updates:[]};
 const tree=root(false,undefined,member,{sessionExpired:true},probe);
 const auth=nodes(tree).find(node=>node.type==='./src/auth/AuthScreen');
 assert.equal(auth.props.sessionExpired,true);
 assert.equal(auth.props.resumeSession,false);
 assert.equal(nodes(tree).find(node=>node.props?.onLogin).props.authenticated,false);
 assert.ok(has(tree,'MemberDiaryApp'));
 const restored={mode:'authenticated',userId:'8'};
 auth.props.onContinue(restored);
 assert.ok(probe.updates.some(update=>update.index===0&&update.value===restored));
 probe.updates.length=0;
 auth.props.onClose();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(probe.updates.some(update=>update.index===0),false,'old overlay close cannot replace the new login');
});

test('이전 세션 종료 콜백은 같은 계정 재로그인 직후 effect 실행 전에도 새 세션을 지우지 않는다',async()=>{
 const member={mode:'authenticated',userId:'7'},probe={effects:[],updates:[],memberSessionKey:'7:1'};
 const tree=root(false,undefined,member,{sessionExpired:true},probe);
 const clear=nodes(tree).find(node=>node.type?.name==='MemberDiaryApp').props.onClearSession;
 const auth=nodes(tree).find(node=>node.type==='./src/auth/AuthScreen');
 probe.sessionKey='7:2';probe.memberSessionKey='7:2';
 auth.props.onContinue(member);
 probe.updates.length=0;
 clear();auth.props.onClose();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(probe.guestStarts||0,0);assert.equal(probe.updates.some(update=>update.index===0),false);
 probe.sessionKey=null;
 clear();auth.props.onClose();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(probe.guestStarts||0,0,'generation mismatch remains protected even when the newer session expires');
});

test('만료 중 다른 기능이 로그인을 요청해도 만료 안내를 유지하고 닫으면 회원 화면에서 벗어난다',async()=>{
 const member={mode:'authenticated',userId:'7'},probe={effects:[],updates:[]};
 const tree=root(false,undefined,member,{sessionExpired:true},probe);
 const request={feature:'다이어리 공유',action(){}};
 nodes(tree).find(node=>node.props?.onLogin).props.onLogin(request);
 const next=probe.updates.find(update=>update.index===2).value;
 assert.deepEqual(next,{...request,sessionExpired:true});
 // Even a caller that replaced the request without the flag cannot strand the member view.
 const replaced=root(false,undefined,member,request,probe);
 nodes(replaced).find(node=>node.type==='./src/auth/AuthScreen').props.onClose();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(probe.guestStarts,1);
 assert.ok(probe.updates.some(update=>update.index===0&&update.value.provider==='guest'));
});

test('게스트 프로필 조회가 늦어도 그사이 완료된 로그인 세션을 덮어쓰지 않는다',async()=>{
 const member={mode:'authenticated',userId:'7'},probe={effects:[],updates:[]};
 let finishGuest;
 probe.guestStart=()=>new Promise(resolve=>{finishGuest=resolve});
 const tree=root(false,undefined,member,{sessionExpired:true},probe);
 const auth=nodes(tree).find(node=>node.type==='./src/auth/AuthScreen');
 auth.props.onClose();
 await new Promise(resolve=>setImmediate(resolve));
 const renewed={mode:'authenticated',userId:'8'};
 probe.sessionKey='8:2';probe.memberSessionKey='8:2';
 auth.props.onContinue(renewed);
 probe.updates.length=0;
 finishGuest({mode:'preview',provider:'guest'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(probe.updates.some(update=>update.index===0),false);
});

test('부팅 시 저장 토큰 만료는 재로그인을 열고 프록시·통신 오류는 자동으로 로그인 화면을 열지 않는다',async()=>{
 for(const restoreError of [{status:401,code:'INVALID_TOKEN'},{status:403},{status:401,code:'ACCESS_DENIED'},{status:0}]){
  const probe={effects:[],updates:[],hidden:0,restoreError};
  root(false,undefined,null,null,probe);
  const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0;
  let cleanups;
  try{cleanups=probe.effects.map(fn=>fn())}finally{globalThis.setTimeout=timer}
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(probe.updates.some(update=>update.index===2&&update.value.sessionExpired),restoreError.code==='INVALID_TOKEN');
  for(const cleanup of cleanups)if(typeof cleanup==='function')cleanup();
 }
});

test('authService 모듈은 공용 주소·헤더를 선언한 뒤 생성 인자로 전달하고 운영 개발접속을 끈다', () => {
 const source = babel.transformSync(readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
 }).code
 for (const dev of [true, false]) {
  const mod = { exports: {} }
  const mocks = { './sessionStore': {sessionStore: null}, 'react-native': { Platform: { OS: 'android' } }, './authApi': {
   authBaseUrl: value => `${value}/api/v1`, createAuthApi: options => options,
  }, './photoUpload': { buildPhotoBody() {} }, './googleLogin': { signInWithGoogle() {} }, './appleLogin': { signInWithApple() {} }, './appleLogin': { signInWithApple() {} }, '../shared/apiBaseUrlPolicy': apiBaseUrlPolicy, 'expo/fetch': { fetch() {} },
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
test('API 주소가 없는 정적 웹 릴리스도 모듈 로드 대신 설정 오류 화면으로 분기한다', () => {
 const source = babel.transformSync(readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
 }).code
 const mod = { exports: {} }
 const mocks = { './sessionStore': {sessionStore: null}, 'react-native': { Platform: { OS: 'web' } }, './authApi': { authBaseUrl: value => value, createAuthApi: options => options },
  './photoUpload': { buildPhotoBody() {} }, './googleLogin': { signInWithGoogle() {} }, './appleLogin': { signInWithApple() {} },
  './developmentAccessStore': { createDevelopmentAccessStore() {} }, './legacyAccessKeychain': { legacyAccessKeychain: 'keychain' }, '../shared/apiBaseUrlPolicy': apiBaseUrlPolicy, 'expo/fetch': { fetch() {} } }
 new Function('require', 'module', 'exports', '__DEV__', 'process', source)(id => mocks[id], mod, mod.exports, false, { env: {} })
 assert.equal(mod.exports.apiConfigurationError, true)
 assert.equal(mod.exports.apiBaseUrl, 'https://api-configuration.invalid/api')
})
test('API 주소가 없는 네이티브 릴리스도 시작 설정 오류로 분기한다', () => {
 const source = babel.transformSync(readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
 }).code
 const mod = { exports: {} }
 const mocks = { './sessionStore': {sessionStore: null}, 'react-native': { Platform: { OS: 'android' } }, './authApi': { authBaseUrl: value => value, createAuthApi: options => options },
  './photoUpload': { buildPhotoBody() {} }, './googleLogin': { signInWithGoogle() {} }, './appleLogin': { signInWithApple() {} },
  './developmentAccessStore': { createDevelopmentAccessStore() {} }, './legacyAccessKeychain': { legacyAccessKeychain: 'keychain' }, '../shared/apiBaseUrlPolicy': apiBaseUrlPolicy, 'expo/fetch': { fetch() {} } }
 new Function('require', 'module', 'exports', '__DEV__', 'process', source)(id => mocks[id], mod, mod.exports, false, { env: {} })
 assert.equal(mod.exports.apiConfigurationError, true)
})
test('평문 또는 잘못된 API 주소가 주입된 릴리스도 설정 오류로 분기한다', () => {
 const source = babel.transformSync(readFileSync(new URL('../src/auth/authService.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
 }).code
 const mocks = { './sessionStore': {sessionStore: null}, 'react-native': { Platform: { OS: 'android' } }, './authApi': { authBaseUrl: value => value, createAuthApi: options => options },
  './photoUpload': { buildPhotoBody() {} }, './googleLogin': { signInWithGoogle() {} }, './appleLogin': { signInWithApple() {} },
  './developmentAccessStore': { createDevelopmentAccessStore() {} }, './legacyAccessKeychain': { legacyAccessKeychain: 'keychain' }, '../shared/apiBaseUrlPolicy': apiBaseUrlPolicy, 'expo/fetch': { fetch() {} } }
 for (const url of ['http://10.0.2.2:8080/api', 'not a URL']) {
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', '__DEV__', 'process', source)(id => mocks[id], mod, mod.exports, false, { env: { EXPO_PUBLIC_API_BASE_URL: url } })
  assert.equal(mod.exports.apiConfigurationError, true)
 }
})
test('설정 오류 플래그가 켜지면 App은 전용 오류 화면을 렌더링하고 빈 상태 스타일을 사용한다', () => {
 const probe = { effects: [], guestStarts: 0, hidden: 0 }
 const tree = root(false, undefined, null, null, probe, true)
 assert.ok(has(tree, './src/shared/ApiConfigurationErrorScreen'))
 const errorScreen = readFileSync(new URL('../src/shared/ApiConfigurationErrorScreen.js', import.meta.url), 'utf8')
 const diaryStyles = readFileSync(new URL('../src/diary/styles.js', import.meta.url), 'utf8')
 assert.match(errorScreen, /styles\.empty(?:Title|Copy)?/)
 for (const key of ['empty:', 'emptyTitle:', 'emptyCopy:']) assert.ok(diaryStyles.includes(key), `${key} 스타일이 필요해요`)
 const timer = globalThis.setTimeout
 globalThis.setTimeout = () => 0
 try { for (const effect of probe.effects) effect() } finally { globalThis.setTimeout = timer }
 assert.equal(probe.guestStarts, 0, '설정 오류 화면에서는 게스트 세션을 시작하지 않는다')
 assert.ok(probe.hidden >= 1, '설정 오류 화면을 보이기 전에 네이티브 시작 화면을 내린다')
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
test('라이선스 웹 export는 production HTTPS API 주소가 없으면 시작하지 않는다', () => {
 const source = readFileSync(new URL('../scripts/export-licensed-web.cjs', import.meta.url), 'utf8')
 assert.match(source, /productionEnv\.EXPO_PUBLIC_API_BASE_URL/)
 assert.match(source, /Web export requires a production HTTPS EXPO_PUBLIC_API_BASE_URL/)
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
 assert.equal(nodes(asked).find(n=>n.type?.name==='LocalDiaryApp').props.loginOverlayOpen,true)
 assert.equal(nodes(root(true,undefined,guest)).find(n=>n.type?.name==='LocalDiaryApp').props.loginOverlayOpen,false)
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
 assert.equal(nodes(member).find(n=>n.type?.name==='MemberDiaryApp').key,'authenticated:1:1')
})
test('개발 전용 보관함 목 모드는 기존 경로를 유지한다',()=>{
 assert.ok(has(root(true,'mock'),'./src/diary/screens/ConnectedDiaryLibrary'))
 assert.ok(has(root(true,'mock-library'),'./src/diary/screens/MockLibraryApp'))
})

test('부팅 중 BootSplash 이미지 준비 완료 뒤에 네이티브 시작 화면을 내린다',()=>{
 const probe={effects:[],hidden:0,booting:true}
 const first=root(false,undefined,null,null,probe)
 // 로고는 BootSplash 가 그린다(안드로이드 네이티브 시작 화면은 바탕색만). 첫 렌더에 빠지면 로고 없는 빈 화면이 보인다
 assert.ok(has(first,'./src/shared/BootSplash'))
 assert.equal(probe.hidden,0,'렌더 중에는 내리지 않는다')
 // 다른 마운트 효과(8초 안전 타이머 등)는 실행만 하고 타이머는 걸지 않는다
 const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0
 try{for(const effect of probe.effects){try{effect()}catch{}}}finally{globalThis.setTimeout=timer}
 assert.equal(probe.hidden,0,'이미지 준비 전에는 마운트 효과만으로 내리지 않는다')
 nodes(first).find(node=>node.type==='./src/shared/BootSplash').props.onReady()
 assert.ok(probe.hidden>=1,'이미지 준비 완료 뒤 네이티브 시작 화면을 내린다')
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

 test('부팅 시 저장 세션이 복원되면 게스트 초기화 없이 회원 보관함으로 시작한다', async()=>{
 const restored={mode:'authenticated',userId:'7',provider:'email',nickname:'회원'};
 const probe={effects:[],updates:[],restored,hidden:0,cleaned:0};
 root(true,undefined,null,null,probe);
 const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0;
 try{for(const effect of probe.effects)effect()}finally{globalThis.setTimeout=timer}
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(probe.updates.some(update=>update.index===0&&update.value===restored));
 assert.equal(probe.cleaned,0);
 });

test('개발 서버 Basic 인증이 필요한 복원은 기존 인증 화면을 자동으로 연다',async()=>{
 const probe={effects:[],updates:[],restoreError:{code:'DEVELOPMENT_ACCESS_REQUIRED'},hidden:0,cleaned:0};
 root(true,undefined,null,null,probe);
 const timer=globalThis.setTimeout;globalThis.setTimeout=()=>0;
 try{for(const effect of probe.effects)effect()}finally{globalThis.setTimeout=timer}
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(probe.updates.some(update=>update.index===2&&update.value.restoreSession===true));
 const tree=root(true,undefined,{mode:'preview',provider:'guest'},{restoreSession:true});
 const auth=nodes(tree).find(node=>node.type==='./src/auth/AuthScreen');
 assert.equal(auth.props.resumeSession,true);
});

test('로그아웃 이중 실패 안내는 기기 로그인 정보를 지웠다는 문구를 덧붙이지 않는다',async()=>{
 for(const incomplete of [true,false]){
  const message=incomplete?'다음 실행에서 로그인이 복원될 수 있어요.':'서버에 연결하지 못했어요.';
  const probe={notices:[],effects:[],updates:[],logoutError:Object.assign(new Error(message),{code:incomplete?'LOGOUT_INCOMPLETE':undefined})};
  const tree=root(true,undefined,{mode:'authenticated',userId:'7'},null,probe);
  const diary=nodes(tree).find(node=>node.type?.name==='MemberDiaryApp');
  await diary.props.onEndPreview();
  assert.deepEqual(probe.notices,[['로그아웃',(incomplete?message:message+' 이 기기의 로그인 정보는 지웠어요.')+' 서버에서 로그아웃을 확인하지 못해 이 계정의 알림이 계속 올 수 있어요. 네트워크 연결 후 다시 로그인하고 로그아웃해 주세요.']]);
 }
});

test('세션 확인이 늦으면 스플래시 종료 후 준비 안내를 표시한다',()=>{
 const tree=root(false,undefined,null,null,{booting:false,effects:[]});
 assert.equal(has(tree,'./src/shared/BootSplash'),false);
 assert.ok(nodes(tree).some(node=>node.props?.children==='앱을 준비하고 있어요…'));
 assert.equal(has(root(false,undefined,{mode:'authenticated',userId:'7'},null,{booting:false,effects:[]}),'./src/shared/BootSplash'),false);
 assert.equal(has(root(false,undefined,{mode:'preview',provider:'guest'},null,{booting:false,effects:[]}),'./src/shared/BootSplash'),false);
});

test('글꼴 로딩이 멈춰도 부팅 제한 시간이 지나면 기본 글꼴로 화면을 연다',()=>{
 const probe={fontsLoaded:false,booting:true,effects:[],updates:[],hidden:0,platform:'android'};
 assert.equal(root(false,undefined,null,null,probe),null);
 const originalTimer=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const timers=[];
 globalThis.setTimeout=(callback,delay)=>{timers.push({callback,delay});return timers.length};
 globalThis.clearTimeout=()=>{};
 let cleanups;
 try{cleanups=probe.effects.map(effect=>effect())}finally{
  globalThis.setTimeout=originalTimer;globalThis.clearTimeout=originalClear;
 }
 timers.find(timer=>timer.delay===8000).callback();
 assert.ok(probe.updates.some(update=>update.index===1&&update.value===false));
 assert.equal(probe.hidden,1);
 probe.booting=false;
 assert.ok(nodes(root(false,undefined,null,null,probe)).some(node=>node.props?.children==='앱을 준비하고 있어요…'));
 assert.ok(nodes(root(false,undefined,{mode:'preview',provider:'guest'},null,probe)).some(node=>node.type?.name==='LocalDiaryApp'));
 cleanups.forEach(cleanup=>{if(typeof cleanup==='function')cleanup()});
});

test('웹은 글꼴을 기다리는 동안 스플래시 배경을 표시한다',()=>{
 const tree=root(false,undefined,null,null,{fontsLoaded:false,booting:true,effects:[]});
 assert.equal(tree.type,'View');
 assert.equal(tree.props.style[1].backgroundColor,'#F0ECFD');
 assert.equal(has(tree,'./src/shared/BootSplash'),false);
});

test('준비 안내가 사용하는 공용 스타일은 실제 스타일 모듈에 정의돼 있다',()=>{
 const source=babel.transformSync(readFileSync(new URL('../src/diary/styles.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const mod={exports:{}};
 const tokens=new Proxy({},{get:()=> '#123456'});
 const mocks={
  'react-native':{Platform:{OS:'web',select:options=>options.web??options.default},StyleSheet:{create:value=>value,hairlineWidth:1}},
  './constants':{C:tokens},'../shared/theme':{colors:tokens,bubble:{},DISABLED_OPACITY:0.5},
  './utils/gridLayout':{LIBRARY_SIDE_PADDING:24},
 };
 new Function('require','module','exports',source)(id=>mocks[id],mod,mod.exports);
 const {empty,emptyCopy}=mod.exports.styles;
 assert.equal(empty.flex,1);assert.equal(empty.alignItems,'center');assert.equal(empty.justifyContent,'center');
 assert.equal(emptyCopy.fontSize,13);assert.equal(emptyCopy.lineHeight,21);assert.equal(emptyCopy.color,tokens.muted);
});
