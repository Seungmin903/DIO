import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as profileNavigation from '../src/diary/components/profileNavigationModel.js';
import * as featureFlags from '../src/shared/featureFlags.js';
import * as validation from '../src/auth/validation.js';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/screens/ProfileScreen.js',import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]
}).code;
let logins=[];let recoveryCalls=[];const recoveryMarker=()=>{};
function setup(user,onUpdatePreview,onClearSession,extra={}){
 const values=[];let cursor=0;const refs=[];let refCursor=0;const effects=[];const mod={exports:{}};const PasswordForm=()=>null;const WithdrawForm=()=>null;const saved=[];const service={changePassword(){},verifyAccount(){},updateProfile:async(current,changes)=>{saved.push(changes);if(extra.holdSave)await extra.holdSave;if(extra.failSave)throw new Error(extra.failSave);return {...current,nickname:changes.nickname,photoUri:changes.photoUri}}};const notices=[]; // 실제 authService 처럼 계정 확인(verifyAccount)이 있다(지라 799)
 const load=id=>{
  if(id==='react')return {useRef:initial=>{const i=refCursor++;if(!(i in refs))refs[i]={current:initial};return refs[i]},useEffect:(effect,deps)=>effects.push({effect,deps}),useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=typeof v==="function"?v(values[i]):v]}};
  if(id==='react-native')return {Platform:{OS:extra.platform||'android'},TextInput:'TextInput',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:v=>v},useWindowDimensions:()=>extra.windowSize||{width:411,height:914,fontScale:1}};
  if(id==='expo-image')return {Image:'Image'};
  if(id==='../styles')return {styles:{}};
  if(id==='../../shared/theme')return {colors:{},radius:{}};
  if(id==='../../shared/featureFlags')return featureFlags;
  if(id==='../constants')return {C:new Proxy({},{get:()=>''})};
  if(id==='../../auth/WithdrawDialog')return WithdrawForm;
  if(id==='../../auth/validation')return validation;
  if(id==='../../auth/profilePhoto')return {pickProfilePhoto:async()=>null};
  if(id==='../components/DiaryActionBubble')return 'DiaryActionBubble';
  if(id==='../../shared/dialogs')return {notify:(title,message)=>notices.push([title,message]),confirmAction(){}};
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
 return {service,saved,notices,PasswordForm,WithdrawForm,effects,unmount(){for(const entry of effects)if(entry.deps?.length===0)entry.effect()?.();},render(){cursor=0;refCursor=0;effects.length=0;return mod.exports.default({diaries:[],previewUser:user,accountService:service,onEndPreview(){},onClearSession,onUpdatePreview,...extra})}};
}
function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label||node.props?.label===label)return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,label);if(found)return found;}return null;}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
test('842: 프로필 수정 화면 없이 계정 구역의 비밀번호 변경이 인증번호 기반 재설정 화면을 열고, 닫으면 마이페이지로 돌아온다',()=>{
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'});
 assert.equal(find(ui.render(),'회원정보 수정'),null);
 assert.ok(find(ui.render(),'로그인 계정: member@example.com'));
 find(ui.render(),'비밀번호 변경').props.onPress();
 const form=ui.render();assert.equal(form.type,ui.PasswordForm);assert.equal(form.props.service,ui.service);assert.equal(form.props.email,'member@example.com');
 assert.equal(form.props.backLabel,'마이페이지로 돌아가기');
 form.props.onClose();assert.ok(find(ui.render(),'로그아웃'));
});
test('비밀번호 재설정 완료는 서버 로그아웃 대신 로컬 세션 정리로 끝낸다',()=>{
 let cleared=0;
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'},undefined,()=>{cleared+=1});
 find(ui.render(),'비밀번호 변경').props.onPress();
 ui.render().props.onComplete();
 assert.equal(cleared,1);
});
test('회원 탈퇴 줄은 탈퇴 확인 창(WithdrawDialog)만 열고 인증 서비스 · 세션 정리를 넘긴다',()=>{
 let withdrawn=0;const account={changePassword(){},verifyAccount(){},updateProfile(){},withdraw(){}};
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'},undefined,undefined,{onWithdrawn:()=>{withdrawn+=1},accountService:account});
 find(ui.render(),'회원 탈퇴').props.onPress();
 const dialog=nodes(ui.render()).find(node=>node.type===ui.WithdrawForm);
 assert.ok(dialog);assert.equal(dialog.props.service,account);dialog.props.onEndSession();assert.equal(withdrawn,1); // 탈퇴는 서버 로그아웃 없이 이 기기 세션만 정리
 dialog.props.onClose();assert.equal(nodes(ui.render()).some(node=>node.type===ui.WithdrawForm),false);
});
test('게스트·기존 체험 세션에는 프로필 수정 · 계정 정보를 숨기고 소셜 계정에는 비밀번호 변경을 숨긴다',()=>{
 for(const user of [{provider:'guest'},{mode:'preview',provider:'email',userId:'legacy'}]){
  const screen=setup(user).render();
  for(const label of ['닉네임 수정','프로필 사진 변경','비밀번호 변경'])assert.equal(find(screen,label),null);
 }
 const social=setup({mode:'authenticated',provider:'google',userId:'8',nickname:'구글'}).render();
 assert.ok(find(social,'닉네임 수정'));assert.ok(find(social,'프로필 사진 변경'));assert.equal(find(social,'비밀번호 변경'),null);
 assert.ok(find(social,'로그인 계정: 구글 계정'));
 assert.ok(find(setup({mode:'authenticated',provider:'kakao',userId:'9',email:'k@kakao.com'}).render(),'로그인 계정: 카카오 · k@kakao.com'));
});
test('842: 닉네임은 수정을 누르면 그 자리 입력으로 바뀌고, 저장하면 닉네임만 바꿔 서버에 보낸다',async()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원',photoUri:'https://server/p.jpg'};const updates=[];
 const ui=setup(user,profile=>updates.push(profile));
 assert.equal(find(ui.render(),'닉네임'),null);
 find(ui.render(),'닉네임 수정').props.onPress();
 const input=find(ui.render(),'닉네임');assert.equal(input.type,'TextInput');assert.equal(input.props.value,'회원');assert.equal(input.props.maxLength,12);
 // 규칙에 맞지 않으면 저장할 수 없고 이유를 이름 아래에 적는다
 input.props.onChangeText('a');assert.equal(find(ui.render(),'닉네임 저장').props.disabled,true);
 assert.ok(nodes(ui.render()).some(node=>node.props?.accessibilityRole==='alert'));
 // 취소하면 입력이 닫히고 그대로다
 find(ui.render(),'닉네임 수정 취소').props.onPress();assert.equal(find(ui.render(),'닉네임'),null);assert.deepEqual(ui.saved,[]);
 find(ui.render(),'닉네임 수정').props.onPress();find(ui.render(),'닉네임').props.onChangeText(' 새이름 ');
 assert.equal(find(ui.render(),'닉네임 저장').props.disabled,false);
 await find(ui.render(),'닉네임 저장').props.onPress();
 assert.deepEqual(ui.saved,[{nickname:'새이름',photoUri:'https://server/p.jpg'}]);
 assert.equal(updates[0].nickname,'새이름');assert.equal(find(ui.render(),'닉네임'),null);
});
test('842: 닉네임 저장이 실패하면 입력을 그대로 두고 서버 문구를 보여 준다',async()=>{
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원'},undefined,undefined,{failSave:'이미 사용 중인 닉네임이에요.'});
 find(ui.render(),'닉네임 수정').props.onPress();find(ui.render(),'닉네임').props.onChangeText('중복이름');
 await find(ui.render(),'닉네임 저장').props.onPress();
 assert.equal(find(ui.render(),'닉네임').props.value,'중복이름');
 assert.ok(texts(ui.render()).includes('이미 사용 중인 닉네임이에요.'));
});
test('842: 프로필 오른쪽 아래 펜은 앨범에서 선택 · 기본 이미지로 변경 말풍선을 열고, 고르면 사진만 바꿔 바로 저장한다',async()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원'};
 const ui=setup(user,undefined,undefined,{photoPicker:async()=>'file:///new.jpg'});
 find(ui.render(),'프로필 사진 변경').props.onPress();
 const bubble=()=>nodes(ui.render()).find(node=>node.type==='DiaryActionBubble');
 const actions=bubble().props.actions;
 assert.deepEqual(actions.map(action=>action.text),['앨범에서 선택','기본 이미지로 변경']);
 assert.equal(actions[1].disabled,true); // 이미 기본 이미지
 actions[0].onPress();assert.equal(bubble(),undefined);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(ui.saved,[{nickname:'회원',photoUri:'file:///new.jpg'}]);
 // 앨범을 그냥 닫으면 저장하지 않는다
 const closed=setup(user,undefined,undefined,{photoPicker:async()=>null});
 find(closed.render(),'프로필 사진 변경').props.onPress();nodes(closed.render()).find(node=>node.type==='DiaryActionBubble').props.actions[0].onPress();
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(closed.saved,[]);
 // 사진이 있으면 기본 이미지로 되돌릴 수 있다
 const withPhoto=setup({...user,photoUri:'https://server/p.jpg'});
 find(withPhoto.render(),'프로필 사진 변경').props.onPress();
 const reset=nodes(withPhoto.render()).find(node=>node.type==='DiaryActionBubble').props.actions[1];
 assert.equal(reset.disabled,false);reset.onPress();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(withPhoto.saved,[{nickname:'회원',photoUri:null}]);
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
 assert.equal(find(settings,'닉네임 수정'),null);
 assert.equal(find(settings,'로그아웃'),null);
 const profile=setup(user).render();
 const profileTypes=nodes(profile).map(node=>node.type);
 assert.ok(!profileTypes.includes('NotificationSetting'));
 assert.ok(!profileTypes.includes('AppLockSetting'));
 assert.ok(!profileTypes.includes('AppInformation'));
 assert.ok(find(profile,'닉네임 수정'));
 assert.ok(find(profile,'로그아웃'));
});
test('내 공간 노출: 게스트는 프로필 수정 · 로그아웃이 없고, 회원은 둘 다 보인다',()=>{
 const guest=setup({mode:'preview',provider:'guest',nickname:'방문자'}).render()
 assert.equal(find(guest,'닉네임 수정'),null);assert.equal(find(guest,'프로필 사진 변경'),null);assert.equal(find(guest,'로그아웃'),null);assert.equal(find(guest,'비밀번호 변경'),null)
 const member=setup({mode:'authenticated',userId:'7',provider:'email',email:'m@example.com'}).render()
 assert.ok(find(member,'로그아웃'));assert.ok(find(member,'닉네임 수정'));assert.ok(find(member,'프로필 사진 변경'))
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
 // 회원은 계정으로 다시 확인하는 흐름(지라 799), 잠금 범위는 이 계정
 const args=recoveryCalls.at(-1);assert.equal(args.member,true);assert.equal(args.scope,'scope');assert.equal(typeof args.onReauth,'function');assert.equal(args.onLogout,undefined);
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
 const home=ui.render();find(home,'마케팅 수신 설정').props.onPress();
 const sub=ui.render();assert.equal(find(sub,'마케팅 수신 설정'),null);
 const guardEffect=ui.effects.find(entry=>entry.deps?.[0]===true&&entry.deps?.[1]===registerLeaveGuard);
 guardEffect.effect();assert.equal(registered.length,1);
 let moved=0;registered[0].guard(()=>moved++);assert.equal(moved,1);
 registered[0].back();assert.ok(find(ui.render(),'로그아웃'));
});
test('842: 프로필 칸에는 한 줄 소개 줄이 없다(게스트 · 회원, 폰 · 태블릿)',()=>{
 for(const compact of [true,false]){
  const guest=setup({mode:'preview',provider:'guest',nickname:'방문자'},undefined,undefined,{compact}).render();
  assert.ok(!texts(guest).some(t=>t.includes('기록 공간')));assert.ok(texts(guest).includes('방문자'));
  const member=setup({mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원',bio:'예전 소개'},undefined,undefined,{compact}).render();
  assert.ok(!texts(member).some(t=>t.includes('기록 공간')||t.includes('예전 소개')));assert.ok(texts(member).includes('회원'));
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

test('799: 앱 잠금은 회원만 — 게스트에게는 줄 자체가 없다(예전에 켠 잠금은 앱을 열 때 맞는 4자리로 열면 꺼진다), 회원은 켤 수 있다',async()=>{
  const guest=setup({mode:'preview',provider:'guest',nickname:'방문자'},undefined,undefined,{compact:true});
  assert.equal(nodes(guest.render()).find(node=>node.type==='AppLockSetting'),undefined);
  const source=readFileSync(new URL('../src/diary/screens/ProfileScreen.js',import.meta.url),'utf8');
  // 켤 수 있는 조건은 canEnableLock(지원 기기 · 회원) 하나로 두고, 줄 표시는 회원일 때 그 조건 또는 이미 켬(locked) · 읽기 실패 · 확인 중일 때다
  assert.match(source,/const canEnableLock = appLockSupported && authenticatedUser;/);
  assert.match(source,/const showLockSetting = authenticatedUser && \(canEnableLock \|\| locked \|\| lockReadFailed/);
  assert.match(source,/\{showLockSetting && <AppLockSetting/);
  assert.match(source,/canEnable=\{canEnableLock\}/);
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
  const library=readFileSync(new URL('../src/diary/screens/LibraryScreen.js',import.meta.url),'utf8');
  assert.match(library,/<EmptyState compact=\{compact\} raised title=\{emptyTitle\} action=\{emptyAction\} \/>/);
  assert.match(library,/emptyGuestImportAction\(guestImport, scope\?\.id, favoriteOnly\)/);
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

test('842 리뷰: 사진 저장 중에는 닉네임 수정 · 저장을, 닉네임 저장 중에는 펜을 막아 두 저장이 서로의 옛 값을 보내지 않는다',async()=>{
 let release;const hold=new Promise(resolve=>{release=resolve});
 const user={mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원'};
 const photo=setup(user,undefined,undefined,{holdSave:hold,photoPicker:async()=>'file:///new.jpg'});
 find(photo.render(),'닉네임 수정').props.onPress();find(photo.render(),'닉네임').props.onChangeText('새이름');
 find(photo.render(),'프로필 사진 변경').props.onPress();nodes(photo.render()).find(node=>node.type==='DiaryActionBubble').props.actions[0].onPress();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(find(photo.render(),'닉네임 저장').props.disabled,true);
 await find(photo.render(),'닉네임 저장').props.onPress();assert.equal(photo.saved.length,1); // 눌러도 두 번째 저장은 나가지 않는다
 release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(find(photo.render(),'닉네임 저장').props.disabled,false);
 let releaseName;const holdName=new Promise(resolve=>{releaseName=resolve});
 const name=setup(user,undefined,undefined,{holdSave:holdName});
 find(name.render(),'닉네임 수정').props.onPress();find(name.render(),'닉네임').props.onChangeText('새이름');
 const saving=find(name.render(),'닉네임 저장').props.onPress();
 assert.equal(find(name.render(),'프로필 사진 변경').props.disabled,true);
 releaseName();await saving;
 assert.equal(find(name.render(),'프로필 사진 변경').props.disabled,false);
});
test('842 리뷰: 사진 고르기가 실패하면 알림을 띄우고, 화면을 떠난 뒤 늦게 온 사진은 저장하지 않는다',async()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원'};
 const failed=setup(user,undefined,undefined,{photoPicker:async()=>{throw new Error('사진을 열지 못했어요.')}});
 find(failed.render(),'프로필 사진 변경').props.onPress();nodes(failed.render()).find(node=>node.type==='DiaryActionBubble').props.actions[0].onPress();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(failed.notices,[['프로필 사진','사진을 열지 못했어요.']]);assert.deepEqual(failed.saved,[]);
 assert.equal(find(failed.render(),'프로필 사진 변경').props.disabled,false); // 다시 시도할 수 있다
 let resolvePick;const updates=[];
 const late=setup(user,profile=>updates.push(profile),undefined,{photoPicker:()=>new Promise(resolve=>{resolvePick=resolve})});
 find(late.render(),'프로필 사진 변경').props.onPress();nodes(late.render()).find(node=>node.type==='DiaryActionBubble').props.actions[0].onPress();
 late.unmount();resolvePick('file:///late.jpg');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(late.saved,[]);assert.deepEqual(updates,[]);
});

test('842 리뷰: iOS 는 사진 말풍선이 다 닫힌(onDismiss) 뒤에 앨범을 열고, 닫힘 알림이 오지 않으면 2초 뒤 말풍선만 닫는다',async()=>{
 const user={mode:'authenticated',userId:'7',provider:'email',email:'m@example.com',nickname:'회원'};
 let picks=0;
 const ui=setup(user,undefined,undefined,{platform:'ios',photoPicker:async()=>{picks+=1;return 'file:///ios.jpg'}});
 const bubble=()=>nodes(ui.render()).find(node=>node.type==='DiaryActionBubble');
 find(ui.render(),'프로필 사진 변경').props.onPress();
 bubble().props.actions[0].onPress();
 // 말풍선은 닫히는 중(visible false)이고 앨범은 아직 열지 않는다
 assert.equal(bubble().props.visible,false);assert.equal(picks,0);
 bubble().props.onDismiss();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(picks,1);assert.equal(bubble(),undefined);assert.deepEqual(ui.saved,[{nickname:'회원',photoUri:'file:///ios.jpg'}]);
 // 닫힘 알림이 오지 않으면 고른 동작은 버리고 말풍선만 닫는다(다시 누를 수 있게)
 const lost=setup(user,undefined,undefined,{platform:'ios',photoPicker:async()=>{picks+=1;return 'file:///x.jpg'}});
 find(lost.render(),'프로필 사진 변경').props.onPress();
 nodes(lost.render()).find(node=>node.type==='DiaryActionBubble').props.actions[0].onPress();
 await new Promise(resolve=>setTimeout(resolve,2100));
 assert.equal(nodes(lost.render()).find(node=>node.type==='DiaryActionBubble'),undefined);
 assert.equal(picks,1);assert.deepEqual(lost.saved,[]);
});
