// 잠금 이름은 expo-screen-orientation의 OrientationLock 키와 같다.
export function orientationLockFor(formFactor, allowLandscape, preferred) {
  if (formFactor !== 'phone') return 'DEFAULT'
  if (!allowLandscape) return 'PORTRAIT_UP'
  if (preferred) return preferred === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT_UP'
  return 'DEFAULT'
}
