import { parseSort } from '../utils/libraryQuery.js'

// UI 탭 'all'(모든 다이어리)·'favorite'은 API filter 'all', 'personal'(내 다이어리)·'shared'는 같은 이름의 API filter.
export function memberLibraryQuery({ query = '', searchOpen = false, sort = 'updated', filter = 'all' } = {}) {
  // 방향(예: title:desc)은 서버로 보내지 않고 화면에서 받은 목록을 뒤집어 처리한다.
  return { q: searchOpen ? query.trim() : '', sort: parseSort(sort).key, filter: filter === 'shared' || filter === 'personal' ? filter : 'all', favorite: filter === 'favorite' }
}

export function normalizeMemberLibraryQuery({ q = '', sort = 'updated', filter = 'all', favorite = false } = {}) {
  if (typeof q !== 'string' || q.trim().length > 100 || !['updated', 'created', 'title', 'pages'].includes(sort)
      || !['all', 'personal', 'shared'].includes(filter) || typeof favorite !== 'boolean') {
    throw Object.assign(new Error('검색어는 100자까지 입력할 수 있어요. 조회 조건을 확인해 주세요.'), { code: 'INVALID_DIARY_LIST_QUERY', status: 400 })
  }
  return { q: q.trim(), sort, filter, favorite }
}
