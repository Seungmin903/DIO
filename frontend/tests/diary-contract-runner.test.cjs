const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runner=path.resolve(__dirname,'../qa/run-diary-contract.cjs');
test('CI contract runner fails without a producer directory instead of silently skipping',()=>{
 const result=spawnSync(process.execPath,[runner],{encoding:'utf8',env:{...process.env,DIO_DIARY_CONTRACT_ROOT:''}});
 assert.notEqual(result.status,0);assert.match(result.stderr,/actual Spring producer output/);
});
test('CI contract runner rejects missing or malformed producer artifacts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dio-contract-runner-'));
 try{
  let result=spawnSync(process.execPath,[runner,'--contract-root',dir],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Missing Spring contract artifact: diary-read.json/);
  fs.writeFileSync(path.join(dir,'diary-read.json'),'not JSON');
  result=spawnSync(process.execPath,[runner,'--contract-root',dir],{encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Invalid Spring JSON: diary-read.json/);
 }finally{const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('dio-contract-runner-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
