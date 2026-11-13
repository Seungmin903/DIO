import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl } from '../../auth/authService'
import { createMediaRequest } from '../../collaboration/canvasMedia.js'
import { entries } from '../utils/mediaRepository'

let current
export function checkMemberPhotoCapacity(count, photos) {
  const accountId = authService.getCurrentUserId(), sessionKey = authService.getSessionKey()
  if (!accountId || !sessionKey) throw Object.assign(Error('사진 보관함 연결을 확인한 뒤 다시 시도해 주세요.'), { code: 'PHOTO_LIBRARY_NOT_READY' })
  if (!current || current.accountId !== accountId || current.sessionKey !== sessionKey) {
    current = { accountId, sessionKey, request: createMediaRequest({ auth: authService, accountId, sessionKey, baseUrl: apiBaseUrl, fetchImpl: memberFetch, photoStorage: AsyncStorage, photoEntries: entries }) }
  }
  return current.request.checkPhotoCapacity(count, photos)
}
