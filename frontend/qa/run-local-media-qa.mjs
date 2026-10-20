import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright'
import { runLocalMediaQa } from './local-media-export.mjs'

const require=createRequire(import.meta.url)
const root=fileURLToPath(new URL('../',import.meta.url))
const args=process.argv.slice(2)
let port=0,skipBuild=false
for(let i=0;i<args.length;i++) {
  if(args[i]==='--')continue
  if(args[i]==='--skip-build')skipBuild=true
  else if(args[i]==='--port') {
    const value=args[++i]
    if(!/^\d+$/.test(value||'')||Number(value)>65535)throw Error('--port는 0~65535 정수여야 합니다.')
    port=Number(value)
  } else throw Error(`알 수 없는 인자: ${args[i]}`)
}
const outputDir=path.join(root,'qa','.out',`${Date.now()}-${process.pid}`)
const fixtureDir=path.join(outputDir,'fixtures')
await mkdir(outputDir,{recursive:true})
const run=(command,argv)=>{
  const result=spawnSync(command,argv,{cwd:root,stdio:'inherit',env:{...process.env,EXPO_NO_TELEMETRY:'1',EXPO_OFFLINE:'1'}})
  if(result.error)throw result.error
  if(result.status!==0)throw Error(`실행 실패 (${result.status}): ${command}`)
}
let server,browser,report
try {
  run(process.execPath,[path.join(root,'qa','generate-media-fixtures.mjs'),fixtureDir])
  if(!skipBuild) {
    const expoRoot=path.dirname(require.resolve('expo/package.json'))
    run(process.execPath,[path.join(expoRoot,'bin','cli'),'export','--platform','web'])
  }
  const dist=path.join(root,'dist')
  await readFile(path.join(dist,'index.html'))
  const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.png':'image/png','.gif':'image/gif','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.webp':'image/webp'}
  server=createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)
      const target=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname))
      const relative=path.relative(dist,target)
      if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return}
      const bytes=await readFile(target)
      res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'})
      res.end(bytes)
    } catch {res.writeHead(404);res.end('Not found')}
  })
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})
  // 사용자 브라우저나 기존 서버에 붙지 않고, 이 실행이 만든 서버만 이용한다.
  const baseUrl=`http://127.0.0.1:${server.address().port}`
  browser=await chromium.launch({headless:true})
  const manifest=JSON.parse(await readFile(path.join(fixtureDir,'manifest.json'),'utf8'))
  const commit=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'})
  const baseCommit=commit.status===0?commit.stdout.trim():'unspecified'
  const dateKST=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date())
  report=await runLocalMediaQa(browser,{baseUrl,fixtureDir,outputDir,manifest,baseCommit,dateKST})
  report.execution={command:['pnpm qa:media',...args].join(' '),baseUrl,skipBuild,notes:skipBuild?'기존 dist 사용: 실행 코드가 HEAD와 다를 수 있음':'현재 작업 트리에서 Web bundle 생성. 미커밋 변경이 있으면 HEAD와 다를 수 있음'}
  await writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2)+'\n')
  if(report.fatal||report.cases.some(c=>c.status==='failed'))throw Error('QA 실패: report.json과 failure.png를 확인하세요.')
  console.log(JSON.stringify({status:'passed',outputDir,imports:report.import,cases:report.cases.map(c=>({name:c.name,generationMs:c.generationMs})),pending:report.pending},null,2))
} catch(error) {
  if(!report)await writeFile(path.join(outputDir,'runner-error.json'),JSON.stringify({message:error.message},null,2)+'\n')
  console.error(`${error.message}\n결과 폴더: ${outputDir}`)
  if(/Executable doesn't exist/.test(error.message))console.error('최초 1회 pnpm exec playwright install chromium 명령을 실행하세요.')
  process.exitCode=1
} finally {
  await browser?.close()
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
