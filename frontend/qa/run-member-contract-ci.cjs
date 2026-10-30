const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const frontend=path.resolve(__dirname,'..'),contractDir=path.resolve(frontend,'../backend/build/contracts');
const files=['member-diary-http.json','member-diary-trash-http.json','member-diary-purge-http.json'];
function checkContracts(dir){
 for(const name of files){const value=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length)throw Error(`Invalid Spring contract: ${name}`);}
}
function main(){
 const report=path.join(frontend,'build/member-contract');fs.mkdirSync(report,{recursive:true});
 try{checkContracts(contractDir);}catch(error){
  const message=String(error.message).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  fs.writeFileSync(path.join(report,'junit.xml'),`<testsuite name="member-contract-preflight" tests="1" failures="1"><testcase name="Spring artifacts required"><failure message="${message}"/></testcase></testsuite>`);
  console.error('Required Spring artifacts missing or invalid:',error.message);return 1;
 }
 if(process.argv.includes('--check-artifacts'))return 0;
 const result=spawnSync(process.execPath,['--test','--test-reporter=spec','--test-reporter-destination=stdout','--test-reporter=junit',`--test-reporter-destination=${path.join(report,'junit.xml')}`,
  'tests/member-diary-api.test.js','tests/member-app-store.test.js','tests/member-diary-spring-contract.test.js','tests/member-diary-lifecycle.test.js','tests/member-diary-purge.test.js','tests/member-contract-ci.test.cjs','tests/member-library-integration.test.js','tests/collaboration-reducer.test.js','tests/collaboration-session.test.js','tests/collaboration-socket.test.js','tests/collaboration-hook.test.js','tests/collaboration-options.test.js','tests/editor-shape-options.test.js','tests/collaboration-elements.test.js','tests/collaboration-open-document.test.js'],{cwd:frontend,stdio:'inherit'});
 if(result.error)console.error(result.error);return result.status??1;
}
module.exports={checkContracts,files};if(require.main===module)process.exitCode=main();
