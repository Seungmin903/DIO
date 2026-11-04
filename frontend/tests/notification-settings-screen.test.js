import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/screens/NotificationSettingsScreen.js',import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]
}).code;
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup({localFail=false,termsFail=false}={}){
 const values=[],refs=[],deps=[],cleanups=[],writes=[];let sc,rc,ec,termWrites=0;
 const mocks={
  react:{useState:initial=>{const i=sc++;if(!(i in values))values[i]=initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
   useRef:initial=>refs[rc++]??={current:initial},useEffect:(fn,next)=>{const i=ec++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){cleanups[i]?.();deps[i]=next;cleanups[i]=fn();}}},
  'react-native':{ActivityIndicator:'ActivityIndicator',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:v=>v}},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{}},
  '../../shared/AppIcon':{__esModule:true,default:'Icon'},'../../shared/theme':{colors:{},radius:{}},
  '../components/Header':{__esModule:true,default:'Header'},'../components/SettingRow':{SettingSwitch:'Switch'},
  '../components/TermsConsentSection':{__esModule:true,default:'Terms'},
  '../services/notificationPreferences':{DEFAULT_NOTIFICATION_PREFERENCES:{service:true,marketing:false},
   loadNotificationPreferences:async()=>({settings:{service:true,marketing:false}}),
   saveNotificationPreferences:async(storage,user,settings)=>{writes.push({user,settings});if(localFail)throw Error('disk');}},
 };
 const mod={exports:{}};new Function('require','module','exports',code)(id=>id==='react/jsx-runtime'?require(id):mocks[id],mod,mod.exports);
 const ui={render(){sc=rc=ec=0;return mod.exports.default({userId:'101',accountService:{}});},
  ready(tree){const terms=nodes(tree).find(n=>n.type==='Terms');terms.props.saveRef.current=async()=>{termWrites++;if(termsFail)throw Error('network');};terms.props.onReadyChange(true);},
  writes,termWrites:()=>termWrites,close(){cleanups.forEach(fn=>fn?.());}};
 return ui;
}
const save=tree=>nodes(tree).find(n=>n.props.accessibilityLabel==='알림 설정 저장');
const message=(tree,text)=>nodes(tree).some(n=>n.props.children===text);
test('동의 조회 전·실패 상태여도 서비스 알림 저장은 가능하다',async()=>{
 const ui=setup();ui.render();await settle();const tree=ui.render();assert.equal(save(tree).props.disabled,false);
 await save(tree).props.onPress();assert.equal(ui.writes.length,1);assert.equal(ui.termWrites(),0);
 assert.ok(message(ui.render(),'서비스 알림을 저장했어요. 선택 동의는 상태 조회 후 저장해 주세요.'));ui.close();
});
test('동의 저장 실패와 무관하게 기기 설정은 저장하고 부분 성공을 안내한다',async()=>{
 const ui=setup({termsFail:true});ui.render();await settle();ui.ready(ui.render());
 await save(ui.render()).props.onPress();assert.equal(ui.writes.length,1);assert.equal(ui.termWrites(),1);
 assert.ok(message(ui.render(),'서비스 알림은 저장했어요. 선택 동의는 오류를 확인하고 다시 저장해 주세요.'));ui.close();
});
test('기기 저장 실패가 동의 저장을 막지 않으며 전체 성공으로 표시하지 않는다',async()=>{
 const ui=setup({localFail:true});ui.render();await settle();ui.ready(ui.render());
 await save(ui.render()).props.onPress();assert.equal(ui.termWrites(),1);
 assert.ok(message(ui.render(),'선택 동의는 저장했지만 서비스 알림을 저장하지 못했어요. 다시 시도해 주세요.'));ui.close();
});
test('둘 다 성공한 경우에만 전체 저장 완료를 표시하고 같은 버튼 연타를 막는다',async()=>{
 const ui=setup();ui.render();await settle();ui.ready(ui.render());const button=save(ui.render());
 await Promise.all([button.props.onPress(),button.props.onPress()]);assert.equal(ui.writes.length,1);assert.equal(ui.termWrites(),1);
 assert.ok(message(ui.render(),'알림 설정을 저장했어요.'));
 assert.ok(!nodes(ui.render()).some(n=>n.props.label==='마케팅 정보 받기'));ui.close();
});
