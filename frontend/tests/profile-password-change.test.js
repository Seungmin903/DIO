import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as profileNavigation from '../src/diary/components/profileNavigationModel.js';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/screens/ProfileScreen.js',import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]
}).code;
let logins=[];
function setup(user,onUpdatePreview,onClearSession,extra={}){
 const values=[];let cursor=0;const effects=[];const mod={exports:{}};const PasswordForm=()=>null;const service={changePassword(){}};
 const load=id=>{
  if(id==='react')return {useEffect:(effect,deps)=>effects.push({effect,deps}),useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=v]}};
  if(id==='react-native')return {Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:v=>v}};
  if(id==='expo-image')return {Image:'Image'};
  if(id==='../styles')return {styles:{}};
  if(id==='../../shared/theme')return {colors:{},radius:{}};
  if(id==='../constants')return {C:new Proxy({},{get:()=>''})};
  if(id==='../../auth/ProfileEditScreen')return PasswordForm;
  if(id==='../../auth/PasswordResetScreen')return PasswordForm;
  if(id==='../../auth/authService')return {authService:service};
  if(id==='../../auth/loginGate')return {useLoginEntry:()=>()=>logins.push('login')};
  if(id==='../../shared/appLock')return {appLockScope:()=>'scope',hasAppLock:async()=>false,checkAppLock:async()=>true,clearAppLock:async()=>{},setAppLock:async()=>{}};
  if(id==='../components/NotificationSetting')return 'NotificationSetting';
  if(id==='../components/AppLockSetting')return 'AppLockSetting';
  if(id==='../components/AppInformation')return 'AppInformation';
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
