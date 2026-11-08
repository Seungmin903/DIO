import { useSyncExternalStore } from 'react'
import { remoteTemplatesSnapshot, subscribeRemoteTemplates } from '../templates/remoteTemplates.js'

/** 원격 속지 목록(catalog.json)이 들어오거나 바뀌면 다시 그린다(속지 고르기). 바뀐 횟수를 돌려준다 */
export const useRemoteTemplates = () => useSyncExternalStore(subscribeRemoteTemplates, remoteTemplatesSnapshot, remoteTemplatesSnapshot)
