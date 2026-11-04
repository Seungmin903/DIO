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
const secureStore=()=>{const data=new Map(),valid=key=>/^[A-Za-z0-9._-]+$/.test(key);return {data,getItemAsync:async key=>{if(!valid(key))throw Error('invalid key');return data.get(key)??null},setItemAsync:async(key,value)=>{if(!valid(key))throw Error('invalid key');data.set(key,value)},deleteItemAsync:async key=>{if(!valid(key))throw Error('invalid key');data.delete(key)}}};
const nativeLock=(secure=secureStore(),asyncStorage=memoryStorage())=>load('../src/shared/appLock.js',{
  'expo-secure-store':secure,
  '@react-native-async-storage/async-storage':{__esModule:true,default:asyncStorage},
  'react-native':{Platform:{OS:'android'}},
  'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'SHA-256'},randomUUID,digestStringAsync:async(_algorithm,value)=>createHash('sha256').update(value).digest('hex')},
});
const webLock=(asyncStorage=memoryStorage())=>load('../src/shared/appLock.js',{
  'expo-secure-store':secureStore(),
  '@react-native-async-storage/async-storage':{__esModule:true,default:asyncStorage},
  'react-native':{Platform:{OS:'web'}},
  'expo-crypto':{CryptoDigestAlgorithm:{SHA256:'SHA-256'},randomUUID,digestStringAsync:async(_algorithm,value)=>createHash('sha256').update(value).digest('hex')},
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
  assert.equal(await lock.checkAppLock(member,'1234'),true);
  assert.equal(await lock.checkAppLock(member,'4321'),false);
  assert.equal([...storage.data.values()].some(value=>value.includes('1234')),false);
  const legacy=memoryStorage();
  await legacy.setItem('dio.appLock.v1:user:7',JSON.stringify({salt:'old',hash:'old'}));
  const lockWithLegacy=nativeLock(storage,legacy);
  assert.equal(await lockWithLegacy.hasAppLock(member),true);
  await Promise.resolve();
  assert.equal(await legacy.getItem('dio.appLock.v1:user:7'),null);
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
  assert.deepEqual(await Promise.all([lock.hasAppLock(scope),lock.hasAppLock(scope)]),[true,true]);
  assert.equal(await asyncStorage.getItem('dio.appLock.v1:user:7'),null);
  assert.match([...secure.data.values()][0],/legacy/);
  assert.deepEqual(await lock.checkAppLockStatus(scope,'0000',1000),{ok:false,retryAfterMs:0});
  assert.deepEqual(await lock.checkAppLockStatus(scope,'1234',1000),{ok:true,retryAfterMs:0});
  const migrated=JSON.parse([...secure.data.values()][0]);
  assert.equal(typeof migrated.salt,'string');assert.equal(typeof migrated.hash,'string');assert.equal(migrated.legacy,undefined);
});

test('PIN을 다섯 번 틀리면 재시도 시간이 증가하고, 올바른 PIN은 제한 상태를 초기화한다', async()=>{
  const storage=secureStore(),lock=nativeLock(storage);
  await lock.setAppLock('user:7','1234');
  for(let attempt=0;attempt<4;attempt++) assert.deepEqual(await lock.checkAppLockStatus('user:7','0000',1000),{ok:false,retryAfterMs:0});
  assert.deepEqual(await lock.checkAppLockStatus('user:7','0000',1000),{ok:false,retryAfterMs:30000});
  assert.deepEqual(await lock.checkAppLockStatus('user:7','1234',1001),{ok:false,retryAfterMs:29999});
  for(let attempt=0;attempt<5;attempt++) await lock.checkAppLockStatus('user:7','0000',31000);
  assert.deepEqual(await lock.checkAppLockStatus('user:7','1234',31001),{ok:false,retryAfterMs:59999});
  assert.deepEqual(await lock.checkAppLockStatus('user:7','1234',91000),{ok:true,retryAfterMs:0});
  const reset=JSON.parse([...storage.data.values()][0]);
  assert.deepEqual(reset.lockouts,0);
  await storage.setItemAsync('dio.appLock.v2.s00007500007300006500007200003a000037',JSON.stringify({...reset,failedAttempts:4,retryUntil:0,lockouts:7}));
  assert.deepEqual(await lock.checkAppLockStatus('user:7','0000',92000),{ok:false,retryAfterMs:30*60*1000});
});

