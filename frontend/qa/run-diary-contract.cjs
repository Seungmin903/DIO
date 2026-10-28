// Dependency-free CI consumer: absent Spring evidence is a failure, never a skipped test.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
try {
  const root=option('--contract-root')||process.env.DIO_DIARY_CONTRACT_ROOT;
  if(!root)throw Error('Set --contract-root or DIO_DIARY_CONTRACT_ROOT to actual Spring producer output.');
  const files={DIO_DIARY_CONTRACT_OUTPUT:'diary-read.json',DIO_DIARY_CREATE_CONTRACT_OUTPUT:'diary-create.json',
    DIO_DIARY_UPDATE_CONTRACT_OUTPUT:'diary-update.json',DIO_DIARY_TRASH_CONTRACT_OUTPUT:'diary-trash.json',
    DIO_DIARY_RESTORE_CONTRACT_OUTPUT:'diary-restore.json',DIO_DIARY_PURGE_CONTRACT_OUTPUT:'diary-purge.json'};
  const env={...process.env};
  for(const [name,file]of Object.entries(files)){
    const target=path.resolve(root,file);
    if(!fs.existsSync(target))throw Error(`Missing Spring contract artifact: ${file}`);
    try{JSON.parse(fs.readFileSync(target,'utf8'));}catch{throw Error(`Invalid Spring JSON: ${file}`);}
    env[name]=target;
  }
  const tests=['account-diary-creation.test.js','authenticated-diary.test.js','account-diary-update.test.js',
    'account-diary-trash.test.js','account-diary-purge.test.js','diary-editor.test.js','diary-mutation.test.js',
    'diary-trash-api.test.js','library-reader.test.js','diary-contract-runner.test.cjs'];
  const command=['--test'];const junit=option('--junit');
  if(junit){fs.mkdirSync(path.dirname(path.resolve(junit)),{recursive:true});command.push('--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${path.resolve(junit)}`);}
  command.push(...tests.map(file=>`tests/${file}`));
  const result=spawnSync(process.execPath,command,{cwd:path.resolve(__dirname,'..'),env,stdio:'inherit'});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}catch(error){console.error(error.message);process.exitCode=1;}
