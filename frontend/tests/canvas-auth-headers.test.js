import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasFetch, createCanvasHttpFetch } from '../src/collaboration/canvasFetch.js'
import { createAuthenticatedMemberTransport } from '../src/diary/services/memberTransport.js'
import { createAuthApi } from '../src/auth/authApi.js'
import { createCanvasWriteApi } from '../src/collaboration/canvasWriteApi.js'

const build=(header,extra,fetch)=>createCanvasFetch({headersFor:()=>extra,accessTokenHeader:header,fetchImpl:fetch})

for(const development of [false,true])test(`실제 인증·HTTP transport로 멤버 분기를 조회할 때 전용 bridge를 호출하지 않는다 (${development?'Basic':'Bearer'})`,async()=>{
 const baseUrl='https://api.example.test/api/v1',pageId='10000000-0000-4000-8000-000000000001',diaryId='20000000-0000-4000-8000-000000000001'
 const calls=[]
 const rawFetch=async(url,options)=>{
  calls.push({url,options})
  const body=url.endsWith('/auth/login')?{accessToken:'member-token',refreshToken:'refresh-token',expiresIn:3600,user:{userId:'10',email:'qa@example.test',nickname:'테스트'}}
   :url.endsWith('/members')?{members:[{userId:'10',role:'OWNER'}]}:url.endsWith(`/pages/${pageId}`)?{page:{pageId,diaryId}}:{items:[]}
  return new Response(JSON.stringify(body),{status:200})
 }
 const auth=createAuthApi({baseUrl,fetchImpl:rawFetch,allowDevelopmentAccess:development})
 assert.doesNotThrow(()=>auth.getConnectionOptions())
 if(development)auth.verificationService.setDevelopmentAccess('test-user','test-password')
 await auth.login({email:'qa@example.test',password:'test-password'})
 const sessionKey=auth.getSessionKey()
 assert.throws(()=>auth.getCollaborationHeaders({url:`${baseUrl}/diaries/${diaryId}/members`,userId:'10',sessionKey}),{code:'AUTHENTICATION_REQUIRED'})
 let bridgeCalls=0
 const fetchImpl=createCanvasHttpFetch({auth,headersFor:()=>{bridgeCalls++;throw Error('page-only bridge')},accessTokenHeader:'Authorization',fetchImpl:rawFetch})
 const transport=createAuthenticatedMemberTransport({auth,accountId:'10',baseUrl,accessTokenHeader:'Authorization',fetchImpl})
 assert.deepEqual(await createCanvasWriteApi(transport,undefined,diaryId).load(pageId,diaryId),[])
 assert.equal(bridgeCalls,0)
 for(const {options} of calls.filter(call=>!call.url.endsWith('/auth/login'))){
  assert.equal(options.headers[development?'X-DIO-Access-Token':'Authorization'],development?'member-token':'Bearer member-token')
  if(development)assert.match(options.headers.Authorization,/^Basic /)
 }
 const before=calls.length
 const wrongAccount=createAuthenticatedMemberTransport({auth,accountId:'999',baseUrl,accessTokenHeader:'Authorization',fetchImpl})
 await assert.rejects(wrongAccount({path:`/pages/${pageId}`}))
 assert.equal(calls.slice(before).some(call=>call.url.includes('/pages/')),false)
})

test('공통 HTTP 경로도 생성 이후 세션이 바뀌면 이전 요청을 전송하지 않는다',async()=>{
 let session='first',calls=0
 const auth={getSessionKey:()=>session,getAccessToken:async()=> 'token',getConnectionOptions:()=>({getAuthHeaders:()=>({})})}
 const fetchImpl=createCanvasHttpFetch({auth,fetchImpl:async()=>{calls++;return new Response('{}')}})
 const transport=createAuthenticatedMemberTransport({auth,accountId:'1',baseUrl:'https://api.example.test/api/v1',fetchImpl})
 session='second'
 await assert.rejects(transport({path:'/pages/id'}),{code:'UNAUTHENTICATED'})
 assert.equal(calls,0)
})
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
