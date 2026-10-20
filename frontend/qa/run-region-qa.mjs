import { chromium } from 'playwright'
import { STORAGE_KEYS } from '../src/editor/utils/storageContract.js'
import { runRegionQa } from './region-qa.mjs'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const root=fileURLToPath(new URL('../',import.meta.url)),qa=fileURLToPath(new URL('./',import.meta.url))
const args=process.argv.slice(2),value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback
const out=resolve(qa,value('--out','.out')),web=resolve(out,'web'),port=Number(value('--port','0'))
await mkdir(out,{recursive:true})
if(!args.includes('--skip-build'))execFileSync(process.execPath,[resolve(root,'node_modules/expo/bin/cli'),'export','--platform','web','--output-dir',web],{cwd:root,stdio:'inherit'})
const keys={ doc: STORAGE_KEYS.doc, diaries: STORAGE_KEYS.diaries }
const require=createRequire(resolve(root,'package.json')),{GifWriter}=require('omggif')
const buffer=new Uint8Array(4096),writer=new GifWriter(buffer,4,4,{palette:[0xff0000,0x0000ff],loop:0})
writer.addFrame(0,0,4,4,new Uint8Array(16),{delay:5});writer.addFrame(0,0,4,4,new Uint8Array(16).fill(1),{delay:5})
const gif=`data:image/gif;base64,${Buffer.from(buffer.slice(0,writer.end())).toString('base64')}`
const mime={'.html':'text/html','.js':'text/javascript','.png':'image/png','.gif':'image/gif','.json':'application/json','.wasm':'application/wasm','.woff':'font/woff','.ttf':'font/ttf'}
const server=createServer(async(req,res)=>{
  try{const path=resolve(web,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(path!==web&&!path.startsWith(web+sep)){res.writeHead(403);res.end();return}const file=path===web?resolve(web,'index.html'):path;const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}
})
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok)})
let browser
try{
 const channel=value('--channel',undefined)
 browser=await chromium.launch({...(channel ? {channel} : {}),headless:true})
 const result=await runRegionQa(browser,{baseURL:`http://127.0.0.1:${server.address().port}`,keys,gif,screenshotDir:out})
 try{result.commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()}catch{}
 await writeFile(resolve(out,'region-results.json'),JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify({passed:result.passed,report:resolve(out,'region-results.json'),records:result.records.map(r=>({name:r.name,passed:r.passed,error:r.error}))},null,2))
 if(!result.passed)process.exitCode=1
}finally{await browser?.close();await new Promise(ok=>server.close(ok))}
