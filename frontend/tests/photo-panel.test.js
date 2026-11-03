import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/usePhotoPanel.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
function fixture(){
 let open=false,lastReadOnly,effect
 const react={useState:()=>[open,value=>{open=value}],useEffect:(fn,[readOnly])=>{if(lastReadOnly!==readOnly){lastReadOnly=readOnly;effect=fn}}}
 const module={exports:{}};new Function('require','module','exports',code)(name=>{assert.equal(name,'react');return react},module,module.exports)
 return {...module.exports,render(readOnly=false){const view=module.exports.usePhotoPanel(readOnly);const commit=effect;effect=null;commit?.();return view}}
}
test('기기 사진 자르기 취소·칸 부족 정리에서도 서버 사진과 사용한 사진은 보존한다',async()=>{
 const {discardUnusedPhotoImports}=fixture(),deleted=[]
 const server={mediaFileId:'server',serverStored:true},local={mediaFileId:'unused-local'},used={mediaFileId:'used-local'}
 await discardUnusedPhotoImports([server,local,used],[used],async images=>deleted.push(...images))
 assert.deepEqual(deleted,[local])
 await discardUnusedPhotoImports([server,used],[used],()=>assert.fail('기존 사진만 있으면 파일 삭제 금지'))
 await discardUnusedPhotoImports([server],[],()=>assert.fail('서버 사진 자르기 취소 시 삭제 금지'))
})
test('읽기 전용에서는 열기·툴바 선택 상태가 켜지지 않으며 권한 복귀 후에도 닫혀 있다',()=>{
 const ui=fixture();ui.render(true).toggle();assert.equal(ui.render(true).visible,false)
 ui.render(false).toggle();assert.equal(ui.render(false).visible,true)
 const changing=ui.render(true);assert.equal(changing.visible,false)
 assert.equal(ui.render(false).visible,false)
})
test('패널 토글과 공통 닫기는 선택 표시를 함께 끄고 이후 다시 열 수 있다',()=>{
 const ui=fixture();ui.render().toggle();assert.equal(ui.render().visible,true)
 ui.render().toggle();assert.equal(ui.render().visible,false)
 ui.render().toggle();ui.render().close();assert.equal(ui.render().visible,false)
 ui.render().close();assert.equal(ui.render().visible,false)
 ui.render().toggle();assert.equal(ui.render().visible,true)
})
