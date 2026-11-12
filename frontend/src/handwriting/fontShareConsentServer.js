import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../auth/authService'
import { createAuthenticatedMemberTransport } from '../diary/services/memberTransport.js'
import { createFontShareConsentApi } from './fontShareConsentApi.js'

/** 지금 로그인한 계정이 account 일 때만 그 계정의 동의 API 를 준다(다른 계정 · 로그아웃이면 null) */
export function fontShareConsentServer(account) {
  const current = authService.getCurrentUserId()
  if (!account || !current || current !== String(account) || !authService.getSessionKey()) return null
  return createFontShareConsentApi(createAuthenticatedMemberTransport({
    auth: authService, accountId: current, baseUrl: apiBaseUrl, accessTokenHeader, fetchImpl: memberFetch }))
}
