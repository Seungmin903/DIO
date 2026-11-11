import { filterFavorite, filterScope, parseSort } from '../utils/libraryQuery.js'

// UI 필터의 범위(내 다이어리 'personal' · 공유된 다이어리 'shared', 범위 없음은 'all')가 API filter, ':favorite'(즐겨찾기)이 API favorite.
export function memberLibraryQuery({ query = '', searchOpen = false, sort = 'updated', filter = 'all' } = {}) {
  // 방향(예: title:desc)은 서버로 보내지 않고 화면에서 받은 목록을 뒤집어 처리한다.
  return { q: searchOpen ? query.trim() : '', sort: parseSort(sort).key, filter: filterScope(filter), favorite: filterFavorite(filter) }
}

export function normalizeMemberLibraryQuery({ q = '', sort = 'updated', filter = 'all', favorite = false } = {}) {
  if (typeof q !== 'string' || q.trim().length > 100 || !['updated', 'created', 'title', 'pages'].includes(sort)
      || !['all', 'personal', 'shared'].includes(filter) || typeof favorite !== 'boolean') {
    throw Object.assign(new Error('검색어는 100자까지 입력할 수 있어요. 조회 조건을 확인해 주세요.'), { code: 'INVALID_DIARY_LIST_QUERY', status: 400 })
  }
  return { q: q.trim(), sort, filter, favorite }
}

export function scheduleLibraryQuery(store, query) {
  const run = () => store.queryLibrary(query).catch(() => {})
  if (!query.q) {
    run()
    return
  }
  const timer = setTimeout(run, 200)
  return () => clearTimeout(timer)
}
