import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasFetch } from '../src/collaboration/canvasFetch.js'
import { createAuthenticatedMemberTransport } from '../src/diary/services/memberTransport.js'

const build=(header,extra,fetch)=>createCanvasFetch({headersFor:()=>extra,accessTokenHeader:header,fetchImpl:fetch})
for(const accessTokenHeader of ['Authorization','X-DIO-Access-Token']){
  test(`캔버스 transport의 회원 토큰을 Basic 값으로 덮어쓰지 않는다: ${accessTokenHeader}`,async()=>{
    let sent
    const auth={getSessionKey:()=> 'session',getAccessToken:async()=> 'member-token',
      getConnectionOptions:()=>({getAuthHeaders:()=>({Authorization:'Basic test-only','X-DIO-Access-Token':'member-token'})})}
    const fetchImpl=build(accessTokenHeader,{Authorization:'Basic test-only'},async(_url,options)=>{sent=options;return new Response('{}')})
    const request=createAuthenticatedMemberTransport({auth,accountId:'10',baseUrl:'https://api.example.test/api/v1',accessTokenHeader,fetchImpl})
    await request({path:'/pages/page-id/canvas'})
    assert.equal(sent.headers.Authorization,'Basic test-only')
    assert.equal(sent.headers['X-DIO-Access-Token'],'member-token')
    assert.equal(sent.redirect,'error')
  })
}
test('이전 Bearer 경로는 회원 토큰만 옮기고 원본 요청은 보존한다',async()=>{
  let sent
  const fetchImpl=build('Authorization',{Authorization:'Basic test-only'},async(_url,options)=>{sent=options})
  const options={headers:{Authorization:'Bearer member-token'}}
  await fetchImpl('https://api.example.test/api/v1/pages/id',options)
  assert.equal(sent.headers['X-DIO-Access-Token'],'member-token')
  assert.equal(options.headers.Authorization,'Bearer member-token')
})
test('Basic 인증만 있으면 회원 토큰으로 복사하지 않으며 배포 Bearer 경로는 유지한다',async()=>{
  let sent
  await build('Authorization',{Authorization:'Basic test-only'},async(_url,options)=>{sent=options})('https://api.example.test/api/v1/pages/id',{headers:{Authorization:'Basic test-only'}})
  assert.equal(sent.headers['X-DIO-Access-Token'],undefined)
  await build('Authorization',{},async(_url,options)=>{sent=options})('https://api.example.test/api/v1/pages/id',{headers:{Authorization:'Bearer member-token'}})
  assert.equal(sent.headers.Authorization,'Bearer member-token')
  assert.equal(sent.headers['X-DIO-Access-Token'],undefined)
})