test('손상된 저장값과 저장소 오류는 fail-closed로 처리하고, 비정상적으로 긴 제한 시간은 30분으로 제한한다', async()=>{
  const storage=secureStore(),lock=nativeLock(storage),scope='user:7';
  const key='dio.appLock.v2.s00007500007300006500007200003a000037';
  await storage.setItemAsync(key,'{not-json');
  assert.equal(await lock.hasAppLock(scope),true);
  assert.deepEqual(await lock.checkAppLockStatus(scope,'1234'),{ok:false,retryAfterMs:0,error:'corrupt'});
  await lock.setAppLock(scope,'1234');
  const saved=JSON.parse([...storage.data.values()][0]);
  await storage.setItemAsync(key,JSON.stringify({...saved,retryUntil:99999999999999}));
  assert.deepEqual(await lock.checkAppLockStatus(scope,'1234',1000),{ok:false,retryAfterMs:30*60*1000});
});

test('SecureStore 읽기 오류는 잠금을 유지하고, 웹의 기존 v1 잠금도 조용히 해제하지 않는다', async()=>{
  const failing={getItemAsync:async()=>{throw Error('keystore unavailable')},setItemAsync:async()=>{},deleteItemAsync:async()=>{}};
  const native=nativeLock(failing),scope='user:7';
  assert.equal(await native.hasAppLock(scope),true);
  assert.deepEqual(await native.checkAppLockStatus(scope,'1234'),{ok:false,retryAfterMs:0,error:'storage'});
  const asyncStorage=memoryStorage(),web=webLock(asyncStorage),salt='web-salt',hash=createHash('sha256').update(`${salt}:1234`).digest('hex');
  await asyncStorage.setItem('dio.appLock.v1:user:7',JSON.stringify({salt,hash}));
  assert.equal(web.appLockSupported,false);
  assert.equal(await web.hasAppLock(scope),true);
  assert.deepEqual(await web.checkAppLockStatus(scope,'0000',1000),{ok:false,retryAfterMs:0});
  for(let attempt=0;attempt<3;attempt++) await web.checkAppLockStatus(scope,'0000',1000);
  assert.deepEqual(await web.checkAppLockStatus(scope,'0000',1000),{ok:false,retryAfterMs:30000});
  assert.deepEqual(await web.checkAppLockStatus(scope,'1234'),{ok:true,retryAfterMs:0});
});

test('PIN 화면 오류 문구는 boolean·재시도 제한·저장소 오류 결과를 구분한다', ()=>{
  const {pinFailureMessage}=load('../src/diary/components/pinScreenMessage.js',{});
  assert.equal(pinFailureMessage(false),'비밀번호가 달라요');
  assert.equal(pinFailureMessage({ok:false,retryAfterMs:1250}),'입력 횟수가 많아요. 2초 뒤에 다시 시도해 주세요');
  assert.equal(pinFailureMessage({ok:false,retryAfterMs:0,error:'storage'}),'앱 잠금을 확인하지 못했어요. 잠시 후 다시 시도해 주세요');
});

test('잠금 초기화는 모든 저장소 정리를 시도하고 보안 저장소 삭제 실패를 호출자에게 알린다', async()=>{
  const asyncStorage=memoryStorage(),secure=secureStore(),scope='user:7';
  secure.deleteItemAsync=async()=>{throw Error('keystore unavailable')};
  await asyncStorage.setItem('dio.appLock.v1:user:7','legacy');
  await asyncStorage.setItem('dio.appLock.v1.attempts:user:7','attempts');
  const lock=nativeLock(secure,asyncStorage);
  await assert.rejects(lock.clearAppLock(scope),/keystore unavailable/);
  assert.equal(await asyncStorage.getItem('dio.appLock.v1:user:7'),null);
  assert.equal(await asyncStorage.getItem('dio.appLock.v1.attempts:user:7'),null);
});

test('잠금 상태는 없음·정상·손상·저장소 오류를 구분한다', async()=>{
  const storage=secureStore(),lock=nativeLock(storage),scope='user:7';
  assert.equal(await lock.readAppLockState(scope),'off');
  await lock.setAppLock(scope,'1234');
  assert.equal(await lock.readAppLockState(scope),'on');
  await storage.setItemAsync('dio.appLock.v2.s00007500007300006500007200003a000037','{not-json');
  assert.equal(await lock.readAppLockState(scope),'corrupt');
  const failing=nativeLock({getItemAsync:async()=>{throw Error('keystore unavailable')},setItemAsync:async()=>{},deleteItemAsync:async()=>{}});
  assert.equal(await failing.readAppLockState(scope),'storage');
});

