import test from 'node:test'
import assert from 'node:assert/strict'
import { reusableStrokeRaster } from '../src/editor/utils/reusableStrokeRaster.js'
test('배율·정렬 경계만 바뀐 동일 원본 묶음은 재사용한다', () => {
 const a={},b={},before={width:1188,height:840,objects:[a,b],zoom:.4,left:10}
 assert.equal(reusableStrokeRaster(before,{...before,objects:[a,b],zoom:1.2,left:9.5}),true)
 for(const next of [{...before,objects:[a,{...b}]},{...before,objects:[b,a]},{...before,objects:[a]},{...before,width:900}]) assert.equal(reusableStrokeRaster(before,next),false)
 assert.equal(reusableStrokeRaster(null,before),false)
})
