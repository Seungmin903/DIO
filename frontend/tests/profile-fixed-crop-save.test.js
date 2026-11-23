import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const code=expo('@babel/core').transformSync(readFileSync(new URL('../src/auth/ProfileCropHost.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[[expo.resolve('@babel/plugin-transform-react-jsx'),{runtime:'automatic'}],expo.resolve('@babel/plugin-transform-modules-commonjs')]}).code
function fixture(width,height,{failCrop=false}={}) {
 const slots=[];let i=0,effectStarted=false;const jobs=[],done=[],notices=[]
 const react={useState(initial){const n=i++;if(!(n in slots))slots[n]=initial;return[slots[n],next=>{slots[n]=next}]},useEffect(fn){if(!effectStarted){effectStarted=true;fn()}}}
 const ImageManipulator={manipulate(uri){const job={uri,released:false};jobs.push(job);return{crop(box){job.crop=box;return this},resize(size){job.resize=size;return this},release(){job.released=true},async renderAsync(){if(job.crop&&failCrop)throw Error('write failed');return{release(){job.imageReleased=true},async saveAsync(){return{uri:job.crop?'file:///saved-square.jpg':'file:///prepared.jpg',width,height}}}}}}}
 const mocks={react,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':{ActivityIndicator:'Loading',View:'View',StyleSheet:{create:v=>v}},'expo-image-manipulator':{ImageManipulator,SaveFormat:{JPEG:'jpeg'}},'../shared/dialogs':{notify:(...args)=>notices.push(args)},'../shared/theme':{colors:{}},'./profileCrop':{profileCropStore:{}}}
 const module={exports:{}};new Function('require','module','exports',code)(id=>mocks[id]??{__esModule:true,default:id},module,module.exports)
 const render=()=>{i=0;return module.exports.ProfileCropper({asset:{uri:'file:///source.jpg'},onDone:uri=>done.push(uri)})}
 return{render,jobs,done,notices}
}
for(const [width,height,rect,expected] of [
 [1200,800,{u0:0.25,v0:0.125,u1:0.75,v1:0.875},{originX:300,originY:100,width:600,height:600}],
 [1600,1600,{u0:0,v0:0,u1:1,v1:1},{originX:0,originY:0,width:1600,height:1600}],
 [800,1600,{u0:0.8,v0:0.9,u1:1,v1:1},{originX:640,originY:1440,width:160,height:160}],
])test(`profile applies displayed rectangle as square source pixels ${width}x${height}`,async()=>{
 const f=fixture(width,height);f.render();await new Promise(resolve=>setImmediate(resolve));const cropper=f.render()
 assert.equal(cropper.props.fixedViewport,true);assert.equal(cropper.props.fixedAspect,1);assert.equal(cropper.props.round,true)
 await cropper.props.onApply({rect})
 assert.deepEqual(f.jobs[1].crop,expected)
 assert.deepEqual(f.jobs[1].resize,{width:Math.min(1024,expected.width),height:Math.min(1024,expected.height)})
 assert.equal(f.jobs[1].uri,'file:///prepared.jpg');assert.equal(f.jobs[1].released,true);assert.equal(f.jobs[1].imageReleased,true)
 assert.deepEqual(f.done,['file:///saved-square.jpg']);assert.deepEqual(f.notices,[])
})
test('actual image operation failure shows notice, keeps dialog open and releases resource',async()=>{
 const f=fixture(1200,800,{failCrop:true});f.render();await new Promise(resolve=>setImmediate(resolve));const tree=f.render()
 await tree.props.onApply({rect:{u0:0.25,v0:0.125,u1:0.75,v1:0.875}})
 assert.deepEqual(f.done,[]);assert.deepEqual(f.notices,[['사진을 자르지 못했어요','다시 시도해 주세요.']]);assert.equal(f.jobs[1].released,true)
})
