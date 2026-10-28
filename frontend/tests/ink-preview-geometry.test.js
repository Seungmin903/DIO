import test from 'node:test'
import assert from 'node:assert/strict'
import { simplifyInkPreview } from '../src/editor/utils/inkPreviewGeometry.js'

test('조밀한 직선의 임시 표시만 줄이고 끝점·원본 객체·압력 급변을 유지한다', () => {
  const points = Array.from({ length: 201 }, (_, i) => ({ x: i / 10, y: 0, pressure: i === 100 ? 2 : 1, force: .5, speed: .2 }))
  const before = JSON.stringify(points), reduced = simplifyInkPreview(points, 20)
  assert.ok(reduced.length < points.length / 3)
  assert.equal(reduced[0], points[0]); assert.equal(reduced.at(-1), points.at(-1))
  assert.ok(reduced.includes(points[100])); assert.equal(JSON.stringify(points), before)
  for (const p of reduced) assert.ok(points.includes(p))
})
test('급회전과 센서 누락 경계는 임시 표시에서도 보존한다', () => {
  const points = [{x:0,y:0,pressure:1,force:.2}, {x:1,y:0,pressure:1,force:.8}, {x:1,y:1,pressure:1}, {x:2,y:1,pressure:1}]
  assert.deepEqual(simplifyInkPreview(points, 10), points)
})
test('각 단순화 구간에서 위치와 반경 오차가 허용치 이내다', () => {
  const points = Array.from({length:400}, (_,i)=>({x:i*.1,y:Math.sin(i/20),pressure:1+Math.sin(i/30)*.2,force:.4,speed:.2}))
  const reduced = simplifyInkPreview(points, 12), tolerance=.1200001
  for(let j=1;j<reduced.length;j++) {
    const a=reduced[j-1],b=reduced[j],first=points.indexOf(a),last=points.indexOf(b),dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy
    for(let i=first+1;i<last;i++) {
      const p=points[i],t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l))
      assert.ok(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=tolerance)
      assert.ok(Math.abs(p.pressure-(a.pressure+(b.pressure-a.pressure)*t))*6<=tolerance)
    }
  }
})
