import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createAuthenticatedMemberTransport } from '../../diary/services/memberTransport.js'
import { createMemberPagePosition } from '../../sharing/memberPagePosition.js'

export function useMemberPagePosition({ diary, pageId, loaded }) {
  const runtime = useRef(null)
  const latestPage = useRef(pageId)
  latestPage.current = pageId
  const sessionKey = authService.getSessionKey()
  useEffect(() => {
    if (!loaded || diary?.source !== 'member-api' || !sessionKey) return
    const position = createMemberPagePosition({ diaryId: diary.id,
      isActive: () => authService.getSessionKey() === sessionKey,
      transport: createAuthenticatedMemberTransport({ auth: authService, accountId: diary.memberAccountId,
        baseUrl: apiBaseUrl, accessTokenHeader, fetchImpl: memberFetch }) })
    runtime.current = position
    void position.visit(latestPage.current)
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') void position.visit(latestPage.current)
    })
    return () => { subscription.remove(); position.dispose(); runtime.current = null }
  }, [loaded, diary?.source, diary?.id, diary?.memberAccountId, sessionKey])
  useEffect(() => { if (loaded) void runtime.current?.visit(pageId) }, [loaded, pageId, sessionKey])
}
