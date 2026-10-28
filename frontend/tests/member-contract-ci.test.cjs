const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {checkContracts,files}=require('../qa/run-member-contract-ci.cjs');
test('계약 CI는 누락·잘못된 JSON·빈 응답을 성공이나 skip으로 처리하지 않는다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dio-contract-guard-'));
 try{assert.throws(()=>checkContracts(dir),/ENOENT/);for(const file of files)fs.writeFileSync(path.join(dir,file),'{}');assert.throws(()=>checkContracts(dir),/Invalid Spring contract/);
  for(const file of files)fs.writeFileSync(path.join(dir,file),'{"spring":true}');checkContracts(dir);fs.writeFileSync(path.join(dir,files[1]),'{broken');assert.throws(()=>checkContracts(dir),SyntaxError);
 }finally{for(const file of files)if(fs.existsSync(path.join(dir,file)))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);}
});