const recovery=({clear=async()=>{},reads=[]}={})=>{
  const dialogs=[],notices=[],cleared=[];
  const mod=load('../src/diary/components/appLockRecovery.js',{
    '../../shared/appLock':{clearAppLock:async scope=>{cleared.push(scope);await clear(scope)},readAppLockState:async()=>{const next=reads.shift();if(next instanceof Error)throw next;return next}},
    '../../shared/dialogs':{confirmAction:options=>dialogs.push(options),notify:(title,message)=>notices.push({title,message})},
  });
  return {...mod,dialogs,notices,cleared};
};

test('회원의 잊었어요는 잠금을 지운 뒤 로그아웃하고, 지우기에 실패하면 로그아웃하지 않고 알린다', async()=>{
  const ok=recovery();let logouts=0;
  const action=ok.appLockRecoveryAction({member:true,state:'on',scope:'user:7',onLogout:()=>{logouts+=1}});
  assert.equal(typeof action,'function');
  action();assert.equal(ok.dialogs.length,1);assert.equal(ok.dialogs[0].confirmLabel,'로그아웃');
  await ok.dialogs[0].onConfirm();
  assert.deepEqual(ok.cleared,['user:7']);assert.equal(logouts,1);assert.deepEqual(ok.notices,[]);

  const failed=recovery({clear:async()=>{throw Error('keystore unavailable')}});
  failed.appLockRecoveryAction({member:true,state:'corrupt',scope:'user:7',onLogout:()=>{logouts+=1}})();
  await failed.dialogs[0].onConfirm();
  assert.equal(logouts,1);
  assert.deepEqual(failed.notices,[{title:'앱 잠금',message:'앱 잠금을 초기화하지 못했어요. 잠시 후 다시 시도해 주세요.'}]);
  assert.equal(ok.appLockRecoveryAction({member:true,state:'on',scope:'user:7'}),undefined); // 로그아웃 수단이 없으면 칸을 비운다
});

test('게스트는 정상 잠금을 PIN 없이 풀 수 없고, 저장값이 손상됐을 때만 초기화한다', async()=>{
  const ok=recovery();
  for(const state of ['on','off',null]) assert.equal(ok.appLockRecoveryAction({member:false,state,scope:'guest:g1',onCleared(){}}),undefined);
  let done=0;
  const action=ok.appLockRecoveryAction({member:false,state:'corrupt',scope:'guest:g1',onCleared:()=>{done+=1}});
  assert.equal(typeof action,'function');
  action();const dialog=ok.dialogs.at(-1);
  assert.equal(dialog.confirmLabel,'초기화');assert.match(dialog.message,/일기는 그대로/);
  await dialog.onConfirm();assert.equal(done,1);
  assert.deepEqual(ok.cleared,['guest:g1']);
  const failed=recovery({clear:async()=>{throw Error('keystore unavailable')}});
  failed.appLockRecoveryAction({member:false,state:'corrupt',scope:'guest:g1',onCleared:()=>{done+=1}})();
  await failed.dialogs[0].onConfirm();
  assert.equal(done,1);assert.equal(failed.notices.length,1); // 초기화 실패는 onCleared 를 부르지 않는다
});

test('게스트의 일시적 저장소 읽기 오류는 초기화를 열지 않고 다시 읽기만 한다', async()=>{
  const ui=recovery({reads:['storage',Error('keystore unavailable'),'on']}),states=[];let cleared=0;
  const action=ui.appLockRecoveryAction({member:false,state:'storage',scope:'guest:g1',onCleared:()=>{cleared+=1},onStateChange:state=>states.push(state)});
  assert.equal(typeof action,'function');
  await action();await action();
  assert.deepEqual(states,['storage','storage']);
  assert.equal(ui.notices.length,2);assert.match(ui.notices[0].message,/아직 읽지 못했어요/);
  await action(); // 다시 읽히면 정상 잠금으로 돌아가 PIN으로만 풀린다
  assert.deepEqual(states,['storage','storage','on']);
  assert.equal(ui.notices.length,2);
  assert.deepEqual(ui.dialogs,[]);assert.deepEqual(ui.cleared,[]);assert.equal(cleared,0);
});

const loadJsx=(path,mocks)=>{
  const code=babel.transformSync(readFileSync(new URL(path,import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
  const mod={exports:{}};new Function('require','module','exports',code)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),mod,mod.exports);return mod.exports;
};
const tree=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(tree)];

