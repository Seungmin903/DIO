const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto')
const root=path.resolve(__dirname,'..'),options=Object.fromEntries(process.argv.slice(2).reduce((pairs,value,index,args)=>index%2?pairs:[...pairs,[value,args[index+1]]],[]))
const audit=path.resolve(root,options['--audit-dir']||'qa/licensed-web-audit'),output=path.resolve(root,options['--output-dir']||'dist-licensed')
for(const directory of [audit,output])if(fs.existsSync(directory)&&fs.readdirSync(directory).length)throw new Error('Use a new, empty output directory: '+directory)
function run(file,args){const result=spawnSync(process.execPath,[file,...args],{cwd:root,stdio:'inherit',windowsHide:true});if(result.status!==0)throw new Error('License export step failed')}
run(path.join(__dirname,'verify-prepared-licenses.cjs'),['web'])
const cli=path.join(path.dirname(require.resolve('expo/package.json')),'bin/cli')
run(cli,['export','--platform','web','--source-maps','--output-dir',audit])
fs.mkdirSync(output,{recursive:true})
fs.cpSync(audit,output,{recursive:true,filter:source=>!source.endsWith('.map')})
const files=[]
function inspect(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())inspect(file);else files.push({file:path.relative(output,file).replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})}}
inspect(output)
fs.writeFileSync(path.join(audit,'distribution-files.json'),JSON.stringify(files,null,2))
console.log('Web distribution: '+output+'; source maps retained only in private audit directory: '+audit)
