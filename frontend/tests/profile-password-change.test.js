import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as profileNavigation from '../src/diary/components/profileNavigationModel.js';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/screens/ProfileScreen.js',import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]
}).code;
let logins=[];let recoveryCalls=[];const recoveryMarker=()=>{};
function setup(user,onUpdatePreview,onClearSession,extra={}){
 const values=[];let cursor=0;const effects=[];const mod={exports:{}};const PasswordForm=()=>null;const service={changePassword(){}};
 const load=id=>{
  if(id==='react')return {useEffect:(effect,deps)=>effects.push({effect,deps}),useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=v]}};
  if(id==='react-native')return {Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:v=>v},useWindowDimensions:()=>extra.windowSize||{width:411,height:914,fontScale:1}};
  if(id==='expo-image')return {Image:'Image'};
  if(id==='../styles')return {styles:{}};
  if(id==='../../shared/theme')return {colors:{},radius:{}};
  if(id==='../constants')return {C:new Proxy({},{get:()=>''})};
  if(id==='../../auth/ProfileEditScreen')return PasswordForm;
  if(id==='../../auth/PasswordResetScreen')return PasswordForm;
  if(id==='../../auth/authService')return {authService:service};
  if(id==='../../auth/loginGate')return {useLoginEntry:()=>()=>logins.push('login')};
  if(id==='../../shared/appLock')return {appLockScope:()=>'scope',appLockSupported:true,readAppLockState:async()=>'off',hasAppLock:async()=>false,checkAppLockStatus:async()=>({ok:true,retryAfterMs:0}),clearAppLock:async()=>{},setAppLock:async()=>{}};
  if(id==='../components/appLockRecovery')return {appLockRecoveryAction:args=>{recoveryCalls.push(args);return recoveryMarker}};
  if(id==='../components/NotificationSetting')return 'NotificationSetting';
  if(id==='../components/AppLockSetting')return 'AppLockSetting';
  if(id==='../components/AppInformation')return 'AppInformation';
  if(id==='../components/EditSetting')return 'EditSetting';
  if(id==='../components/profileNavigationModel')return profileNavigation;
  if(id==='react/jsx-runtime')return require(id);
  return ()=>null;
 };
 new Function('require','module','exports',code)(load,mod,mod.exports);
 return {service,PasswordForm,effects,render(){cursor=0;effects.length=0;return mod.exports.default({diaries:[],previewUser:user,accountService:service,onEndPreview(){},onClearSession,onUpdatePreview,...extra})}};
}
function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label||node.props?.label===label)return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,label);if(found)return found;}return null;}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
test('실제 이메일 계정은 회원정보 수정의 비밀번호 변경에서 인증번호 기반 재설정 화면으로 가고 인증 서비스를 전달한다',()=>{
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'});
 assert.ok(find(ui.render(),'회원정보 수정'));assert.equal(find(ui.render(),'비밀번호 변경'),null); // 내 공간 홈에는 따로 두지 않는다
 find(ui.render(),'회원정보 수정').props.onPress();
 const edit=ui.render();assert.equal(edit.type,ui.PasswordForm);assert.equal(typeof edit.props.onPasswordReset,'function');
 edit.props.onPasswordReset();
 const form=ui.render();assert.equal(form.type,ui.PasswordForm);assert.equal(form.props.service,ui.service);assert.equal(form.props.email,'member@example.com');
 form.props.onClose();assert.ok(find(ui.render(),'회원정보 수정'));
});
test('비밀번호 재설정 완료는 서버 로그아웃 대신 로컬 세션 정리로 끝낸다',()=>{
 let cleared=0;
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'},undefined,()=>{cleared+=1});
 find(ui.render(),'회원정보 수정').props.onPress();
 ui.render().props.onPasswordReset();
 const form=ui.render();
 form.props.onComplete();
 assert.equal(cleared,1);
});
test('실제 이메일 계정의 회원정보 수정은 체험 서비스가 아닌 인증 서비스를 사용한다',()=>{
 let cleared=0;
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'},undefined,()=>{cleared+=1});
 find(ui.render(),'회원정보 수정').props.onPress();
 const form=ui.render();form.props.onEndSession();assert.equal(cleared,1); // 탈퇴 · 비밀번호 변경도 서버 로그아웃 없이 이 기기 세션만 정리
 assert.equal(form.type,ui.PasswordForm);assert.equal(form.props.service,ui.service);assert.equal(form.props.onEndSession,ui.render().props.onEndSession);
});
test('게스트·기존 체험 세션에는 계정 설정을 숨기고 소셜 계정에는 비밀번호 변경을 숨긴다',()=>{
 for(const user of [{provider:'guest'},{mode:'preview',provider:'email',userId:'legacy'}]){
  const screen=setup(user).render();assert.equal(find(screen,'회원정보 수정'),null);assert.equal(find(screen,'비밀번호 변경'),null);
 }
 const social=setup({mode:'authenticated',provider:'google',userId:'8'}).render();assert.ok(find(social,'회원정보 수정'));assert.equal(find(social,'비밀번호 변경'),null);
});
test('내 공간에 들어오면 서버 회원정보로 화면 사용자 정보를 갱신한다',async()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'};const updates=[];
 const ui=setup(user,profile=>updates.push(profile));const fresh={...user,nickname:'새닉네임'};let asked=null;
 ui.service.getProfile=async requested=>{asked=requested;return fresh};
 ui.render();const refresh=ui.effects.find(entry=>entry.deps?.[1]==='home');assert.deepEqual(refresh.deps,['7','home',false]);
 refresh.effect();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(asked,user);assert.deepEqual(updates,[fresh]);
 ui.service.getProfile=async()=>{throw new Error('offline')};updates.length=0;
 const cleanup=refresh.effect();cleanup();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(updates,[]);
});
test('설정에는 알림·보안·앱 정보를, 마이페이지에는 계정 정보만 표시한다',()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'};
 const settings=setup(user,undefined,undefined,{section:'settings'}).render();
 const settingTypes=nodes(settings).map(node=>node.type);
 assert.ok(settingTypes.includes('NotificationSetting'));
 assert.ok(settingTypes.includes('AppLockSetting'));
 assert.ok(settingTypes.includes('AppInformation'));
 assert.equal(find(settings,'회원정보 수정'),null);
 assert.equal(find(settings,'로그아웃'),null);
 const profile=setup(user).render();
 const profileTypes=nodes(profile).map(node=>node.type);
 assert.ok(!profileTypes.includes('NotificationSetting'));
 assert.ok(!profileTypes.includes('AppLockSetting'));
 assert.ok(!profileTypes.includes('AppInformation'));
 assert.ok(find(profile,'회원정보 수정'));
 assert.ok(find(profile,'로그아웃'));
});
test('내 공간 노출: 게스트는 프로필 수정 · 로그아웃이 없고, 회원은 둘 다 보인다',()=>{
 const guest=setup({mode:'preview',provider:'guest',nickname:'방문자'}).render()
 assert.equal(find(guest,'프로필 수정'),null);assert.equal(find(guest,'회원정보 수정'),null);assert.equal(find(guest,'로그아웃'),null);assert.equal(find(guest,'비밀번호 변경'),null)
 const member=setup({mode:'authenticated',userId:'7',provider:'email',email:'m@example.com'}).render()
 assert.ok(find(member,'로그아웃'));assert.ok(find(member,'회원정보 수정'))
})
test('게스트 내 공간: 판 안의 로그인 · 회원가입 버튼 하나가 로그인 화면을 연다. 회원에게는 없다',()=>{
 logins=[]
 const guest=setup({mode:'preview',provider:'guest',nickname:'방문자'}).render()
 find(guest,'로그인 · 회원가입').props.onPress()
 assert.deepEqual(logins,['login'])
 const member=setup({mode:'authenticated',userId:'7',provider:'email',email:'m@example.com'}).render()
 assert.equal(find(member,'로그인 · 회원가입'),null)
})
test('설정의 앱 잠금 PIN 화면: 잊었어요는 지금 비밀번호 확인(verify)에만 두고 새 비밀번호(setup)에는 두지 않는다',()=>{
 recoveryCalls=[];
 const user={mode:'authenticated',userId:'7',provider:'email',email:'m@example.com'};
 const ui=setup(user,undefined,undefined,{section:'settings'});
 const lockSetting=()=>nodes(ui.render()).find(node=>node.type==='AppLockSetting');
 const pin=()=>nodes(ui.render()).find(node=>node.props?.mode==='setup'||node.props?.mode==='verify');
 lockSetting().props.onTurnOff();
 assert.equal(pin().props.mode,'verify');assert.equal(pin().props.onForgot,recoveryMarker);
 pin().props.onCancel();
 lockSetting().props.onTurnOn();
 assert.equal(pin().props.mode,'setup');assert.equal(pin().props.onForgot,undefined);
 // 회원은 로그아웃 흐름, 잠금 범위는 이 계정
 const args=recoveryCalls.at(-1);assert.equal(args.member,true);assert.equal(args.scope,'scope');assert.equal(typeof args.onLogout,'function');
});
test('게스트 설정은 회원이 아닌 초기화 경로에 읽은 잠금 상태를 넘긴다',()=>{
 recoveryCalls=[];
 const ui=setup({mode:'preview',provider:'guest',accountId:'g1'},undefined,undefined,{section:'settings'});
 ui.render();
 assert.equal(recoveryCalls.at(-1).member,false);assert.equal(recoveryCalls.at(-1).state,null);
 assert.equal(typeof recoveryCalls.at(-1).onCleared,'function');
});
const order=(tree)=>nodes(tree).map(node=>typeof node.type==='string'&&node.type!=='View'&&node.type!=='Text'&&node.type!=='Pressable'?node.type:node.props?.title).filter(Boolean);
const texts=tree=>nodes(tree).filter(node=>node.type==='Text').map(node=>[node.props.children].flat(Infinity).join(''));
test('폰 마이페이지는 설정을 안에 펼친다: 사용자 관리 → 알림 → 보안 → 편집 → 앱 정보 → 계정 순, 톱니 버튼 없음',()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'};
 const phone=setup(user,undefined,undefined,{compact:true}).render();
 assert.deepEqual(order(phone).filter(x=>['사용자 관리','NotificationSetting','AppLockSetting','EditSetting','AppInformation','계정'].includes(x)),['사용자 관리','NotificationSetting','AppLockSetting','EditSetting','AppInformation','계정']);
 assert.equal(find(phone,'설정'),null);
 assert.ok(find(phone,'로그아웃'));assert.ok(find(phone,'차단한 사용자'));
 // 태블릿 프로필 화면은 그대로: 설정 묶음 없음
 const tablet=setup(user).render();
 assert.ok(!order(tablet).includes('NotificationSetting'));assert.ok(!order(tablet).includes('EditSetting'));
 // 태블릿 설정 화면도 그대로: 계정 · 프로필 없음
 const tabletSettings=setup(user,undefined,undefined,{section:'settings'}).render();
 assert.ok(order(tabletSettings).includes('EditSetting'));assert.equal(find(tabletSettings,'로그아웃'),null);assert.equal(find(tabletSettings,'차단한 사용자'),null);
});
test('폰 마이페이지의 알림 설정 하위 화면은 안드로이드 뒤로 키 처리를 등록하고 마이페이지 본문으로 돌아온다',()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'};
 const registered=[];const registerLeaveGuard=(guard,back)=>{registered.push({guard,back});return()=>{}};
 const ui=setup(user,undefined,undefined,{compact:true,registerLeaveGuard});
 const home=ui.render();find(home,'알림 설정').props.onPress();
 const sub=ui.render();assert.notEqual(find(sub,'알림 설정')?.props.accessibilityLabel,'알림 설정');
 const guardEffect=ui.effects.find(entry=>entry.deps?.[0]===true&&entry.deps?.[1]===registerLeaveGuard);
 guardEffect.effect();assert.equal(registered.length,1);
 let moved=0;registered[0].guard(()=>moved++);assert.equal(moved,1);
 registered[0].back();assert.ok(find(ui.render(),'로그아웃'));
});
test('게스트 프로필 칸에는 한 줄 소개를 보이지 않고, 회원은 그대로 보인다(폰 · 태블릿)',()=>{
 for(const compact of [true,false]){
  const guest=setup({mode:'preview',provider:'guest',nickname:'방문자'},undefined,undefined,{compact}).render();
  assert.ok(!texts(guest).some(t=>t.includes('기록 공간')));assert.ok(texts(guest).includes('방문자'));
  const member=setup({mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원'},undefined,undefined,{compact}).render();
  assert.ok(texts(member).includes('회원님의 기록 공간'));
 }
});
test('폰에서는 저장된 settings 화면을 마이페이지로 읽고 태블릿 값은 바꾸지 않는다',()=>{
 assert.equal(profileNavigation.normalizePageForFormFactor('settings',true),'profile');
 assert.equal(profileNavigation.normalizePageForFormFactor('settings',false),'settings');
 for(const page of ['library','studio','profile','trash','editor'])for(const phone of [true,false])assert.equal(profileNavigation.normalizePageForFormFactor(page,phone),page);
 assert.equal(profileNavigation.showsInlineSettings({compact:true,section:'profile'}),true);
 assert.equal(profileNavigation.showsInlineSettings({compact:false,section:'profile'}),false);
 assert.equal(profileNavigation.showsInlineSettings({compact:false,section:'settings'}),false);
});

test('게스트는 앱 잠금을 새로 켤 수 없다(이미 켠 게스트는 끌 수 있게 남긴다), 회원은 켤 수 있다',async()=>{
  const guest=setup({mode:'preview',provider:'guest',nickname:'방문자'},undefined,undefined,{compact:true});
  assert.equal(nodes(guest.render()).find(node=>node.type==='AppLockSetting'),undefined);
  const source=readFileSync(new URL('../src/diary/screens/ProfileScreen.js',import.meta.url),'utf8');
  assert.match(source,/\(\(appLockSupported !== false && !guest\) \|\| locked\) && <AppLockSetting/);
  assert.match(source,/canEnable=\{appLockSupported !== false && !guest\}/);
});

test('옮기기 입구는 마이페이지에만 있고 누르면 옮기기를 연다(폰 · 태블릿), 옮길 것이 없으면 없다',()=>{
  const label='이 기기의 다이어리 2권 옮기기', member={mode:'authenticated',userId:7,nickname:'회원',email:'a@b.c'};
  for(const compact of [true,false]){
    let opened=0;
    const tree=setup(member,undefined,undefined,{compact,guestImport:{count:2,open:()=>{opened+=1}}}).render();
    const row=nodes(tree).find(node=>node.props?.accessibilityLabel===label);
    assert.ok(row); row.props.onPress(); assert.equal(opened,1);
    assert.equal(nodes(setup(member,undefined,undefined,{compact}).render()).find(node=>node.props?.accessibilityLabel===label),undefined);
    assert.equal(nodes(setup(member,undefined,undefined,{compact,section:'settings',guestImport:{count:2,open(){}}}).render()).find(node=>node.props?.accessibilityLabel===label),undefined);
  }
  assert.ok(!readFileSync(new URL('../src/diary/screens/LibraryScreen.js',import.meta.url),'utf8').includes('guestImport'));
});

test('폰 게스트 로그인 버튼은 넉넉하면 이름 옆, 좁거나 글자가 크면 이름 아래 전폭이고 하나만 그린다',()=>{
  const guest={mode:'preview',provider:'guest',nickname:'방문자'};
  const login=windowSize=>nodes(setup(guest,undefined,undefined,{compact:true,windowSize}).render()).filter(node=>node.props?.label==='로그인 · 회원가입');
  for(const [windowSize,block] of [[{width:340,height:800,fontScale:1},false],[{width:339,height:800,fontScale:1},true],[{width:411,height:914,fontScale:1.3},true]]){
    const rows=login(windowSize);
    assert.equal(rows.length,1);
    assert.equal(Boolean(rows[0].props.block),block);
  }
});
