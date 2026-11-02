/** 네이티브 SDK 호출 경계. 호출자가 로그인 세션 및 저장·재시도 순서를 관리한다. */
export function createNativePushAdapter({ notifications, secureStore, platform, projectId, tokenTimeoutMs = 20000 }) {
  const storageKey = 'dio.push.installation.v1';
  return {
    async requestToken() {
      if (!['android','ios'].includes(platform) || !projectId) throw new Error('PUSH_NATIVE_NOT_CONFIGURED');
      if (platform === 'android') await notifications.setNotificationChannelAsync('default', { name:'알림', importance: notifications.AndroidImportance.DEFAULT });
      let permission = await notifications.getPermissionsAsync();
      if (permission.status !== 'granted' && permission.canAskAgain !== false) permission = await notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') return { permission:'DENIED', token:null };
      let timer;
      const timeout = new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('PUSH_TOKEN_TIMEOUT')),tokenTimeoutMs);});
      let result;
      try { result=await Promise.race([notifications.getExpoPushTokenAsync({ projectId }),timeout]); }
      finally {clearTimeout(timer);}
      if (!/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(result?.data || '')) throw new Error('PUSH_INVALID_TOKEN');
      return { permission:'GRANTED', token:result.data };
    },
    read: () => secureStore.getItemAsync(storageKey),
    save: value => secureStore.setItemAsync(storageKey, value),
    async observe({ onTap, onTokenChanged }) {
      let lastDeliveredId = null;
      const handle = event => { lastDeliveredId = event?.notification?.request?.identifier || null; onTap(event?.notification?.request?.content?.data, lastDeliveredId); };
      const response = notifications.addNotificationResponseReceivedListener(handle);
      const token = notifications.addPushTokenListener(() => onTokenChanged());
      try {
        const last = await notifications.getLastNotificationResponseAsync();
        if (last && (!lastDeliveredId || last.notification?.request?.identifier !== lastDeliveredId)) handle(last);
        return () => { response.remove(); token.remove(); };
      } catch (error) { response.remove(); token.remove(); throw error; }
    },
  };
}
