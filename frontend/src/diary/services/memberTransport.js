import { createHttpTransport, DiaryApiError } from './diaryApi.js'

export function createAuthenticatedMemberTransport({ auth, accountId, ...options }) {
  const sessionKey = auth.getSessionKey()
  const requireSession = () => {
    if (!sessionKey || auth.getSessionKey() !== sessionKey) throw new DiaryApiError('UNAUTHENTICATED', '다시 로그인해 주세요.', 401)
  }
  const transport = createHttpTransport({ ...options,
    getAuthHeaders: auth.getConnectionOptions?.().getAuthHeaders,
    getAccessToken: async () => {
    requireSession()
    const token = await auth.getAccessToken({ userId: accountId, sessionKey })
    requireSession()
    return token
  } })
  return async request => {
    try { return await transport(request) }
    catch (error) {
      if (error.status !== 401) throw error
      requireSession()
      await auth.refresh()
      requireSession()
      // Same request/key; never retry using another login session's token.
      return transport(request)
    }
  }
}