test('앱 잠금을 새로 켤 수 없는 환경(웹)에서는 기존 잠금의 끄기만 두고 켜기·바꾸기를 숨긴다', ()=>{
  const {default:AppLockSetting}=loadJsx('../src/diary/components/AppLockSetting.js',{
    '../../shared/DioButton':{__esModule:true,default:'DioButton'},
    './SettingRow':{__esModule:true,default:'SettingRow',ON_OFF:[],SettingSection:'SettingSection'},
  });
  const calls=[];const handlers={onTurnOn:()=>calls.push('on'),onTurnOff:()=>calls.push('off'),onChange:()=>calls.push('change')};
  const rows=props=>tree(AppLockSetting(props)).filter(node=>node.type==='SettingRow');
  const switchOf=props=>rows(props).find(node=>node.props.label==='앱 잠금');
  // 웹·기존 잠금 있음: 끄기는 되고, 비밀번호 바꾸기 줄은 없다
  assert.equal(rows({...handlers,locked:true,canEnable:false}).some(node=>node.props.label==='비밀번호'),false);
  switchOf({...handlers,locked:true,canEnable:false}).props.onChange('off');
  // 웹·잠금 없음: 켜기를 눌러도 아무 흐름도 열지 않는다
  switchOf({...handlers,locked:false,canEnable:false}).props.onChange('on');
  // 읽는 중(null)이면 어느 쪽도 열지 않는다
  switchOf({...handlers,locked:null,canEnable:true}).props.onChange('on');
  assert.deepEqual(calls,['off']);
  // 지원 환경: 켜기와 바꾸기 줄이 있다
  switchOf({...handlers,locked:false}).props.onChange('on');
  assert.equal(rows({...handlers,locked:true}).some(node=>node.props.label==='비밀번호'),true);
  assert.deepEqual(calls,['off','on']);
});

const pinScreen=({check,onForgot}={})=>{
  const values=[];let cursor=0;const done=[];
  const {default:PinScreen}=loadJsx('../src/diary/components/PinScreen.js',{
    react:{useEffect(){},useRef:initial=>({current:initial}),useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next}]}},
    'react-native':{BackHandler:{addEventListener:()=>({remove(){}})},Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:v=>v,absoluteFill:{}},useWindowDimensions:()=>({width:400,height:900})},
    '../../shared/theme':{colors:{}},
    '../../shared/appLock':{PIN_LENGTH:4},
    './pinScreenMessage':load('../src/diary/components/pinScreenMessage.js',{}),
  });
  const render=mode=>{cursor=0;return PinScreen({mode,user:{},check,onDone:pin=>done.push(pin),onCancel(){},onForgot})};
  const type=async(mode,pin)=>{
    for(const key of pin) tree(render(mode)).find(node=>node.type==='Pressable'&&node.props.accessibilityLabel===key).props.onPress();
    await new Promise(resolve=>setImmediate(resolve));
  };
  const errorText=mode=>tree(render(mode)).find(node=>node.props?.accessibilityLiveRegion==='polite').props.children;
  return {render,type,errorText,done};
};

test('PIN 화면은 검증 결과 객체의 ok·재시도 시간·저장소 오류를 구분해 처리한다', async()=>{
  const results=[{ok:false,retryAfterMs:0},{ok:false,retryAfterMs:30000},{ok:false,retryAfterMs:0,error:'corrupt'},{ok:true,retryAfterMs:0}];
  const ui=pinScreen({check:async()=>results.shift()});
  await ui.type('unlock','0000');assert.equal(ui.errorText('unlock'),'비밀번호가 달라요');
  await ui.type('unlock','0000');assert.equal(ui.errorText('unlock'),'입력 횟수가 많아요. 30초 뒤에 다시 시도해 주세요');
  await ui.type('unlock','0000');assert.equal(ui.errorText('unlock'),'앱 잠금을 확인하지 못했어요. 잠시 후 다시 시도해 주세요');
  assert.deepEqual(ui.done,[]);
  await ui.type('unlock','1234');assert.deepEqual(ui.done,['1234']);
  // 이전 boolean 계약과 검증 중 예외도 처리한다
  const legacy=pinScreen({check:async pin=>pin==='1234'});
  await legacy.type('verify','1234');assert.deepEqual(legacy.done,['1234']);
  const throwing=pinScreen({check:async()=>{throw Error('boom')}});
  await throwing.type('verify','1234');assert.deepEqual(throwing.done,[]);assert.equal(throwing.errorText('verify'),'비밀번호가 달라요');
});

test('PIN 화면은 onForgot이 있을 때만 잊었어요 칸을 연다', ()=>{
  const forgot=()=>{};
  const withForgot=tree(pinScreen({onForgot:forgot}).render('verify')).find(node=>node.props?.accessibilityLabel==='비밀번호를 잊었어요');
  assert.equal(withForgot.props.onPress,forgot);
  assert.equal(tree(pinScreen().render('setup')).some(node=>node.props?.accessibilityLabel==='비밀번호를 잊었어요'),false);
});
