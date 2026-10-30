import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/screens/ProfileScreen.js',import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]
}).code;
function setup(user){
 const values=[];let cursor=0;const mod={exports:{}};const PasswordForm=()=>null;const service={changePassword(){}};
 const load=id=>{
  if(id==='react')return {useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=v]}};
  if(id==='react-native')return {Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:v=>v}};
  if(id==='expo-image')return {Image:'Image'};
  if(id==='../styles')return {styles:{}};
  if(id==='../../shared/theme')return {colors:{},radius:{}};
  if(id==='../../auth/ProfileEditScreen')return PasswordForm;
  if(id==='../../handwriting/studioBus.js')return {openFontStudio(){}};
  if(id==='react/jsx-runtime')return require(id);
  return ()=>null;
 };
 new Function('require','module','exports',code)(load,mod,mod.exports);
 return {service,PasswordForm,render(){cursor=0;return mod.exports.default({diaries:[],previewUser:user,accountService:service,onEndPreview(){}})}};
}
function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label)return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,label);if(found)return found;}return null;}
test('실제 계정의 내 공간에 임의의 비밀번호 변경·탈퇴 버튼을 추가하지 않는다',()=>{
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',nickname:'회원'});
 assert.equal(find(ui.render(),'비밀번호 변경'),null);assert.equal(find(ui.render(),'회원 탈퇴'),null);
});
test('accountId 없는 실제 서버 계정도 기존 프로필 수정 버튼으로 계정 API에 접근한다',()=>{
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',nickname:'회원'});
 find(ui.render(),'회원정보 수정').props.onPress();const form=ui.render();assert.equal(form.type,ui.PasswordForm);assert.equal(form.props.service,ui.service);
 assert.equal(form.props.passwordOnly,undefined);assert.equal(form.props.withdrawOnly,undefined);
});

test('체험 계정은 기존 진입과 기본 프로필 서비스 선택을 유지한다',()=>{
 const ui=setup({mode:'preview',accountId:'preview-account',provider:'email',nickname:'체험'});
 find(ui.render(),'회원정보 수정').props.onPress();assert.equal(ui.render().props.service,undefined);
});
test('비회원에게 프로필 수정 버튼을 추가하지 않는다',()=>{
 const ui=setup({mode:'guest',provider:'guest',nickname:'비회원'});
 assert.equal(find(ui.render(),'회원정보 수정'),null);assert.ok(find(ui.render(),'로그인·회원가입'));
});
