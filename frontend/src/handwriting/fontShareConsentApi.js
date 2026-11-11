// 폰트 공유 동의 서버 API(계정 단위). 요청 함수는 주입받는다(테스트에서 바꿔 끼운다).
// GET/PUT /api/v1/handwriting-fonts/share-consent → { status: 'GRANTED' | 'DENIED' | 'NOT_ASKED', changedAt }
export const FONT_SHARE_CONSENT_PATH = '/handwriting-fonts/share-consent'
const STATUS = { GRANTED: 'granted', DENIED: 'denied', NOT_ASKED: null }
const invalid = () => Object.assign(Error('폰트 공유 설정을 확인하지 못했어요.'), { code: 'INVALID_FONT_SHARE_CONSENT' })
const read = result => {
  if (!result || typeof result !== 'object' || !Object.hasOwn(STATUS, result.status)) throw invalid()
  return STATUS[result.status]
}

export function createFontShareConsentApi(transport) {
  return {
    /** 'granted' | 'denied' | null(아직 묻지 않음) */
    async load() { return read(await transport({ method: 'GET', path: FONT_SHARE_CONSENT_PATH })) },
    /** onlyIfNotAsked: 서버에 답이 없을 때만 쓴다(기기에만 있던 예전 답 옮기기). 서버에 남은 값을 돌려준다 */
    async save(value, { onlyIfNotAsked = false } = {}) {
      if (value !== 'granted' && value !== 'denied') throw Error('폰트 공유 설정 값을 확인해 주세요.')
      const saved = read(await transport({ method: 'PUT', path: FONT_SHARE_CONSENT_PATH,
        body: { agreed: value === 'granted', onlyIfNotAsked: onlyIfNotAsked === true } }))
      if (!saved) throw invalid()
      return saved
    },
  }
}
