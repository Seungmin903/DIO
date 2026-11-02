import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'));
const transform=file=>expo('@babel/core').transformSync(readFileSync(new URL(file,import.meta.url),'utf8'),{
 configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]
}).code;
const native={Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:v=>v}};
function load(file,deps){
 const mod={exports:{}};
 new Function('require','module','exports',transform(file))(id=>id==='react/jsx-runtime'?require(id):id==='react-native'?native:deps[id]??(()=>null),mod,mod.exports);
 return mod.exports;
}
// 함수 컴포넌트는 펼쳐서 실제로 그려지는 트리를 본다(SettingSection 이 children 을 어떻게 다루는지까지).
function expand(node){
 if(!node||typeof node!=='object')return node;
 if(Array.isArray(node))return node.map(expand);
 if(typeof node.type==='function')return expand(node.type(node.props));
 return {...node,props:{...node.props,children:expand(node.props?.children)}};
}
function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label||node.props?.label===label)return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,label);if(found)return found;}return null;}

test('기기 알림을 꺼도 알림 섹션 안의 서버 알림 설정 진입 행은 보이고 누를 수 있다',()=>{
 const settingRow=load('../src/diary/components/SettingRow.js',{'../../shared/theme':{colors:{},DISABLED_OPACITY:0.4}});
 const settings={enabled:false,invite:true,activity:true,reminder:false,reminderTime:'21:00'};
 const {default:NotificationSetting}=load('../src/diary/components/NotificationSetting.js',{
  react:{useRef:()=>({current:null}),useState:v=>[v,()=>{}]},
  '../../shared/theme':{colors:{},bubble:{}},
  '../../shared/notificationSettings':{REMINDER_TIMES:[],reminderTimeLabel:v=>v,setNotificationSettings(){},useNotificationSettings:()=>settings},
  './SettingRow':settingRow,
 });
 let opened=0;
 const row={type:'Pressable',props:{accessibilityRole:'button',accessibilityLabel:'알림 설정',onPress:()=>opened++}};
 const tree=expand(NotificationSetting({children:row}));
 const entry=find(tree,'알림 설정');
 assert.ok(entry,'알림을 꺼도 서버 알림 설정 행이 그려진다');
 assert.notEqual(entry.props.disabled,true);
 entry.props.onPress();assert.equal(opened,1);
 // 토글이 막는 것은 기기 알림의 세부 행뿐이다
 assert.equal(find(tree,'다이어리 초대').props.disabled,true);
});
