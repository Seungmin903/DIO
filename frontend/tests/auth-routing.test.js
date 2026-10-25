import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json')),babel=expo('@babel/core')
const code=babel.transformSync(readFileSync(new URL('../App.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
function root(dev,mode,session=null){
 const mod={exports:{}},mocks={react:{useState:()=>[session,()=>{}],useEffect(){}},'react-native':{Platform:{OS:'web'},StatusBar:'StatusBar'},'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider'},'./src/diary/styles':{styles:{}},'./src/shared/useHiddenNavigationBar':{useHiddenNavigationBar(){}}}
 new Function('require','module','exports','__DEV__','process',code)(id=>mocks[id]??(id==='react/jsx-runtime'?require(id):{__esModule:true,default:id}),mod,mod.exports,dev,{env:{EXPO_PUBLIC_DIARY_SOURCE:mode}})
 return mod.exports.default()
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
const has=(tree,name)=>nodes(tree).some(n=>n.type===name||n.type?.name===name)
test('기본 실행은 로그인, 세션이 있으면 로컬 보관함으로 진입한다',()=>{
 assert.ok(has(root(true,undefined),'./src/auth/AuthScreen'))
 assert.ok(has(root(false,'mock'),'./src/auth/AuthScreen'))
 assert.ok(has(root(false,'mock-library'),'./src/auth/AuthScreen'))
 const tree=root(true,undefined,{nickname:'소연'}),diary=nodes(tree).find(n=>n.type?.name==='DiaryApp')
 assert.equal(diary.props.previewUser.nickname,'소연');assert.equal(typeof diary.props.onEndPreview,'function')
})
test('개발 전용 보관함 목 모드는 기존 경로를 유지한다',()=>{
 assert.ok(has(root(true,'mock'),'./src/diary/screens/ConnectedDiaryLibrary'))
 assert.ok(has(root(true,'mock-library'),'./src/diary/screens/MockLibraryApp'))
})
