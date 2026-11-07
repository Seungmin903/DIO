const fs=require('node:fs'),path=require('node:path')
// 개발 전용 QA 접속 정보(EXPO_PUBLIC_QA_ACCESS_*)는 __DEV__ 분기에서만 쓰여 릴리스 번들에서 제거된다.
// 웹 배포 파일에 변수명이나 실제 값이 남아 있으면 배포를 막는다. 값은 4자 이상일 때만 찾는다(짧은 값의 우연한 일치 방지).
const VARIABLE_NAME='EXPO_PUBLIC_QA_ACCESS'
function secretsFrom(env){return [VARIABLE_NAME,...['EXPO_PUBLIC_QA_ACCESS_ID','EXPO_PUBLIC_QA_ACCESS_PASSWORD'].map(name=>env[name]).filter(value=>typeof value==='string'&&value.length>=4)]}
function listFiles(directory){const files=[];(function walk(current){for(const item of fs.readdirSync(current,{withFileTypes:true})){const file=path.join(current,item.name);if(item.isDirectory())walk(file);else files.push(file)}})(directory);return files}
/** 배포 디렉터리를 훑어 QA 접속 정보가 남은 첫 파일을 돌려준다. 없으면 null. */
function findLeakedQaAccess(directory,env=process.env){
  const secrets=secretsFrom(env)
  for(const file of listFiles(directory)){const text=fs.readFileSync(file,'latin1');const leaked=secrets.find(secret=>text.includes(secret));if(leaked)return {file:path.relative(directory,file).split(path.sep).join('/'),kind:leaked===VARIABLE_NAME?'variable name':'value'}}
  return null
}
function assertNoLeakedQaAccess(directory,env=process.env){const leak=findLeakedQaAccess(directory,env);if(leak)throw new Error('QA access credential found in web distribution file: '+leak.file+' ('+leak.kind+')')}
module.exports={findLeakedQaAccess,assertNoLeakedQaAccess}
if(require.main===module){assertNoLeakedQaAccess(path.resolve(process.argv[2]||'dist-licensed'));console.log('Web distribution has no QA access credential.')}
