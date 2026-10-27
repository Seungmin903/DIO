// 계정별 회원 캐시. 비회원 목록/문서 prefix를 사용하지 않는다.
export function memberKeys(accountId) {
  if (typeof accountId !== 'string' || !/^[1-9]\d*$/.test(accountId)) throw new Error('로그인 사용자 정보를 확인해 주세요.')
  const prefix = `dio:member:v1:${accountId}`
  return { index: `${prefix}:index`, pending: `${prefix}:pending-create`, doc: id => `${prefix}:doc:${id}` }
}
export function memberDocumentKey(diary) {
  return diary?.source === 'member-api' ? memberKeys(diary.memberAccountId).doc(diary.id) : null
}
