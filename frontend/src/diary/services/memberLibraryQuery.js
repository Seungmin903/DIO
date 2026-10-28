// The UI's historical "personal" tab means ALL diaries, not the API's personal filter.
export function memberLibraryQuery({ query = '', searchOpen = false, sort = 'updated', filter = 'personal' } = {}) {
  return { q: searchOpen ? query.trim() : '', sort, filter: filter === 'shared' ? 'shared' : 'all', favorite: filter === 'favorite' }
}

export function normalizeMemberLibraryQuery({ q = '', sort = 'updated', filter = 'all', favorite = false } = {}) {
  if (typeof q !== 'string' || q.trim().length > 100 || !['updated', 'created', 'title', 'pages'].includes(sort)
      || !['all', 'personal', 'shared'].includes(filter) || typeof favorite !== 'boolean') {
    throw Object.assign(new Error('검색어는 100자까지 입력할 수 있어요. 조회 조건을 확인해 주세요.'), { code: 'INVALID_DIARY_LIST_QUERY', status: 400 })
  }
  return { q: q.trim(), sort, filter, favorite }
}
