import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/screens/NotificationSettingsScreen.js',import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]
}).code;
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
function setup(flags,blockedValue=false){
 let opened=0;
 const values=[],refs=[],deps=[],cleanups=[];let sc,rc,ec,writes=0,back;
 const mocks={
  react:{useState:initial=>{const i=sc++;if(!(i in values))values[i]=initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
   useRef:initial=>refs[rc++]??={current:initial},useEffect:(fn,next)=>{const i=ec++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){cleanups[i]?.();deps[i]=next;cleanups[i]=fn();}}},
  '../../notifications/notificationPermission':{notificationsBlocked:async()=>blockedValue},
  'react-native':{AppState:{addEventListener:()=>({remove(){}})},Linking:{openSettings(){opened++}},ActivityIndicator:'ActivityIndicator',Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',Platform:{OS:'android'},BackHandler:{addEventListener:(_,fn)=>{back=fn;return {remove(){back=null}}}},StyleSheet:{create:v=>v}},
  '../../shared/AppIcon':{__esModule:true,default:'Icon'},'../../shared/theme':{colors:{},radius:{},DISABLED_OPACITY:0.4},
  '../components/Header':{__esModule:true,default:'Header'},'../components/TermsConsentSection':{__esModule:true,default:'Terms'},
  '../../shared/featureFlags':{SERVICE_SECTION_ENABLED:false,...flags},
 };
 const mod={exports:{}};new Function('require','module','exports',code)(id=>id==='react/jsx-runtime'?require(id):mocks[id],mod,mod.exports);
 return {render(){sc=rc=ec=0;return mod.exports.default({userId:'101',accountService:{},onClose(){}})},
  ready(tree,fn=async()=>{}){const terms=nodes(tree).find(n=>n.type==='Terms');terms.props.saveRef.current=async()=>{writes++;return fn()};terms.props.onReadyChange(true);return terms.props},
  opened:()=>opened,writes:()=>writes,back:()=>back,close(){cleanups.forEach(fn=>fn?.());}};
}
test('서버 미연결 서비스 알림은 구역째 숨기고 동작하는 스위치를 제공하지 않는다',()=>{
 const ui=setup(),tree=ui.render();assert.ok(!JSON.stringify(tree).includes('준비 중'));
 assert.ok(!nodes(tree).some(n=>n.props.accessibilityRole==='switch'));ui.close();
});
test('동의 저장 실패에서만 재시도를 제공하고 재시도 성공을 표시한다',async()=>{
 const ui=setup(),props=ui.ready(ui.render());props.onSaveError(true);
 let button=nodes(ui.render()).find(n=>n.props.accessibilityLabel==='동의 설정 다시 저장');
 await button.props.onPress();assert.equal(ui.writes(),1);
 assert.ok(nodes(ui.render()).some(n=>n.props.children==='동의 설정을 저장했어요.'));ui.close();
});
test('서버에 동의 저장 중에는 화면 뒤로가기를 막는다',()=>{
 const ui=setup(),props=ui.ready(ui.render());props.onSavingChange(true);
 const tree=ui.render(),back=nodes(tree).find(n=>n.type==='Header').props.left;
 assert.equal(back.props.disabled,true);assert.equal(ui.back()(),true);ui.close();
});
test('서비스 알림 스위치를 켜면 구역이 다시 그려진다',()=>{
 const ui=setup({SERVICE_SECTION_ENABLED:true}),tree=ui.render();
 assert.ok(nodes(tree).some(n=>n.props.children==='서비스 알림'));
 assert.ok(nodes(tree).some(n=>n.props.children==='마케팅 정보 수신'));ui.close();
});

test('OS 알림이 꺼져 있을 때만 설정 열기를 보이고 누르면 기기 설정을 연다',async()=>{
 const off=setup({},true);off.render();await new Promise(r=>setImmediate(r));
 const tree=off.render(),button=nodes(tree).find(n=>n.props?.accessibilityLabel==='기기 설정에서 알림 켜기');
 assert.ok(button);button.props.onPress();assert.equal(off.opened(),1);off.close();
 const on=setup({},false);on.render();await new Promise(r=>setImmediate(r));
 assert.equal(nodes(on.render()).some(n=>n.props?.accessibilityLabel==='기기 설정에서 알림 켜기'),false);on.close();
});
