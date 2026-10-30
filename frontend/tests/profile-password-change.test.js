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
  if(id==='../constants')return {C:new Proxy({},{get:()=>''})};
  if(id==='../../auth/ProfileEditScreen')return PasswordForm;
  if(id==='../../auth/PasswordResetScreen')return PasswordForm;
  if(id==='../../auth/authService')return {authService:service};
  if(id==='../../handwriting/studioBus.js')return {openFontStudio(){}};
  if(id==='react/jsx-runtime')return require(id);
  return ()=>null;
 };
 new Function('require','module','exports',code)(load,mod,mod.exports);
 return {service,PasswordForm,render(){cursor=0;return mod.exports.default({diaries:[],previewUser:user,onEndPreview(){}})}};
}
function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label||node.props?.label===label)return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,label);if(found)return found;}return null;}
test('실제 이메일 계정의 내 공간은 인증번호 기반 비밀번호 재설정 화면에 인증 서비스를 전달한다',()=>{
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'});
 assert.ok(find(ui.render(),'회원정보 수정'));find(ui.render(),'비밀번호 변경').props.onPress();
 const form=ui.render();assert.equal(form.type,ui.PasswordForm);assert.equal(form.props.service,ui.service);assert.equal(form.props.email,'member@example.com');
 form.props.onClose();assert.ok(find(ui.render(),'비밀번호 변경'));
});
test('실제 이메일 계정의 회원정보 수정은 체험 서비스가 아닌 인증 서비스를 사용한다',()=>{
 const ui=setup({mode:'authenticated',userId:'7',provider:'email',email:'member@example.com',nickname:'회원'});
 find(ui.render(),'회원정보 수정').props.onPress();
 const form=ui.render();assert.equal(form.type,ui.PasswordForm);assert.equal(form.props.service,ui.service);assert.equal(form.props.photoEditable,false);
});
test('게스트·소셜 계정에는 이메일 비밀번호 변경 진입을 노출하지 않는다',()=>{
 for(const user of [{provider:'guest'},{mode:'authenticated',provider:'google',userId:'8'}])assert.equal(find(setup(user).render(),'비밀번호 변경'),null);
});
