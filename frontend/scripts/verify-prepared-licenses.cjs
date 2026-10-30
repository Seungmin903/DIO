// Shared build gate. No dependency installation or automatic license approval.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const root=path.resolve(__dirname,'..'),platform=process.argv[2]
if(!['android','web'].includes(platform))throw new Error('Pass android or web')
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const catalog=JSON.parse(fs.readFileSync(path.join(root,`src/licenses/generated/${platform}.json`)))
if(catalog.dependencyLockSha256!==hash(path.join(root,'pnpm-lock.yaml')))throw new Error('License catalog is stale. Regenerate it from the current build before distribution.')
const base=path.join(root,platform==='web'?'public/licenses':'modules/dio-handwriting/android/src/main/assets/dio_licenses')
if(!fs.existsSync(path.join(base,'THIRD_PARTY_NOTICES.txt')))throw new Error('Prepare offline legal notices before building.')
let count=0
for(const record of catalog.components){
  if(!record.text?.trim())throw new Error('Empty legal notice: '+record.id)
  for(const source of record.sourceArchives??[]){
    const file=path.join(base,'sources',source.fileName)
    if(!fs.existsSync(file)||fs.statSync(file).size!==source.bytes||hash(file)!==source.sha256)throw new Error('Missing/stale corresponding source: '+source.fileName)
    count++
  }
}
if(platform==='web'){
  const vendor=path.join(root,'public/vendor/heic-to/1.6.6/heic-to.mjs')
  if(hash(vendor)!==hash(path.join(root,'node_modules/heic-to/dist/csp/heic-to.js')))throw new Error('Review changed HEIC distribution and corresponding source before shipping.')
}
console.log(`DIO_LICENSE_PREPARED: ${platform}, ${catalog.components.length} notices, ${count} source references verified`)
