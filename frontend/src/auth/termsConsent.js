import { marketingDocuments } from '../shared/legalDocuments.js'
import { signupTermsVersions } from './signupPolicy.js'

export const optionalTerms = marketingDocuments
const knownTypes = new Set(optionalTerms.map(item => item.termsType))
const validStamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const failure = (code, message) => Object.assign(new Error(message), { code })

// Only a complete, valid server snapshot enables changes.
export function readTermsConsents(items) {
  if (!Array.isArray(items)) throw failure('INVALID_TERMS_RESPONSE', '동의 상태를 확인하지 못했어요.')
  const result = {}
  for (const item of items) {
    if (!optionalTerms.some(row => row.termsType === item?.termsType)) continue
    if (result[item.termsType] || typeof item.termsVersion !== 'string' || !item.termsVersion.trim() || typeof item.agreed !== 'boolean'
      || !['CURRENT_VERSION', 'NOT_RECORDED', 'PREVIOUS_VERSION_ONLY'].includes(item.recordStatus)
      || (item.recordStatus === 'CURRENT_VERSION' ? !validStamp(item.agreedAt) : item.agreed !== false || item.agreedAt !== null))
      throw failure('INVALID_TERMS_RESPONSE', '동의 상태를 확인하지 못했어요.')
    result[item.termsType] = { ...item }
  }
  if (Object.keys(result).length !== optionalTerms.length) throw failure('INVALID_TERMS_RESPONSE', '동의 상태를 확인하지 못했어요.')
  return result
}

export function createTermsConsentApi(transport) {
  return {
    async load() {
      const result = await transport({ method: 'GET', path: '/me/terms' })
      return readTermsConsents(result?.agreements)
    },
    async update(type, agreed, version) {
      if (Object.hasOwn(signupTermsVersions, type) && agreed === false) throw failure('REQUIRED_TERMS_NOT_AGREED', '필수 약관 동의 철회는 회원 탈퇴 절차를 이용해 주세요.')
      if (!knownTypes.has(type) || typeof version !== 'string' || !version.trim() || typeof agreed !== 'boolean') throw failure('INVALID_TERMS', '동의 항목과 값을 확인해 주세요.')
      const result = await transport({ method: 'PUT', path: `/me/terms/${type}/${encodeURIComponent(version)}`, body: { agreed } })
      if (result?.termsType !== type || result.termsVersion !== version || result.agreed !== agreed
        || typeof result.agreedAt !== 'string' || !Number.isFinite(Date.parse(result.agreedAt)))
        throw failure('INVALID_TERMS_RESPONSE', '저장된 동의 정보를 확인하지 못했어요. 같은 선택으로 다시 시도해 주세요.')
      return { termsType: type, termsVersion: version, agreed, agreedAt: result.agreedAt }
    },
  }
}

// Bind every change to the version confirmed for the current login session.
export function createTermsConsentRuntime({ auth, accountId, api }) {
  const sessionKey = auth.getSessionKey(), pending = new Map()
  let disposed = false, rows = null, loading = null
  const active = () => {
    if (disposed || !sessionKey || auth.getSessionKey() !== sessionKey || String(auth.getCurrentUserId()) !== String(accountId))
      throw failure('STALE_ACCOUNT', '로그인 계정이 바뀌었어요. 다시 열어 주세요.')
  }
  return {
    load() {
      try { active() } catch (error) { return Promise.reject(error) }
      if (loading) return loading
      if (pending.size) return Promise.reject(failure('TERMS_PENDING', '저장 결과를 먼저 확인해 주세요.'))
      loading = (async () => {
        try { const result = await api.load(); active(); rows = result; return result }
        catch (error) { active(); rows = null; throw error }
      })().finally(() => { loading = null })
      return loading
    },
    update(type, agreed) {
      try { active() } catch (error) { return Promise.reject(error) }
      if (!rows?.[type] || loading) return Promise.reject(failure('TERMS_NOT_READY', '동의 상태를 먼저 불러와 주세요.'))
      const current = pending.get(type)
      if (current) return current.agreed === agreed ? current.promise
        : Promise.reject(failure('TERMS_PENDING', '이 항목의 저장 결과를 먼저 확인해 주세요.'))
      const promise = (async () => {
        try { const result = await api.update(type, agreed, rows[type].termsVersion); active(); rows[type] = { ...result, recordStatus: 'CURRENT_VERSION' }; return result }
        catch (error) { active(); throw error }
      })().finally(() => pending.delete(type))
      pending.set(type, { agreed, promise }); return promise
    },
    dispose() { disposed = true },
  }
}
