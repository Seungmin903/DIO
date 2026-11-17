import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../auth/authService'
import { createAuthenticatedMemberTransport } from '../diary/services/memberTransport.js'

const path = '/handwriting-fonts/generation-slot'
const owner = () => {
  const accountId = authService.getCurrentUserId()
  return accountId && authService.getSessionKey() ? JSON.stringify([apiBaseUrl, String(accountId)]) : null
}

function request(expectedOwner, options) {
  if (!expectedOwner || owner() !== expectedOwner) throw Error('이 폰트를 만들던 계정으로 로그인해 주세요.')
  const transport = createAuthenticatedMemberTransport({
    auth: authService, accountId: authService.getCurrentUserId(), baseUrl: apiBaseUrl,
    accessTokenHeader, fetchImpl: memberFetch,
  })
  return transport({ path, ...options })
}

export const fontGenerationSlot = {
  owner,
  async check(expectedOwner, generationId) {
    const slot = await request(expectedOwner, { method: 'GET' })
    if (!slot || !Object.hasOwn(slot, 'generationId')) throw Error('폰트 생성 한도를 확인하지 못했어요.')
    if (slot.generationId && slot.generationId !== generationId) {
      throw Error('한 계정에서 손글씨 폰트는 1개까지 만들 수 있어요.')
    }
  },
  async update(expectedOwner, generationId, action) {
    try {
      await request(expectedOwner, { method: 'PUT', body: { generationId, action } })
    } catch (error) {
      if (error.code === 'FONT_GENERATION_LIMIT') error.message = '한 계정에서 손글씨 폰트는 1개까지 만들 수 있어요.'
      throw error
    }
  },
}
