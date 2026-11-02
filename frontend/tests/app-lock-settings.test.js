import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core');
const load=(path,mocks)=>{
  const code=babel.transformSync(readFileSync(new URL(path,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
  const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id]??require(id),mod,mod.exports);return mod.exports;
};
const memoryStorage=()=>{const data=new Map();return {data,getItem:async key=>data.get(key)??null,setItem:async(key,value)=>{data.set(key,value)},removeItem:async key=>{data.delete(key)}}};
const crypto={CryptoDigestAlgorithm:{SHA256:'SHA-256'},randomUUID,digestStringAsync:async(_,value)=>createHash('sha256').update(value).digest('hex')};

test('앱 잠금은 계정마다 따로 두고 비밀번호 대신 소금 붙인 해시만 저장한다', async()=>{
  const storage=memoryStorage();
  const lock=load('../src/shared/appLock.js',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage},'expo-crypto':crypto});
  const member=lock.appLockScope({mode:'authenticated',userId:7}),guest=lock.appLockScope({provider:'guest',accountId:'g1'});
  assert.equal(member,'user:7');assert.equal(guest,'guest:g1');
  assert.equal(await lock.hasAppLock(member),false);
  await lock.setAppLock(member,'1234');
  assert.equal(await lock.hasAppLock(member),true);
  assert.equal(await lock.hasAppLock(guest),false);
  assert.equal(await lock.checkAppLock(member,'1234'),true);
  assert.equal(await lock.checkAppLock(member,'4321'),false);
  assert.equal([...storage.data.values()].some(value=>value.includes('1234')),false);
  await lock.clearAppLock(member);
  assert.equal(await lock.hasAppLock(member),false);
  assert.equal(await lock.checkAppLock(member,'1234'),false);
});

test('알림 설정은 기본값에서 시작해 바꾼 값만 저장하고 목록 밖 시각은 받지 않는다', async()=>{
  const storage=memoryStorage();
  const settings=load('../src/shared/notificationSettings.js',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage},react:{useSyncExternalStore:()=>null}});
  settings.setNotificationSettings({reminder:true,reminderTime:'07:30'});
  const saved=JSON.parse(storage.data.get('dio.notifications.settings.v1'));
  assert.deepEqual(saved,{enabled:true,invite:true,activity:true,reminder:true,reminderTime:'21:00'});
  settings.setNotificationSettings({invite:false,reminderTime:'09:00'});
  assert.deepEqual(JSON.parse(storage.data.get('dio.notifications.settings.v1')),{enabled:true,invite:false,activity:true,reminder:true,reminderTime:'09:00'});
  assert.equal(settings.reminderTimeLabel('09:00'),'오전 9시');
  assert.equal(settings.reminderTimeLabel('21:00'),'오후 9시');
});

test('알림을 끄면 세부 설정도 모두 꺼지고, 다시 켜면 끄기 직전의 세부 설정이 돌아온다', async()=>{
  const storage=memoryStorage();
  const settings=load('../src/shared/notificationSettings.js',{'@react-native-async-storage/async-storage':{__esModule:true,default:storage},react:{useSyncExternalStore:()=>null}});
  const read=()=>JSON.parse(storage.data.get('dio.notifications.settings.v1'));
  settings.setNotificationSettings({invite:false,reminder:true,reminderTime:'09:00'});
  settings.setNotificationSettings({enabled:false});
  assert.deepEqual(read(),{enabled:false,invite:false,activity:false,reminder:false,reminderTime:'09:00',last:{invite:false,activity:true,reminder:true}});
  settings.setNotificationSettings({enabled:true});
  assert.deepEqual(read(),{enabled:true,invite:false,activity:true,reminder:true,reminderTime:'09:00'});
});

test('백그라운드에서 1분 안에 돌아오면 다시 잠그지 않는다(사진 선택기 · 공유 창)', ()=>{
  const lock=load('../src/shared/appLock.js',{'@react-native-async-storage/async-storage':{__esModule:true,default:memoryStorage()},'expo-crypto':crypto});
  assert.equal(lock.APP_LOCK_GRACE_MS,60000);
  assert.equal(lock.appLockGraceOver(null,1000),false);
  assert.equal(lock.appLockGraceOver(0,59999),false);
  assert.equal(lock.appLockGraceOver(0,60000),true);
});
