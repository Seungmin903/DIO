import { createHttpTransport, DiaryApiError } from './diaryApi.js'

export function createAuthenticatedMemberTransport({ auth, accountId, ...options }) {
  const transport = createHttpTransport({ ...options, getAccessToken: () => auth.getAccessToken(accountId) })
  return async request => {
    try { return await transport(request) }
    catch (error) {
      if (error.status !== 401) throw error
      if (!await auth.getAccessToken(accountId)) throw new DiaryApiError('UNAUTHENTICATED', '다시 로그인해 주세요.', 401)
      await auth.refresh()
      // 같은 요청·키를 유지하며, 다른 계정 토큰으로 재전송하지 않는다.
      return transport(request)
    }
  }
}
