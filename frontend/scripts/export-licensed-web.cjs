const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto')
const root=path.resolve(__dirname,'..'),options=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,args)=>index%2?pairs:[...pairs,[value,args[index+1]]],[]))
const audit=path.resolve(root,options['--audit-dir']||'qa/licensed-web-audit'),output=path.resolve(root,options['--output-dir']||'dist-licensed')
for(const directory of [audit,output])if(fs.existsSync(directory)&&fs.readdirSync(directory).length)throw new Error('Use a new, empty output directory: '+directory)
function run(file,args,env=process.env){const result=spawnSync(process.execPath,[file,...args],{cwd:root,stdio:'inherit',windowsHide:true,env});if(result.status!==0)throw new Error('License export step failed')}
run(path.join(__dirname,'verify-prepared-licenses.cjs'),['web'])
const cli=path.join(path.dirname(require.resolve('expo/package.json')),'bin/cli')
// 웹 배포본도 앱 production 빌드와 같은 EXPO_PUBLIC_* 값(예: 플래너 선택 플래그)으로 만든다.
const productionEnv=JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8')).build.production.env??{}
// 앱 릴리스와 같은 API 주소 판정 기준(ESM 모듈)을 쓴다. require(esm)이 없는 Node(22.12 미만)에서도 동작하도록 동적 import로 읽는다.
async function main(){
const {isSecureApiBaseUrl}=await import('../src/shared/apiBaseUrlPolicy.js')
if(!isSecureApiBaseUrl(productionEnv.EXPO_PUBLIC_API_BASE_URL))throw new Error('Web export requires a production HTTPS EXPO_PUBLIC_API_BASE_URL.')
run(cli,['export','--platform','web','--source-maps','--output-dir',audit],{...process.env,...productionEnv})
fs.mkdirSync(output,{recursive:true})
fs.cpSync(audit,output,{recursive:true,filter:source=>!source.endsWith('.map')})
const files=[]
function inspect(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())inspect(file);else files.push({file:path.relative(output,file).replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})}}
inspect(output)
fs.writeFileSync(path.join(audit,'distribution-files.json'),JSON.stringify(files,null,2))
console.log('Web distribution: '+output+'; source maps retained only in private audit directory: '+audit)
}
main().catch(error=>{console.error(error);process.exitCode=1})
