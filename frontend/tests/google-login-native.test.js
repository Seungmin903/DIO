import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), expo=createRequire(require.resolve('expo/package.json'));
const SDK_IMPORT="import('@react-native-google-signin/google-signin')";
const source=readFileSync(new URL('../src/auth/googleLogin.native.js',import.meta.url),'utf8');
assert.ok(source.includes(SDK_IMPORT),'구글 SDK 동적 import 위치를 찾지 못했어요.');
// new Function 안에서는 동적 import를 쓸 수 없어 모의 require로 바꿔 불러온다.
const code=expo('@babel/core').transformSync(source.replace(SDK_IMPORT,"Promise.resolve(require('@react-native-google-signin/google-signin'))"),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const statusCodes={SIGN_IN_CANCELLED:'SIGN_IN_CANCELLED',IN_PROGRESS:'IN_PROGRESS',PLAY_SERVICES_NOT_AVAILABLE:'PLAY_SERVICES_NOT_AVAILABLE'};
const success={type:'success',data:{idToken:'google-id-token',user:{email:'user@example.com'}}};

function load({previous=false,signOut=async()=>null,signIn=async()=>success}={}){
 const calls=[], warnings=[];
 const GoogleSignin={
  configure(){calls.push('configure');},
  hasPlayServices:async()=>{calls.push('hasPlayServices');return true;},
  hasPreviousSignIn(){calls.push('hasPreviousSignIn');return previous;},
  signOut:async()=>{calls.push('signOut');return signOut();},
  signIn:async()=>{calls.push('signIn');return signIn();},
 };
 const mocks={'react-native':{Platform:{OS:'android'}},'expo-constants':{appOwnership:null},'@react-native-google-signin/google-signin':{GoogleSignin,statusCodes}};
 const module={exports:{}};
 const console={warn:(...args)=>warnings.push(args)};
 new Function('require','module','exports','console',code)(id=>mocks[id],module,module.exports,console);
 return {signInWithGoogle:module.exports.signInWithGoogle,calls,warnings};
}
const failWith=code=>async()=>{throw Object.assign(new Error('native failure'),{code});};

test('이전 로그인 기록이 있으면 signIn 전에 signOut해 계정 선택 창을 띄운다',async()=>{
 const {signInWithGoogle,calls}=load({previous:true});
 assert.deepEqual(await signInWithGoogle(),{idToken:'google-id-token',email:'user@example.com'});
 assert.ok(calls.indexOf('signOut')>=0 && calls.indexOf('signOut')<calls.indexOf('signIn'));
});

test('이전 로그인 기록이 없으면 signOut을 부르지 않는다',async()=>{
 const {signInWithGoogle,calls}=load({previous:false});
 await signInWithGoogle();
 assert.equal(calls.includes('signOut'),false);
});

test('이전 계정 정리에 실패해도 로그를 남기고 로그인은 계속한다',async()=>{
 const {signInWithGoogle,calls,warnings}=load({previous:true,signOut:failWith('SIGN_OUT_FAILED')});
 await signInWithGoogle();
 assert.ok(calls.includes('signIn'));
 assert.deepEqual(warnings[0],['[GoogleSignin] 이전 계정 정리 실패','SIGN_OUT_FAILED']);
});

for(const code of [10,'10','DEVELOPER_ERROR']){
 test(`오류 코드 ${JSON.stringify(code)}는 앱 설정 오류로 안내한다`,async()=>{
  const {signInWithGoogle}=load({signIn:failWith(code)});
  await assert.rejects(signInWithGoogle(),{message:`구글 로그인 앱 설정이 맞지 않아요. (오류 코드: ${code})`});
 });
}

test('그 밖의 오류 코드는 코드가 포함된 일반 안내로 바꾼다',async()=>{
 const {signInWithGoogle,warnings}=load({signIn:failWith(7)});
 await assert.rejects(signInWithGoogle(),{message:'구글 로그인을 완료하지 못했어요. 앱 설정과 네트워크를 확인해 주세요. (오류 코드: 7)'});
 assert.deepEqual(warnings.at(-1),['[GoogleSignin] 실패',7,'native failure']);
});

test('취소는 오류 코드 없이 취소 안내로 바꾼다',async()=>{
 const {signInWithGoogle}=load({signIn:failWith('SIGN_IN_CANCELLED')});
 await assert.rejects(signInWithGoogle(),{message:'구글 로그인을 취소했어요.'});
});
