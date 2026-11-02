import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { createNativePushAdapter } from './nativePushAdapter.js';
import { createPushInstallationApi } from './pushInstallationApi.js';
import { createPushCoordinator } from './pushCoordinator.js';
import { resolvePushInvitation } from './pushInvitationClick.js';

/** 기본 비활성. 명시적 빌드 설정이 없으면 OS 권한도 요청하지 않는다. */
export async function startPushRuntime({ auth, userId, invitations, onInvitation, onError = () => {} }) {
 if (process.env.EXPO_PUBLIC_PUSH_ENABLED !== 'true') return () => {};
 const sessionKey=auth.getSessionKey();let stopped=false, retryTimer=null, attempts=0;
 const projectId=Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
 const native=createNativePushAdapter({notifications:Notifications,secureStore:SecureStore,platform:Platform.OS,projectId});
 const api=createPushInstallationApi({auth,userId,allowDevelopmentHttp:__DEV__});
 const coordinator=createPushCoordinator({auth,userId,api,native,uuid:randomUUID,platform:Platform.OS==='ios'?'IOS':'ANDROID'});
 const sync=()=>{
  if(stopped || auth.getSessionKey()!==sessionKey)return;
  if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
  coordinator.sync().then(()=>{attempts=0;}).catch(error=>{
   if(stopped || auth.getSessionKey()!==sessionKey)return;
   onError(error);
   // 인증·보관 충돌은 무한 재시도하지 않는다. 일시적 네트워크 실패는 앱이 켜져 있는 동안 재시도한다.
   if(!['PUSH_RECOVERY_REQUIRES_ORIGINAL_ACCOUNT','PUSH_STORAGE_CORRUPT','PUSH_SESSION_CHANGED','PUSH_INVALID_RESPONSE','PUSH_INVALID_ID','PUSH_INVALID_TOKEN','PUSH_NATIVE_NOT_CONFIGURED'].includes(error?.message) && (!error?.status || error.status>=500 || error.status===429 || (error?.message==='PUSH_BINDING_CONFLICT' && attempts<5))) {
    const delay=Math.min(300000,1000*2**Math.min(attempts++,8));retryTimer=setTimeout(sync,delay);
   }
  });
 };
 const onTap=async (data,identifier)=>{try{
  const target=await resolvePushInvitation({data,auth,invitations});
  if(!stopped && target && auth.getSessionKey()===sessionKey){
   onInvitation(target);
   const last=await Notifications.getLastNotificationResponseAsync();
   if(identifier && last?.notification?.request?.identifier===identifier) await Notifications.clearLastNotificationResponseAsync();
  }
 }catch(error){if(!stopped && auth.getSessionKey()===sessionKey)onError(error);}};
 const stopNotifications=await native.observe({onTap,onTokenChanged:sync});
 const state=AppState.addEventListener('change',next=>{if(next==='active'&&!stopped)sync();});
 sync();return ()=>{stopped=true;if(retryTimer)clearTimeout(retryTimer);state.remove();stopNotifications();};
}
