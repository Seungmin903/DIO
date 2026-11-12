import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), expo=createRequire(require.resolve('expo/package.json'));
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/auth/photoUpload.native.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
test('네이티브 가입 JSON은 메모리 Blob으로 전송하고 사진 파일만 정리한다',async()=>{
 const deleted=[], parts=[];
 class File { constructor(uri){this.uri=uri;this.exists=true;} delete(){deleted.push(this.uri);} }
 const context={resize(){},renderAsync:async()=>({saveAsync:async()=>({uri:'cache/photo.png'}),release(){}}),release(){}};
 const mocks={'expo-image-manipulator':{ImageManipulator:{manipulate:()=>context},SaveFormat:{PNG:'png'}},'expo-file-system':{File}};
 const module={exports:{}};
 class Form {append(...args){parts.push(args);}}
 new Function('require','module','exports','FormData',code)(id=>mocks[id],module,module.exports,Form);
 const signup={password:'test-password',signupToken:'test-token'};
 const result=await module.exports.buildPhotoBody(signup,'picker/photo');
 assert.equal(parts[0][1].type,'application/json');
 assert.deepEqual(JSON.parse(await parts[0][1].text()),signup);
 assert.equal(parts[1][1].uri,'cache/photo.png');
 assert.deepEqual(deleted,[]);
 result.dispose();
 assert.deepEqual(deleted,['cache/photo.png']);
});

test('설치된 Expo multipart 인코더가 메모리 JSON과 File 바이트를 함께 직렬화한다', async () => {
  const babel=expo('@babel/core');
  function loadExpo(relative, imports={}) {
    const source=readFileSync(new URL(relative, new URL('../node_modules/expo/package.json',import.meta.url)),'utf8');
    const compiled=babel.transformSync(source,{filename:'expo.ts',configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-typescript'),expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const mod={exports:{}};
    new Function('require','module','exports',compiled)(id=>{if(id in imports)return imports[id];throw new Error(id)},mod,mod.exports);
    return mod.exports;
  }
  class NativeForm {constructor(){this._parts=[];}}
  loadExpo('./src/winter/FormData.ts').installFormDataPatch(NativeForm);
  const form=new NativeForm();
  form.append('signup',new Blob([JSON.stringify({password:'test-only',signupToken:'test-only'})],{type:'application/json'}),'signup.json');
  form.append('photo',{name:'photo.png',type:'image/png',bytes:async()=>new Uint8Array([137,80,78,71])});
  const {convertFormDataAsync}=loadExpo('./src/winter/fetch/convertFormData.ts',{'../../utils/blobUtils':{blobToArrayBufferAsync:blob=>blob.arrayBuffer()}});
  const result=await convertFormDataAsync(form,'test-boundary');
  const wire=new TextDecoder().decode(result.body);
  assert.match(wire,/name="signup"; filename="signup.json"/);
  assert.match(wire,/content-type: application\/json/);
  assert.match(wire,/content-type: image\/png/);
  assert.match(wire,/"password":"test-only"/);
  assert.ok(result.body.some((byte,index)=>byte===137 && result.body[index+1]===80));
});
