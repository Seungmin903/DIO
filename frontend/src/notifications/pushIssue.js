// 기기 알림(푸시) 연결에서 앱이 스스로 복구하지 못하는 문제를 사용자에게 보이는 상태로 바꾼다(S15P31F106-719).
// 전에는 어떤 409 든 '이전에 사용한 계정으로 로그인해 …' 한 문구로 팝업을 띄우고, 띄운 기록이 앱 메모리에만 있어 실행할 때마다 다시 떴다.
// 이제 (1) 원래 계정이 필요한 경우와 그 밖의 충돌을 구분하고, (2) 상태는 알림 설정 화면에 줄로 보여 주며, (3) 팝업은 같은 상태(signature)에 한 번만 띄운다(기기에 기록).

/** 원래 계정이 필요한 오류와 구분해 둘 다른 충돌. PUSH_BINDING_CONFLICT 는 조정자가 최신 버전으로 다시 결합하므로 문제로 보지 않는다 */
const RETRIED = new Set(['PUSH_BINDING_CONFLICT'])

/**
 * 푸시 동기화 오류 → 보여 줄 문제 { kind, title, message, signature } 또는 null(일시적 · 자동 복구 대상).
 * signature 는 "같은 상태"를 가르는 열쇠다: 계정 · 설치 · 원래 계정이 같으면 같은 문제다.
 */
export function pushIssueOf(error, userId) {
  const code = typeof error?.message === 'string' ? error.message : ''
  const user = String(userId ?? '')
  if (code === 'PUSH_RECOVERY_REQUIRES_ORIGINAL_ACCOUNT') {
    return {
      kind: 'original-account',
      title: '기기 알림 연결',
      message: '이전 계정의 알림 연결이 끝나지 않아 이 계정은 기기 알림을 받지 못해요. 이전 계정으로 로그인하면 연결이 정리돼요.',
      signature: ['original-account', user, error.installationId ?? '', error.registrationUser ?? ''].join(':'),
    }
  }
  if (error?.status === 409 && !RETRIED.has(code)) {
    return {
      kind: 'conflict',
      title: '기기 알림 연결',
      message: '이 기기의 알림 연결 정보가 서버와 달라 기기 알림을 받지 못해요.',
      signature: ['conflict', user, code].join(':'),
    }
  }
  return null
}

/**
 * 같은 문제의 팝업을 한 번만 띄우기 위한 기록. load() → 마지막으로 알린 signature | null, save(signature).
 * notifyOnce(issue) → true 면 이번에 알려야 한다(기록까지 끝남), false 면 이미 알린 같은 상태다.
 */
export function createPushIssueMemory({ load, save }) {
  return {
    async notifyOnce(issue) {
      const seen = await load()
      if (seen === issue.signature) return false
      await save(issue.signature)
      return true
    },
  }
}
