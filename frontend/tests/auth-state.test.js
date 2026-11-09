import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as validation from '../src/auth/validation.js'
import * as signupPolicy from '../src/auth/signupPolicy.js'
import * as legalContent from '../src/shared/legalContent.js'
import * as profileNavigation from '../src/diary/components/profileNavigationModel.js'
import {marketingDocuments} from '../src/shared/legalDocuments.js'
import { createAuthApi } from '../src/auth/authApi.js'
import * as sessionExpiry from '../src/auth/sessionExpiry.js'
import test from 'node:test'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
const code=babel.transformSync(readFileSync(new URL('../src/auth/AuthScreen.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
const termsCode=babel.transformSync(readFileSync(new URL('../src/auth/SignupTerms.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
const accountLinksCode=babel.transformSync(readFileSync(new URL('../src/auth/AccountLinks.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
function setup(service,photoPicker,options={emailVerificationEnabled:true}){
 const states=[],refs=[],deps=[],cleanups=[],keyboard={};let si=0,ri=0,ei=0,back
 const react={useState:initial=>{const i=si++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useRef:initial=>refs[ri++]??={current:initial},useEffect:(fn,next)=>{const i=ei++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){cleanups[i]?.();deps[i]=next;cleanups[i]=fn()}}}
 const native={Linking:{openURL:async()=>{}},Keyboard:{dismiss(){},addListener:(name,fn)=>{keyboard[name]=fn;return{remove(){delete keyboard[name]}}}},Platform:{OS:'android'},BackHandler:{addEventListener:(_,fn)=>{back=fn;return{remove(){}}}}};for(const name of ['ActivityIndicator','KeyboardAvoidingView','Pressable','ScrollView','Text','TextInput','View'])native[name]=name
 const mocks={react,'../shared/legalContent':legalContent,'./LegalDocumentScreen':{__esModule:true,default:'LegalDocumentScreen'},'react-native':native,'react-native-safe-area-context':{SafeAreaView:'safe'},'../shared/useFormFactor':{useFormFactor:()=>({isPhone:false,formFactor:'tablet'})},'../shared/useOrientationLock':{useOrientationLock(){}},'./signupPolicy':signupPolicy,'./appleLogin':{isAppleLoginSupported:()=>false},'./validation':validation,'./styles':{authStyles:new Proxy({},{get:(_,key)=>key})},'../shared/theme':{colors:{}}}
 mocks['./sessionExpiry.js']=sessionExpiry;
 const termsMod={exports:{}};new Function('require','module','exports',termsCode)(id=>id==='../shared/legalDocuments'?{marketingDocuments}:mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),termsMod,termsMod.exports);mocks['./SignupTerms']={__esModule:true,default:termsMod.exports.default}
 const linksMod={exports:{}};new Function('require','module','exports',accountLinksCode)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),linksMod,linksMod.exports);mocks['./AccountLinks']=linksMod.exports
 const mod={exports:{}};new Function('require','module','exports','__DEV__',code)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),mod,mod.exports,options.developmentMode ?? false)
 const sessions=[],render=()=>{si=ri=ei=0;return mod.exports.default({service,onContinue:session=>sessions.push(session),photoPicker,legalDocuments:{service:'https://dio.test/legal/v2/service',privacy:'https://dio.test/legal/v2/consent',policy:'https://dio.test/legal/v2/privacy'},...options})}
 return{render,sessions,keyboard,back:()=>back(),unmount:()=>cleanups.forEach(fn=>fn?.())}
}
const nodes=n=>!n||typeof n!=='object'?[]:typeof n.type==='function'&&(n.type.name==='SignupTerms'||n.type.name==='AccountLinks')?nodes(n.type(n.props)):[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
const find=(tree,label)=>nodes(tree).find(n=>n.props.accessibilityLabel===label||n.props.label===label)
function enterSignup(ui) {
 find(ui.render(),'회원가입').props.onPress();
 const age=find(ui.render(),'만 14세 이상입니다');
 if (!age) return;
 age.props.onPress();find(ui.render(),'필수 항목 전체 동의').props.onPress();
 find(ui.render(),'동의하고 계속').props.onPress();
}
async function enterSocial(ui) {
 find(ui.render(),'구글로 로그인').props.onPress();
  await tick();
 find(ui.render(),'만 14세 이상입니다').props.onPress();
 find(ui.render(),'필수 항목 전체 동의').props.onPress();
 find(ui.render(),'동의하고 계속').props.onPress();
}
const tick=()=>new Promise(resolve=>setImmediate(resolve))

test('세션 만료 재로그인은 기존 이메일·비밀번호 입력과 공통 안내를 표시한다',()=>{
 const ui=setup({},undefined,{sessionExpired:true,initialEmail:'returning@example.com'});
 try{
  const tree=ui.render();
  assert.ok(find(tree,'이메일'));assert.ok(find(tree,'비밀번호'));
  assert.equal(find(tree,'이메일').props.value,'returning@example.com');
  assert.equal(find(tree,'비밀번호').props.value,'');
  assert.ok(nodes(tree).some(node=>node.props?.children===sessionExpiry.SESSION_EXPIRED_MESSAGE));
 }finally{ui.unmount()}
});

test('개발 서버 재인증 후 저장된 로그인은 회원 비밀번호 재입력 없이 복원한다', async()=>{
 let configured=false, logins=0, restores=0;
 const member={mode:'authenticated',userId:'7',provider:'email'};
 const ui=setup({login:async()=>{logins++;},restoreSession:async()=>{restores++;assert.equal(configured,true);return member;},
  verificationService:{setDevelopmentAccess(id,password){assert.equal(id,'tester');assert.equal(password,'secret');configured=true;}}},undefined,
  {developmentMode:true,resumeSession:true});
 try {
  assert.equal(find(ui.render(),'이메일'),undefined);
  find(ui.render(),'개발 서버 ID').props.onChange('tester');
  find(ui.render(),'개발 서버 비밀번호').props.onChange('secret');
  const button=find(ui.render(),'접속 인증 후 로그인 복원');
  assert.equal(button.props.disabled,false);button.props.onPress();await tick();
  assert.equal(restores,1);assert.equal(logins,0);assert.deepEqual(ui.sessions,[member]);
 } finally {ui.unmount();}
});

test('개발 인증 입력 기능이 없는 복원 설정은 일반 이메일 로그인으로 돌아간다',async()=>{
 for(const developmentMode of [true,false]){
  const member={mode:'authenticated',userId:'7',provider:'email'};
  let logins=0;
  const ui=setup({login:async()=>{logins++;return member;}},undefined,{developmentMode,resumeSession:true});
  try{
   assert.ok(find(ui.render(),'이메일'));assert.ok(find(ui.render(),'비밀번호'));
   assert.equal(find(ui.render(),'개발 서버 ID'),undefined);
   find(ui.render(),'이메일').props.onChange('member@example.com');
   find(ui.render(),'비밀번호').props.onChange('Password123!');
   const button=find(ui.render(),'로그인');assert.equal(button.props.disabled,false);
   button.props.onPress();await tick();assert.equal(logins,1);assert.deepEqual(ui.sessions,[member]);
  }finally{ui.unmount();}
 }
});

test('저장 로그인 복원 중 개발 인증 오류는 재입력을 허용하고 만료 토큰은 일반 로그인으로 돌아간다',async()=>{
 for(const error of [Object.assign(new Error('게이트웨이 인증 필요'),{code:'DEVELOPMENT_ACCESS_REQUIRED',status:401}),
  Object.assign(new Error('다시 로그인해 주세요.'),{code:'INVALID_REFRESH_TOKEN',status:401}),new Error('네트워크 오류')]){
  const ui=setup({restoreSession:async()=>{throw error;},verificationService:{setDevelopmentAccess(){}}},undefined,{developmentMode:true,resumeSession:true});
  try{
   find(ui.render(),'개발 서버 ID').props.onChange('tester');find(ui.render(),'개발 서버 비밀번호').props.onChange('secret');
   find(ui.render(),'접속 인증 후 로그인 복원').props.onPress();await tick();
   assert.equal(ui.sessions.length,0);
   if(error.code==='INVALID_REFRESH_TOKEN')assert.ok(find(ui.render(),'이메일'));
   else assert.ok(find(ui.render(),'접속 인증 후 로그인 복원'));
  }finally{ui.unmount();}
 }
});

test('로그인 오버레이 첫 화면의 뒤로가기는 오버레이만 닫고 이벤트를 소비한다', () => {
 let closes=0;
 const ui=setup({},undefined,{onClose:()=>{closes++}});
 try { ui.render(); assert.equal(ui.back(),true); assert.equal(closes,1); }
 finally { ui.unmount(); }
});

test('독립 로그인 첫 화면은 기존 시스템 뒤로가기 동작에 위임한다', () => {
 const ui=setup({});
 try { ui.render(); assert.equal(ui.back(),false); }
 finally { ui.unmount(); }
});

test('로그인 요청 중 뒤로가기는 뒤 화면에 전달하지 않고 오버레이를 유지한다', async () => {
 let closes=0, release;
 const ui=setup({login:()=>new Promise(resolve=>{release=resolve})},undefined,{onClose:()=>{closes++}});
 try {
  find(ui.render(),'이메일').props.onChange('member@example.com');
  find(ui.render(),'비밀번호').props.onChange('Password123!');
  find(ui.render(),'로그인').props.onPress();
  ui.render(); assert.equal(ui.back(),true); assert.equal(closes,0);
  release({mode:'authenticated',nickname:'회원'}); await tick();
 } finally { ui.unmount(); }
});

test('가입 단계에서 뒤로가기는 오버레이를 닫지 않고 이전 인증 화면으로 이동한다', () => {
 let closes=0;
 const ui=setup({},undefined,{onClose:()=>{closes++}});
 try {
  find(ui.render(),'회원가입').props.onPress();
  ui.render(); assert.equal(ui.back(),true); assert.equal(closes,0);
  assert.ok(find(ui.render(),'회원가입'));
 } finally { ui.unmount(); }
});

test('가입 전 연령·필수 동의를 받으며 전체 동의가 연령까지 대신 확인하지 않는다', () => {
 const ui=setup({});
 try {
  find(ui.render(),'회원가입').props.onPress();
  assert.equal(find(ui.render(),'이메일'),undefined);
  assert.equal(find(ui.render(),'만 14세 이상입니다').props.checked,false);
  find(ui.render(),'필수 항목 전체 동의').props.onPress();
  assert.equal(find(ui.render(),'동의하고 계속').props.disabled,true);
  find(ui.render(),'동의하고 계속').props.onPress();
  assert.equal(find(ui.render(),'이메일'),undefined);
  find(ui.render(),'만 14세 이상입니다').props.onPress();
  assert.equal(find(ui.render(),'동의하고 계속').props.disabled,false);
  find(ui.render(),'동의하고 계속').props.onPress();
  assert.ok(find(ui.render(),'이메일'));
  assert.equal(find(ui.render(),'생년월일'),undefined);
  ui.render();ui.back();ui.render();ui.back();ui.render();
  find(ui.render(),'회원가입').props.onPress();
  assert.equal(find(ui.render(),'만 14세 이상입니다').props.checked,false);
 } finally { ui.unmount(); }
});

test('문서 URL 미게시여도 필수 동의 후 가입 화면으로 진행한다', () => {
 const ui=setup({},undefined,{emailVerificationEnabled:true,legalDocuments:{}});
 try {
  assert.ok(find(ui.render(),'로그인'));
  find(ui.render(),'회원가입').props.onPress();
  find(ui.render(),'만 14세 이상입니다').props.onPress();
  find(ui.render(),'필수 항목 전체 동의').props.onPress();
  find(ui.render(),'동의하고 계속').props.onPress();
  assert.ok(find(ui.render(),'이메일'));
 } finally { ui.unmount(); }
});

test('14세 미만 응답은 가입을 중단하고 오래된 계속 버튼으로도 인증을 시작하지 않는다', () => {
 for (const entry of ['회원가입']) {
  const calls=[];
  const service={social:provider=>{calls.push(provider)},verificationService:{send:()=>calls.push('mail')}};
  const ui=setup(service);
  try {
   find(ui.render(),'이메일').props.onChange('private@example.com');
   find(ui.render(),'비밀번호').props.onChange('Private123!');
   find(ui.render(),entry).props.onPress();
   assert.equal(find(ui.render(),'만 14세 이상입니다').props.checked,false);
   assert.equal(find(ui.render(),'만 14세 미만입니다').props.checked,false);
   find(ui.render(),'만 14세 이상입니다').props.onPress();
   find(ui.render(),'필수 항목 전체 동의').props.onPress();
   const previousContinue=find(ui.render(),'동의하고 계속');
   find(ui.render(),'만 14세 미만입니다').props.onPress();
   previousContinue.props.onPress();
   const blocked=ui.render();
   for (const label of ['이메일','비밀번호','동의하고 계속','만 14세 이상입니다','구글로 로그인','이전 화면'])
    assert.equal(find(blocked,label),undefined);
   assert.ok(find(blocked,'시작 화면으로'));
   assert.deepEqual(calls,[]);
   find(blocked,'시작 화면으로').props.onPress();
   assert.equal(find(ui.render(),'이메일').props.value,'');
   assert.equal(find(ui.render(),'비밀번호').props.value,'');
   find(ui.render(),entry).props.onPress();
   assert.equal(find(ui.render(),'만 14세 이상입니다').props.checked,false);
   assert.equal(find(ui.render(),'[필수] 이용약관 동의').props.checked,false);
  } finally { ui.unmount(); }
 }
});

test('구글 로그인 창을 먼저 열고, 인증 오류는 시작 화면에서 안내한다', async () => {
 const providers=[];
 const ui=setup({social:async provider=>{providers.push(provider);throw new Error('소셜 로그인 API는 아직 연결되지 않았어요.')}},undefined,{emailVerificationEnabled:false});
 try {
  find(ui.render(),'구글로 로그인').props.onPress();
  await tick();
  assert.deepEqual(providers,['google']);
  assert.equal(find(ui.render(),'만 14세 이상입니다'),undefined);
  assert.ok(nodes(ui.render()).some(node=>node.props.children==='소셜 로그인 API는 아직 연결되지 않았어요.'));
 } finally { ui.unmount(); }
});

const reader = ui => nodes(ui.render()).find(node => node.type === 'LegalDocumentScreen');
const consentRows = [
 ['service','[필수] 이용약관 동의'], ['privacy','[필수] 개인정보 수집·이용 동의'],
 ...marketingDocuments.map(item => [item.id,`[선택] ${item.label}`]),
];
function openConsent(ui,key) {
 const item=consentRows.find(([id])=>id===key);
 const rows=nodes(ui.render()).filter(node=>node.type?.name==='ViewButton');
 rows.find(row=>row.props.label===(item[1].startsWith('[선택] ')?item[1].slice(5):item[1])).props.onPress();
 return reader(ui);
}
for(const [key,label] of consentRows) test(`앱 내 문서에서 동의하면 해당 항목만 체크한다: ${key}`,()=>{
 const ui=setup({},undefined,{emailVerificationEnabled:true,legalDocuments:{}});
 try {
  find(ui.render(),'회원가입').props.onPress();
  const doc=openConsent(ui,key);
  assert.equal(doc.props.document.id,key);
  assert.equal(doc.props.document.effectiveDate,'2026-11-04');
  assert.equal(find(ui.render(),label).props.checked,false);
  doc.props.onAgree();
  assert.equal(reader(ui),undefined);
  for(const [id,text] of consentRows) assert.equal(find(ui.render(),text).props.checked,id===key);
  assert.equal(find(ui.render(),'만 14세 이상입니다').props.checked,false);
 }finally{ui.unmount()}
});
test('문서 닫기와 Android 뒤로가기는 동의를 변경하거나 가입 화면을 이탈하지 않는다',()=>{
 const ui=setup({});
 try {
  find(ui.render(),'회원가입').props.onPress();
  find(ui.render(),'[필수] 이용약관 동의').props.onPress();
  openConsent(ui,'privacy').props.onClose();
  openConsent(ui,'adEmail');assert.equal(ui.back(),true);
  assert.equal(reader(ui),undefined);
  assert.ok(find(ui.render(),'만 14세 이상입니다'));
  for(const [id,label] of consentRows)assert.equal(find(ui.render(),label).props.checked,id==='service');
 }finally{ui.unmount()}
});
test('개인정보처리방침에는 동의 콜백이 없고 닫기만 한다',()=>{
 const ui=setup({});
 try {
  find(ui.render(),'회원가입').props.onPress();
  find(ui.render(),'개인정보처리방침 보기').props.onPress();
  const doc=reader(ui);assert.equal(doc.props.document.id,'policy');assert.equal(doc.props.onAgree,undefined);
  doc.props.onClose();assert.equal(reader(ui),undefined);
  for(const [,label] of consentRows)assert.equal(find(ui.render(),label).props.checked,false);
 }finally{ui.unmount()}
});
test('이미 닫힌 문서의 오래된 동의 콜백은 다른 문서를 체크하지 않는다',()=>{
 const ui=setup({});
 try {
  find(ui.render(),'회원가입').props.onPress();
  const old=openConsent(ui,'privacy');old.props.onClose();
  openConsent(ui,'service');old.props.onAgree();
  assert.equal(reader(ui).props.document.id,'service');
  for(const [,label] of consentRows)assert.equal(find(ui.render(),label).props.checked,false);
 }finally{ui.unmount()}
});

test('로그인은 개발 접근 인증 후 같은 입력으로 재시도하고 연타를 막는다', async () => {
  const requests = [];
  let release;
  const service = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true,
    fetchImpl: async (url, init) => {
      requests.push({ url, ...init });
      if (!init.headers.Authorization) return new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="development"' } });
      return new Promise(resolve => { release = () => resolve(new Response(JSON.stringify({
        accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 900,
        user: { userId: '7', email: 'member@example.com', nickname: '회원', profilePhotoUrl: null },
      }), { status: 200 })); });
    } });
  const ui = setup(service, undefined, { developmentMode: true });
  try {
    find(ui.render(), '이메일').props.onChange('member@example.com');
    find(ui.render(), '비밀번호').props.onChange('Password123!');
    find(ui.render(), '로그인').props.onPress(); await tick();
    assert.ok(find(ui.render(), '개발 서버 ID'));
    assert.equal(find(ui.render(), '로그인'), undefined);
    find(ui.render(), '개발 서버 ID').props.onChange('tester');
    find(ui.render(), '개발 서버 비밀번호').props.onChange('secret');
    const submit = find(ui.render(), '접속 인증 후 로그인');
    submit.props.onPress(); submit.props.onPress();
    assert.equal(requests.length, 2);
    assert.equal(find(ui.render(), '로그인').props.disabled, true);
    release(); await tick();
    assert.equal(ui.sessions.length, 1);
    assert.equal(ui.sessions[0].nickname, '회원');
    assert.equal(ui.sessions[0].accessToken, undefined);
    assert.equal(find(ui.render(), '비밀번호').props.value, '');
  } finally { ui.unmount(); }
});

test('개발 접속 요구는 운영 화면에 입력칸을 만들지 않고 이전 로그인 응답은 화면 이탈 후 무시한다', async () => {
  const error = Object.assign(new Error('개발 서버 접근 인증이 필요해요.'), { code: 'DEVELOPMENT_ACCESS_REQUIRED' });
  const ui = setup({ login: async () => { throw error; }, verificationService: { setDevelopmentAccess() {} } });
  try {
    find(ui.render(), '이메일').props.onChange('member@example.com');
    find(ui.render(), '비밀번호').props.onChange('Password123!');
    find(ui.render(), '로그인').props.onPress(); await tick();
    assert.equal(find(ui.render(), '개발 서버 ID'), undefined);
  } finally { ui.unmount(); }
  let release;
  const pending = setup({ login: () => new Promise(resolve => { release = resolve; }) });
  try {
    find(pending.render(), '이메일').props.onChange('member@example.com');
    find(pending.render(), '비밀번호').props.onChange('Password123!');
    find(pending.render(), '로그인').props.onPress();
    enterSignup(pending);
    release({ mode: 'authenticated', nickname: '이전회원' }); await tick();
    assert.deepEqual(pending.sessions, []);
    assert.ok(find(pending.render(), '비밀번호 확인'));
  } finally { pending.unmount(); }
});

test('잘못된 개발 접속 정보는 다시 입력할 수 있고 뒤로가기는 비밀번호와 입력칸을 정리한다', async () => {
  const service = createAuthApi({ baseUrl: 'https://server.example', allowDevelopmentAccess: true,
    fetchImpl: async () => new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Basic' } }) });
  const ui = setup(service, undefined, { developmentMode: true });
  try {
    find(ui.render(), '이메일').props.onChange('member@example.com');
    find(ui.render(), '비밀번호').props.onChange('Password123!');
    find(ui.render(), '로그인').props.onPress(); await tick();
    find(ui.render(), '개발 서버 ID').props.onChange('tester');
    find(ui.render(), '개발 서버 비밀번호').props.onChange('incorrect');
    find(ui.render(), '접속 인증 후 로그인').props.onPress(); await tick();
    assert.ok(find(ui.render(), '개발 서버 ID'));
    assert.equal(find(ui.render(), '개발 서버 비밀번호').props.value, '');
    assert.equal(find(ui.render(), '비밀번호').props.value, 'Password123!');
    assert.equal(ui.back(), true);
    assert.equal(find(ui.render(), '개발 서버 ID'), undefined);
    assert.equal(find(ui.render(), '비밀번호').props.value, '');
    assert.deepEqual(ui.sessions, []);
  } finally { ui.unmount(); }
});

test('내 공간은 인증된 사진 소스를 사용하고 사진 로드 실패 시 기본 프로필을 표시한다', () => {
 const source=babel.transformSync(readFileSync(new URL('../src/diary/screens/ProfileScreen.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
 const states=[];let index=0
 const react={useEffect(){},useState:initial=>{const i=index++;if(!(i in states))states[i]=initial;return[states[i],value=>states[i]=value]}}
 const native={StyleSheet:{create:value=>value}};for(const name of ['Image','Pressable','ScrollView','Text','View'])native[name]=name
 const mocks={react,'../shared/legalContent':legalContent,'./LegalDocumentScreen':{__esModule:true,default:'LegalDocumentScreen'},'react-native':{...native,useWindowDimensions:()=>({width:411,height:914,fontScale:1})},'expo-image':{Image:'Image'},'../styles':{styles:{}},'../constants':{C:{white:'#fff',line:'#ddd',active:'#eef',blueStrong:'#467',pale:'#eef',ink:'#112',muted:'#667',canvas:'#f3f4f7'}},'../../shared/theme':{colors:{},radius:{}},'../../auth/loginGate':{useLoginGate:()=>(_feature,action)=>action(),useLoginEntry:()=>()=>{}},'../../shared/appLock':{appLockScope:()=>'scope',appLockSupported:true,readAppLockState:async()=>'off',hasAppLock:async()=>false,checkAppLockStatus:async()=>({ok:true,retryAfterMs:0}),clearAppLock:async()=>{},setAppLock:async()=>{}},'../components/appLockRecovery':{appLockRecoveryAction:()=>undefined}},mod={exports:{}}
 new Function('require','module','exports',source)(id=>id==='../components/profileNavigationModel'?profileNavigation:mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),mod,mod.exports)
 const photo={uri:'https://server.example/photo',headers:{Authorization:'test-header'}}
 const render=(uri=photo.uri,userId='one')=>{index=0;return mod.exports.default({diaries:[],previewUser:{mode:'authenticated',photoUri:uri,nickname:'회원',userId},getProfilePhotoSource:uri=>({...photo,uri})})}
 const image=nodes(render()).find(node=>node.type==='Image')
 assert.deepEqual(image.props.source,{...photo,cacheKey:JSON.stringify(['profile','one',photo.uri])})
 assert.equal(image.props.cachePolicy,'memory')
 assert.equal(image.props.contentFit,'cover')
 image.props.onError()
 assert.equal(nodes(render()).some(node=>node.type==='Image'),false)
 assert.ok(nodes(render()).some(node=>node.type==='../../shared/DefaultAvatar')) // 사진이 없으면 모아 얼굴 기본 프로필
 assert.ok(nodes(render('https://server.example/new-photo')).some(node=>node.type==='Image'))
 photo.headers={Authorization:'changed-header'}
 const retried=nodes(render()).find(node=>node.type==='Image')
 assert.ok(retried)
 assert.equal(retried.props.source.cacheKey,image.props.source.cacheKey)
 retried.props.onError()
 assert.equal(nodes(render()).some(node=>node.type==='Image'),false)
 const other=nodes(render(photo.uri,'two')).find(node=>node.type==='Image')
 assert.ok(other)
 assert.notEqual(other.props.source.cacheKey,image.props.source.cacheKey)
 assert.ok(!other.props.source.cacheKey.includes('changed-header'))
})

test('실제 서비스는 배포 모드에서도 인증 화면에 서버 어댑터를 전달한다', () => {
  const service = createAuthApi({ baseUrl: 'https://server.example' });
  const ui = setup(service, undefined, { emailVerificationEnabled: false });
  enterSignup(ui);
  find(ui.render(), '이메일').props.onChange('member@example.com');
  find(ui.render(), '비밀번호').props.onChange('Password123!');
  find(ui.render(), '비밀번호 확인').props.onChange('Password123!');
  find(ui.render(), '다음').props.onPress();
  const verification = nodes(ui.render()).find(node => node.props.email === 'member@example.com' && node.props.onComplete);
  assert.equal(verification.props.service, service.verificationService);
  assert.equal(verification.props.service.preview, undefined);
  ui.unmount();
});
test('닉네임 중복 확인 없이 형식과 동의로 가입 가능하다',async()=>{
 const ui=setup({social:async()=>({provider:'kakao'}),checkNickname:()=>{throw new Error('must not call')}})
 await enterSocial(ui);find(ui.render(),'닉네임').props.onChange('소연')
 assert.equal(find(ui.render(),'닉네임 중복 확인'),undefined);assert.equal(find(ui.render(),'가입 완료').props.disabled,false)
 find(ui.render(),'닉네임').props.onChange('a');assert.equal(find(ui.render(),'가입 완료').props.disabled,true);ui.unmount()
})

test('구글 로그인은 처리 중 중복 실행하지 않고 신규 계정만 가입 전 확인으로 보낸다',async()=>{
 let resolveSocial,calls=0;const ui=setup({social:()=>{calls++;return new Promise(r=>resolveSocial=r)}})
 const button=find(ui.render(),'구글로 로그인');button.props.onPress();button.props.onPress();assert.equal(calls,1)
 resolveSocial({provider:'kakao',mode:'social-signup',email:'new@dio.test'});await tick();
 assert.ok(find(ui.render(),'만 14세 이상입니다'));assert.equal(find(ui.render(),'닉네임'),undefined);ui.unmount()
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

test('로그인 오류는 버튼 위에 표시하고 입력 수정 때 해제하고 시간이 지나도 저절로 지우지 않는다',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const ui=setup({login:async()=>{throw new Error('이메일 또는 비밀번호가 맞지 않아요.')}})
 const fill=()=>{find(ui.render(),'이메일').props.onChange('wrong@example.com');find(ui.render(),'비밀번호').props.onChange('Wrong1234')}
 fill();find(ui.render(),'로그인').props.onPress();await tick()
 let tree=ui.render(),all=nodes(tree),alert=all.find(n=>n.props.accessibilityRole==='alert')
 assert.ok(alert);assert.ok(all.indexOf(alert)<all.indexOf(find(tree,'로그인')))
 find(tree,'이메일').props.onChange('other@example.com');assert.ok(!nodes(ui.render()).some(n=>n.props.accessibilityRole==='alert'))
 find(ui.render(),'로그인').props.onPress();await tick();ui.render()
 t.mock.timers.tick(5000)
 assert.ok(nodes(ui.render()).some(n=>n.props.accessibilityRole==='alert'))
 ui.unmount()
})

test('프로필 사진 선택·취소·삭제를 처리한다',async()=>{
 const results=['file:///profile.jpg',null]
 const ui=setup({social:async()=>({provider:'kakao'})},async()=>results.shift())
 await enterSocial(ui)
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
 enterSignup(ui)
 for(const label of ['이메일','비밀번호','비밀번호 확인'])assert.equal(find(ui.render(),label).props.value,'')
 assert.ok(moves.length >= 1);assert.ok(moves.every(move=>move.y===0 && move.animated===false));ui.unmount()
})
test('유효한 닉네임으로 수정해도 재확인을 요구하지 않는다',async()=>{
 const ui=setup({social:async()=>({provider:'kakao'})});await enterSocial(ui)
 find(ui.render(),'닉네임').props.onChange('소연');find(ui.render(),'닉네임').props.onChange('다른이름')
 assert.equal(find(ui.render(),'가입 완료').props.disabled,false);ui.unmount()
})

test('사진 선택 도중 화면을 떠나면 늦은 결과를 적용하지 않는다',async()=>{
 let resolvePhoto
 const ui=setup({social:async()=>({provider:'kakao'})},()=>new Promise(r=>resolvePhoto=r))
 await enterSocial(ui);find(ui.render(),'프로필 사진 선택').props.onPress()
 ui.render();ui.back();resolvePhoto('file:///late.jpg');await tick()
 assert.ok(find(ui.render(),'로그인'));assert.equal(find(ui.render(),'선택한 프로필 사진'),undefined);ui.unmount()
})

test('이메일 가입 완료 후 자동 로그인하지 않고 이메일만 채운 로그인 화면으로 돌아간다',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const ui=setup({signup:async()=>({provider:'email',email:'new@example.com'}),checkNickname:async()=>true,completeProfile:async value=>({...value,mode:'authenticated'})})
 enterSignup(ui)
 find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
 find(ui.render(),'다음').props.onPress();await tick();nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete();await tick();find(ui.render(),'닉네임').props.onChange('소연')
 assert.equal(find(ui.render(),'필수 항목 전체 동의'),undefined)
 find(ui.render(),'가입 완료').props.onPress();await tick()
 const tree=ui.render();assert.ok(find(tree,'로그인'));assert.equal(find(tree,'이메일').props.value,'new@example.com');assert.equal(find(tree,'비밀번호').props.value,'');assert.deepEqual(ui.sessions,[]);const notice=nodes(tree).find(n=>n.props.children==='가입이 완료됐어요.');assert.equal(notice.props.accessibilityRole,'text');t.mock.timers.tick(2500);assert.ok(!nodes(ui.render()).some(n=>n.props.children==='가입이 완료됐어요.'));ui.unmount()
})

test('배포 모드는 인증 서비스가 없으면 가입 진입 대신 준비 안내를 표시하고 로그인은 유지한다',()=>{
 const ui=setup({},undefined,{emailVerificationEnabled:false})
 enterSignup(ui)
 assert.ok(nodes(ui.render()).some(n=>n.props.children==='회원가입 준비 중'))
 assert.ok(find(ui.render(),'로그인'))
 assert.equal(nodes(ui.render()).find(n=>n.type==='./EmailVerification'),undefined)
 ui.unmount()
})

test('인증 완료의 다음은 서버 가입 요청을 기다리지 않고 프로필 화면으로 이동한다',async()=>{
 let calls=0;const ui=setup({signup:()=>{calls++;return new Promise(()=>{})}})
 enterSignup(ui)
 find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
 find(ui.render(),'다음').props.onPress()
 nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete();await tick()
 assert.ok(find(ui.render(),'닉네임'));assert.equal(calls,0);ui.unmount()
})

for (const outcome of ['missing','success','failure']) test(`주입 인증 서비스 가입 준비: ${outcome}`,async()=>{
 let calls=0,resolve
 const verificationService=outcome==='missing'?{}:{prepareSignup:()=>{calls++;return new Promise(r=>resolve=r)}}
 if(outcome==='failure') verificationService.prepareSignup=async()=>{calls++;throw new Error('가입 정보를 준비하지 못했어요.')}
 const ui=setup({},undefined,{emailVerificationEnabled:false,verificationService})
 enterSignup(ui)
 find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
 find(ui.render(),'다음').props.onPress()
 const complete=nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete
 complete()
 if(outcome==='success'){
  complete();assert.equal(calls,1);assert.equal(find(ui.render(),'닉네임'),undefined)
  resolve({provider:'email',email:'new@example.com',enrollment:7})
 }
 await tick()
 if(outcome==='success')assert.ok(find(ui.render(),'닉네임'))
 else{
  assert.equal(find(ui.render(),'닉네임'),undefined)
  assert.ok(nodes(ui.render()).some(n=>n.props.accessibilityRole==='alert'))
  assert.ok(nodes(ui.render()).find(n=>n.type==='./EmailVerification'))
 }
 ui.unmount()
})

for(const outcome of ['success','failure']) test(`가입 준비 중 뒤로가기 후 이전 응답 무시: ${outcome}`,async()=>{
 let resolve,reject
 const verificationService={prepareSignup:()=>new Promise((yes,no)=>{resolve=yes;reject=no})}
 const ui=setup({},undefined,{emailVerificationEnabled:false,verificationService})
 enterSignup(ui)
 find(ui.render(),'이메일').props.onChange('old@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
 find(ui.render(),'다음').props.onPress()
 nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete()
 ui.render();assert.equal(ui.back(),true)
 find(ui.render(),'이메일').props.onChange('new@example.com')
 if(outcome==='success')resolve({provider:'email',email:'old@example.com'})
 else reject(new Error('이전 요청 오류'))
 await tick()
 assert.equal(find(ui.render(),'이메일').props.value,'new@example.com')
 assert.equal(find(ui.render(),'닉네임'),undefined)
 assert.ok(!nodes(ui.render()).some(n=>n.props.children==='이전 요청 오류'))
 ui.unmount()
})

test('가입 준비의 잘못된 응답과 null 예외는 프로필 진입을 막고 재시도를 허용한다',async()=>{
 for(const result of [null,undefined,{}, {provider:'email',email:'other@example.com'}, {provider:'kakao',email:'new@example.com'}, 'throw-null']){
  const verificationService={prepareSignup:async()=>{if(result==='throw-null')throw null;return result}}
  const ui=setup({},undefined,{emailVerificationEnabled:false,verificationService})
  enterSignup(ui)
  find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
  find(ui.render(),'다음').props.onPress()
  nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete();await tick()
  assert.equal(find(ui.render(),'닉네임'),undefined)
  assert.ok(nodes(ui.render()).some(n=>n.props.accessibilityRole==='alert'))
  verificationService.prepareSignup=async()=>({provider:'email',email:'new@example.com'})
  nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete();await tick()
  assert.ok(find(ui.render(),'닉네임'));ui.unmount()
 }
})

test('이전 가입 준비 응답이 새 요청의 로딩과 이메일을 덮어쓰지 않는다',async()=>{
 const pending=[]
 const verificationService={prepareSignup:values=>new Promise(resolve=>pending.push({email:values.email,resolve}))}
 const ui=setup({},undefined,{emailVerificationEnabled:false,verificationService})
 enterSignup(ui)
 const enter=email=>{
  find(ui.render(),'이메일').props.onChange(email);find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
  find(ui.render(),'다음').props.onPress()
  nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete()
 }
 enter('old@example.com');ui.render();ui.back();enter('new@example.com')
 pending[0].resolve({provider:'email',email:'old@example.com'});await tick()
 let verification=nodes(ui.render()).find(n=>n.type==='./EmailVerification')
 assert.equal(verification.props.email,'new@example.com')
 assert.equal(verification.props.primary('다음',()=>{}).props.disabled,true)
 pending[1].resolve({provider:'email',email:'new@example.com'});await tick()
 assert.ok(find(ui.render(),'닉네임'));ui.unmount()
})

test('화면 종료 후 가입 준비 응답은 다음 화면을 열지 않는다',async()=>{
 let resolve
 const verificationService={prepareSignup:()=>new Promise(r=>resolve=r)}
 const ui=setup({},undefined,{emailVerificationEnabled:false,verificationService})
 enterSignup(ui)
 find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123')
 find(ui.render(),'다음').props.onPress();nodes(ui.render()).find(n=>n.type==='./EmailVerification').props.onComplete()
 ui.unmount();resolve({provider:'email',email:'new@example.com'});await tick()
 assert.equal(find(ui.render(),'닉네임'),undefined);assert.deepEqual(ui.sessions,[])
})

test('실제 가입 어댑터로 닉네임·동의·가입 충돌·재시도 후 이메일만 유지해 로그인으로 돌아간다', async () => {
  const calls = [];
  let signupCount = 0;
  const service = createAuthApi({ baseUrl: 'https://server.example', fetchImpl: async (url, init) => {
    const path = url.split('/auth/')[1], body = JSON.parse(init.body);
    calls.push({ path, body });
    const data = path === 'email-verifications/verify' ? { signupToken: 'server-token', expiresIn: 600 }
      : path === 'signup' ? (++signupCount === 1
        ? { code: 'SIGNUP_TEMPORARY_ERROR', detail: '사용할 수 없는 닉네임이에요.' }
        : { userId: 'member-1', email: body.email, nickname: body.nickname, profilePhotoUrl: null })
      : { available: true };
    const status = path === 'signup' ? signupCount === 1 ? 409 : 201 : 200;
    return { status, ok: status < 400, json: async () => data };
  } });
  const ui = setup(service);
  try {
    enterSignup(ui);
    find(ui.render(), '이메일').props.onChange('new@example.com');
    find(ui.render(), '비밀번호').props.onChange('Password123');
    find(ui.render(), '비밀번호 확인').props.onChange('Password123');
    find(ui.render(), '다음').props.onPress();
    const verification = nodes(ui.render()).find(node => node.type === './EmailVerification');
    await verification.props.service.verify('new@example.com', '482901');
    verification.props.onComplete(); await tick();
    find(ui.render(), '닉네임').props.onChange('소연');
    assert.equal(find(ui.render(), '[필수] 이용약관 동의'), undefined);
    assert.equal(find(ui.render(), '가입 완료').props.disabled, false);
    const complete = find(ui.render(), '가입 완료');
    complete.props.onPress(); complete.props.onPress(); await tick();
    assert.equal(signupCount, 1);
    assert.equal(find(ui.render(), '닉네임').props.value, '소연');
    assert.equal(find(ui.render(), '가입 완료').props.disabled, false);
    find(ui.render(), '닉네임').props.onChange('새소연');
    await tick();
    find(ui.render(), '가입 완료').props.onPress(); await tick();
    assert.equal(signupCount, 2);
    assert.ok(find(ui.render(), '로그인'));
    assert.equal(find(ui.render(), '이메일').props.value, 'new@example.com');
    assert.equal(find(ui.render(), '비밀번호').props.value, '');
    assert.equal(calls.at(-1).body.signupToken, 'server-token');
    assert.equal(calls.at(-1).body.agreements.some(term => term.termsType === 'MARKETING'), false);
    assert.equal(calls.at(-1).body.ageConfirmed, true);
    assert.deepEqual(ui.sessions, []);
  } finally { ui.unmount(); }
});

test('인증 화면의 접근성 역할은 설치된 React Native 네이티브 지원 값만 사용한다',()=>{
 const header=readFileSync(new URL('../node_modules/react-native/ReactCommon/react/renderer/components/view/AccessibilityPrimitives.h',import.meta.url),'utf8')
 const body=header.match(/enum class AccessibilityRole[^\{]*\{([\s\S]*?)\};/)[1]
 const supported=new Set(body.split(',').map(value=>value.trim().toLowerCase()))
 const visit=node=>{
  if(!node||typeof node!=='object')return
  if(node.type==='JSXAttribute'&&node.name?.name==='accessibilityRole'&&node.value?.type==='StringLiteral')assert.ok(supported.has(node.value.value.toLowerCase()),`네이티브 미지원 역할: ${node.value.value}`)
  for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}
 }
 for(const path of ['../src/auth/AuthScreen.js','../src/auth/ProfileEditScreen.js','../src/diary/screens/ProfileScreen.js'])visit(babel.parseSync(readFileSync(new URL(path,import.meta.url),'utf8'),{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}}))
})

test('구글 기존 회원은 프로필 입력 없이 바로 로그인한다',async()=>{
 const ui=setup({social:async()=>({mode:'authenticated',provider:'google',userId:'7',email:'user@gmail.com'})});
 try {find(ui.render(),'구글로 로그인').props.onPress();await tick();assert.equal(ui.sessions[0].provider,'google');assert.equal(find(ui.render(),'닉네임'),undefined);}finally{ui.unmount();}
});

test('구글 로그인도 기존 개발 서버 인증 화면에서 재시도한다',async()=>{
 let count=0,configured=false;const service={verificationService:{setDevelopmentAccess(){configured=true;}},social:async()=>{if(++count===1)throw Object.assign(new Error('개발 서버 접근 인증'),{code:'DEVELOPMENT_ACCESS_REQUIRED'});return {mode:'authenticated',provider:'google',userId:'7',email:'user@gmail.com'};}};
 const ui=setup(service,undefined,{developmentMode:true,emailVerificationEnabled:true});
 try{
 find(ui.render(),'구글로 로그인').props.onPress();await tick();
 find(ui.render(),'개발 서버 ID').props.onChange('tester');find(ui.render(),'개발 서버 비밀번호').props.onChange('secret');
 assert.equal(find(ui.render(),'접속 인증 후 로그인').props.disabled,false);find(ui.render(),'접속 인증 후 로그인').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(configured,true);assert.equal(ui.sessions[0].provider,'google');
 }finally{ui.unmount();}
});

for (const failure of ['local-expiry', 'server-rejection']) test(`가입 인증 복구는 닉네임·사진·앞쪽 약관 선택을 유지한다: ${failure}`, async () => {
 let time=0, verified=0, rejected=false;
 const calls=[], uploads=[];
 const service=createAuthApi({baseUrl:'https://server.example',now:()=>time,
  buildPhotoBody:async(body,uri)=>{uploads.push(uri);return{body:JSON.stringify(body),dispose:async()=>{}}},
  fetchImpl:async(url,init)=>{
   const path=url.split('/auth/')[1],body=JSON.parse(init.body);calls.push({path,body});
   let status=200,data={available:true};
   if(path==='email-verifications')data={expiresIn:600,resendAfter:60};
   if(path==='email-verifications/verify')data={signupToken:`token-${++verified}`,expiresIn:3600};
   if(path==='signup'){
    if(failure==='server-rejection'&&!rejected){rejected=true;status=400;data={code:'INVALID_SIGNUP_TOKEN',detail:'다시 인증해 주세요.'}}
    else {status=201;data={userId:'7',email:body.email,nickname:body.nickname,profilePhotoUrl:null}}
   }
   return{status,ok:status<400,json:async()=>data};
  }});
 const ui=setup(service,async()=> 'file:///selected-profile.jpg');
 try{
  find(ui.render(),'회원가입').props.onPress();
  find(ui.render(),'만 14세 이상입니다').props.onPress();
  find(ui.render(),'필수 항목 전체 동의').props.onPress();
  find(ui.render(),`[선택] ${marketingDocuments[0].label}`).props.onPress();
  find(ui.render(),'동의하고 계속').props.onPress();
  find(ui.render(),'이메일').props.onChange('new@example.com');
  find(ui.render(),'비밀번호').props.onChange('Password123');
  find(ui.render(),'비밀번호 확인').props.onChange('Password123');
  find(ui.render(),'다음').props.onPress();
  let step=nodes(ui.render()).find(n=>n.type==='./EmailVerification');
  await step.props.service.verify('new@example.com','123456');step.props.onComplete();await tick();
  assert.equal(find(ui.render(),'필수 항목 전체 동의'),undefined);
  find(ui.render(),'닉네임').props.onChange('유지할이름');
  find(ui.render(),'프로필 사진 선택').props.onPress();await tick();
  if(failure==='local-expiry')time=3600000;
  find(ui.render(),'가입 완료').props.onPress();await tick();
  step=nodes(ui.render()).find(n=>n.type==='./EmailVerification');assert.ok(step);
  assert.ok(nodes(ui.render()).some(n=>typeof n.props.children==='string'&&n.props.children.includes('입력한 내용은 유지')));
  assert.equal(calls.filter(c=>c.path==='signup').length,failure==='local-expiry'?0:1);
  await step.props.service.send('new@example.com');
  await step.props.service.verify('new@example.com','654321');step.props.onComplete();await tick();
  assert.equal(find(ui.render(),'닉네임').props.value,'유지할이름');
  assert.equal(find(ui.render(),'선택한 프로필 사진').props.source.uri,'file:///selected-profile.jpg');
  assert.equal(find(ui.render(),'가입 완료').props.disabled,false);
  find(ui.render(),'가입 완료').props.onPress();await tick();
  assert.ok(find(ui.render(),'로그인'));
  const body=calls.filter(c=>c.path==='signup').at(-1).body;
  assert.equal(body.signupToken,'token-2');assert.equal(body.nickname,'유지할이름');assert.equal(body.ageConfirmed,true);
  assert.equal(body.agreements.find(t=>t.termsType==='SERVICE').agreed,true);
  assert.equal(body.agreements.find(t=>t.termsType==='PRIVACY').agreed,true);
  assert.equal(body.agreements.find(t=>t.termsType==='MARKETING_PRIVACY').agreed,true);
  assert.equal(body.agreements.find(t=>t.termsType==='AD_EMAIL').agreed,false);
  assert.ok(uploads.every(uri=>uri==='file:///selected-profile.jpg'));
 }finally{ui.unmount()}
});

test('인증 완료 화면에서 가입 준비 전에 만료돼도 인증번호를 다시 받을 수 있다', async () => {
 let time=0;
 const service=createAuthApi({baseUrl:'https://server.example',now:()=>time,fetchImpl:async(url)=>({status:200,ok:true,json:async()=>url.endsWith('/verify')?{signupToken:'token',expiresIn:3600}:{available:true}})});
 const ui=setup(service);
 try{
  enterSignup(ui);
  find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123');
  find(ui.render(),'다음').props.onPress();
  const original=nodes(ui.render()).find(n=>n.type==='./EmailVerification');
  await original.props.service.verify('new@example.com','123456');time=3600000;
  original.props.onComplete();await tick();
  const retry=nodes(ui.render()).find(n=>n.type==='./EmailVerification');
  assert.ok(retry);assert.notEqual(retry.key,original.key);
  assert.equal(find(ui.render(),'닉네임'),undefined);
 }finally{ui.unmount()}
});

for(const choices of [{service:false,privacy:false},{service:true,privacy:false},{service:false,privacy:true},{service:true,privacy:true}])
 test(`연령 확인 뒤 필수 약관 미동의는 다음 단계로 진행할 수 없다: ${JSON.stringify(choices)}`,()=>{
 const ui=setup({});
 try{
  find(ui.render(),'회원가입').props.onPress();find(ui.render(),'만 14세 이상입니다').props.onPress();
  if(choices.service)find(ui.render(),'[필수] 이용약관 동의').props.onPress();
  if(choices.privacy)find(ui.render(),'[필수] 개인정보 수집·이용 동의').props.onPress();
  const allowed=choices.service&&choices.privacy;
  assert.equal(find(ui.render(),'동의하고 계속').props.disabled,!allowed);
  find(ui.render(),'동의하고 계속').props.onPress();
  assert.equal(!!find(ui.render(),'이메일'),allowed);
 }finally{ui.unmount()}
});

test('가입 초안 유실 시 입력 화면에서 복구하고 닉네임·사진·동의를 이어간다',async()=>{
 const bodies=[];
 const service=createAuthApi({baseUrl:'https://server.example',
  buildPhotoBody:async(body)=>({body:JSON.stringify(body),dispose:async()=>{}}),
  fetchImpl:async(url,init)=>{const body=JSON.parse(init.body);const path=url.split('/auth/')[1];
   if(path==='signup')bodies.push(body);
   const data=path==='email-verifications/verify'?{signupToken:'new-token',expiresIn:3600}
    :path==='signup'?{userId:'7',email:body.email,nickname:body.nickname,profilePhotoUrl:null}:{available:true};
   return{status:200,ok:true,json:async()=>data};
  }});
 const ui=setup(service,async()=> 'file:///draft-photo.jpg');
 try{
  enterSignup(ui);
  find(ui.render(),'이메일').props.onChange('new@example.com');find(ui.render(),'비밀번호').props.onChange('Password123');find(ui.render(),'비밀번호 확인').props.onChange('Password123');
  find(ui.render(),'다음').props.onPress();
  let step=nodes(ui.render()).find(n=>n.type==='./EmailVerification');
  await step.props.service.verify('new@example.com','123456');step.props.onComplete();await tick();
  find(ui.render(),'닉네임').props.onChange('이어갈이름');find(ui.render(),'프로필 사진 선택').props.onPress();await tick();
  service.cancelPending();
  find(ui.render(),'가입 완료').props.onPress();await tick();
  assert.equal(nodes(ui.render()).some(n=>n.type==='./EmailVerification'),false);
  assert.equal(find(ui.render(),'이메일').props.value,'new@example.com');
  assert.equal(find(ui.render(),'비밀번호').props.value,'Password123');
  find(ui.render(),'다음').props.onPress();
  step=nodes(ui.render()).find(n=>n.type==='./EmailVerification');
  await step.props.service.verify('new@example.com','654321');step.props.onComplete();await tick();
  assert.equal(find(ui.render(),'닉네임').props.value,'이어갈이름');
  assert.equal(find(ui.render(),'선택한 프로필 사진').props.source.uri,'file:///draft-photo.jpg');
  find(ui.render(),'가입 완료').props.onPress();await tick();
  assert.equal(bodies.length,1);assert.equal(bodies[0].agreements.find(t=>t.termsType==='PRIVACY').agreed,true);
  assert.ok(find(ui.render(),'로그인'));
 }finally{ui.unmount()}
});
