// React Native AppState와 웹 visibility를 같은 갱신 수명으로 변환한다.
export function createNotificationActivity({ appState, document: webDocument }) {
  let current = appState.currentState;
  return {
    isActive: () => webDocument ? webDocument.visibilityState === 'visible' : current === 'active',
    subscribe(listener) {
      if (webDocument) {
        webDocument.addEventListener('visibilitychange', listener);
        return () => webDocument.removeEventListener('visibilitychange', listener);
      }
      const subscription = appState.addEventListener('change', value => { current = value; listener(); });
      return () => subscription.remove();
    },
  };
}
