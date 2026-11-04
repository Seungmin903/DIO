import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core');
const load=(path,mocks)=>{
  const code=babel.transformSync(readFileSync(new URL(path,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
  const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id]??require(id),mod,mod.exports);return mod.exports;
};
const memoryStorage=()=>{const data=new Map();return {data,getItem:async key=>data.get(key)??null,setItem:async(key,value)=>{data.set(key,value)},removeItem:async key=>{data.delete(key)}}};
const secureStore=()=>{const data=new Map();return {data,getItemAsync:async key=>data.get(key)??null,setItemAsync:async(key,value)=>{data.set(key,value)},deleteItemAsync:async key=>{data.delete(key)}}};
const nativeLock=(secure=secureStore(),asyncStorage=memoryStorage())=>load('../src/shared/appLock.js',{
  'expo-secure-store':secure,
  '@react-native-async-storage/async-storage':{__esModule:true,default:asyncStorage},
  'react-native':{Platform:{OS:'android'}},
  'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'SHA-256'},digestStringAsync:async(_algorithm,value)=>createHash('sha256').update(value).digest('hex')},
});

test('앱 잠금은 계정마다 따로 두고 PIN·시도 횟수를 보안 저장소에만 둔다', async()=>{
  const storage=secureStore();
  const lock=nativeLock(storage);
  const member=lock.appLockScope({mode:'authenticated',userId:7}),guest=lock.appLockScope({provider:'guest',accountId:'g1'});
  assert.equal(member,'user:7');assert.equal(guest,'guest:g1');
  assert.equal(await lock.hasAppLock(member),false);
  await lock.setAppLock(member,'1234');
  assert.equal(await lock.hasAppLock(member),true);
  assert.equal(await lock.hasAppLock(guest),false);
  assert.deepEqual(await lock.checkAppLock(member,'1234'),{ok:true,retryAfterMs:0});
  assert.deepEqual(await lock.checkAppLock(member,'4321'),{ok:false,retryAfterMs:0});
  assert.equal([...storage.data.values()].some(value=>value.includes('1234')),true);
  await lock.clearAppLock(member);
  assert.equal(await lock.hasAppLock(member),false);
  assert.deepEqual(await lock.checkAppLock(member,'1234'),{ok:false,retryAfterMs:0});
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
  const lock=nativeLock();
  assert.equal(lock.APP_LOCK_GRACE_MS,60000);
  assert.equal(lock.appLockGraceOver(null,1000),false);
  assert.equal(lock.appLockGraceOver(0,59999),false);
  assert.equal(lock.appLockGraceOver(0,60000),true);
});

test('v1 잠금은 첫 실행에 보안 저장소로 옮기고, 올바른 PIN 뒤 v2 PIN 형식으로 완전히 바꾼다', async()=>{
  const secure=secureStore(),asyncStorage=memoryStorage(),lock=nativeLock(secure,asyncStorage),scope='user:7';
  const salt='test-salt',hash=createHash('sha256').update(`${salt}:1234`).digest('hex');
  await asyncStorage.setItem('dio.appLock.v1:user:7',JSON.stringify({salt,hash}));
  assert.equal(await lock.hasAppLock(scope),true);
  assert.equal(await asyncStorage.getItem('dio.appLock.v1:user:7'),null);
  assert.match([...secure.data.values()][0],/legacy/);
  assert.deepEqual(await lock.checkAppLock(scope,'0000',1000),{ok:false,retryAfterMs:0});
  assert.deepEqual(await lock.checkAppLock(scope,'1234',1000),{ok:true,retryAfterMs:0});
  const migrated=JSON.parse([...secure.data.values()][0]);
  assert.equal(migrated.pin,'1234');assert.equal(migrated.legacy,undefined);
});

test('PIN을 다섯 번 틀리면 재시도 시간이 증가하고, 올바른 PIN은 제한 상태를 초기화한다', async()=>{
  const storage=secureStore(),lock=nativeLock(storage);
  await lock.setAppLock('user:7','1234');
  for(let attempt=0;attempt<4;attempt++) assert.deepEqual(await lock.checkAppLock('user:7','0000',1000),{ok:false,retryAfterMs:0});
  assert.deepEqual(await lock.checkAppLock('user:7','0000',1000),{ok:false,retryAfterMs:30000});
  assert.deepEqual(await lock.checkAppLock('user:7','1234',1001),{ok:false,retryAfterMs:29999});
  for(let attempt=0;attempt<5;attempt++) await lock.checkAppLock('user:7','0000',31000);
  assert.deepEqual(await lock.checkAppLock('user:7','1234',31001),{ok:false,retryAfterMs:59999});
  assert.deepEqual(await lock.checkAppLock('user:7','1234',91000),{ok:true,retryAfterMs:0});
  assert.deepEqual(JSON.parse([...storage.data.values()][0]).lockouts,0);
  await storage.setItemAsync('dio.appLock.v2.user%3A7',JSON.stringify({version:2,pin:'1234',failedAttempts:4,retryUntil:0,lockouts:7}));
  assert.deepEqual(await lock.checkAppLock('user:7','0000',92000),{ok:false,retryAfterMs:30*60*1000});
});

test('손상된 저장값은 잠금이 아닌 것으로 처리하고, 비정상적으로 긴 제한 시간은 30분으로 제한한다', async()=>{
  const storage=secureStore(),lock=nativeLock(storage),scope='user:7';
  await storage.setItemAsync('dio.appLock.v2.user%3A7','{not-json');
  assert.equal(await lock.hasAppLock(scope),false);
  await lock.setAppLock(scope,'1234');
  const saved=JSON.parse([...storage.data.values()][0]);
  await storage.setItemAsync('dio.appLock.v2.user%3A7',JSON.stringify({...saved,retryUntil:99999999999999}));
  assert.deepEqual(await lock.checkAppLock(scope,'1234',1000),{ok:false,retryAfterMs:30*60*1000});
});
