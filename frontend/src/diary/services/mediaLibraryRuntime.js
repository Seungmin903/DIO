import AsyncStorage from '@react-native-async-storage/async-storage'
import { memberDocumentKey } from './memberStorage.js'
import { mediaService } from '../../editor/services/mediaStore'
import { mediaDisplayName } from '../../editor/utils/mediaImport.js'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createAuthenticatedMemberTransport } from './memberTransport.js'
import { createMediaRequest } from '../../collaboration/canvasMedia.js'
import { createMediaLibraryApi, canSelectMediaPhoto, mediaLibraryMaxBytes } from './mediaLibraryApi.js'
import { canvasMediaFiles } from '../../editor/services/canvasMediaFiles'

export function createMediaLibraryRuntime(diary) {
  const sessionKey=authService.getSessionKey(),accountId=authService.getCurrentUserId()
  const active=()=>{if(!sessionKey||!accountId||authService.getCurrentUserId()!==accountId||authService.getSessionKey()!==sessionKey||diary?.source!=='member-api'||String(diary.memberAccountId)!==accountId)throw Object.assign(Error('로그인 상태가 변경됐어요.'),{status:401})}
  active()
  const request=createAuthenticatedMemberTransport({auth:authService,accountId,baseUrl:apiBaseUrl,accessTokenHeader,fetchImpl:memberFetch})
  const api=createMediaLibraryApi({transport:async options=>{active();const result=await request(options);active();return result},fileRequest:createMediaRequest({auth:authService,accountId,sessionKey,baseUrl:apiBaseUrl,fetchImpl:memberFetch})})
  const selectable=row=>{if(!canSelectMediaPhoto(row)){const limit=mediaLibraryMaxBytes(row)/1024/1024;throw Object.assign(Error(`사진은 5MB 이하, GIF는 ${limit}MB 이하만 선택할 수 있어요.`),{status:413,code:'MEDIA_FILE_TOO_LARGE'})}}
  return {
    ...api,
    async previewCached(row) { active();if(!canSelectMediaPhoto(row))return false;const cached=await canvasMediaFiles.cached(row.mediaFileId);active();return cached },
    async selectPhoto(row,diary) {
      active();selectable(row)
      row=await api.get(row.mediaFileId);active()
      selectable(row)
      await this.preview(row);active()
      const {media}=await mediaService.get(row.mediaFileId);active()
      if(diary?.source!=='member-api'||String(diary.memberAccountId)!==String(accountId))throw Error('서버 다이어리를 다시 열어 주세요.')
      await AsyncStorage.setItem(`${memberDocumentKey(diary)}:media-uploads:v1:${encodeURIComponent(apiBaseUrl)}:${row.mediaFileId}`,row.mediaFileId);active()
      return {...media,src:`media:${row.mediaFileId}`,mediaFileId:row.mediaFileId,name:mediaDisplayName(row.originalFilename),serverStored:true}
    },
    async preview(row) {
      active()
      selectable(row)
      if(!await canvasMediaFiles.cached(row.mediaFileId)){
        const bytes=await api.file(row.mediaFileId);active()
        await canvasMediaFiles.save(row.mediaFileId,bytes);active()
      }
      return row.mediaFileId
    },
  }
}
