export const SORT_OPTIONS = [
  { id: 'updated', label: '최근 수정순' },
  { id: 'created', label: '최근 생성순' },
  { id: 'pages', label: '페이지 많은 순' },
  { id: 'title', label: '이름순' },
];
// 정렬 값은 'title' 처럼 기준만 쓰거나 'title:desc' 처럼 방향을 붙인다. 방향이 없으면 기준마다 정한 기본 방향이다.
// 기본: 수정 · 생성은 최근이 앞(내림차순), 페이지는 많은 쪽이 앞(내림차순), 이름은 가나다순(오름차순).
const DEFAULT_DIRECTION = { updated: 'desc', created: 'desc', pages: 'desc', title: 'asc' };
export function parseSort(sort = 'updated') {
  const [key, dir] = String(sort).split(':');
  const base = key in DEFAULT_DIRECTION ? key : 'updated';
  return { key: base, direction: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIRECTION[base] };
}
export const formatSort = (key, direction) => (direction === DEFAULT_DIRECTION[key] ? key : `${key}:${direction}`);
/** 같은 기준을 다시 고르면 방향을 뒤집고, 다른 기준을 고르면 그 기준의 기본 방향으로 간다. */
export function nextSort(current, key) {
  const now = parseSort(current);
  return now.key === key ? formatSort(key, now.direction === 'asc' ? 'desc' : 'asc') : key;
}
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export const createdTime = diary => time(diary.originalCreatedAt) || time(diary.createdAt) || Number(/^diary-(\d+)$/.exec(diary.id)?.[1]) || 0;
/** 서버의 생성순 목록에서 옮겨 온 다이어리를 처음 만든 날짜 자리로 보낸다. 서버는 옮긴 시각으로 정렬한다. */
export const sortMovedByCreated = diaries => diaries.some(diary => diary.originalCreatedAt)
  ? diaries.map((diary, index) => ({ diary, index })).sort((a, b) => createdTime(b.diary) - createdTime(a.diary) || a.index - b.index).map(({ diary }) => diary)
  : diaries;
const titleKey = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('ko');
export const isSharedDiary = diary => Boolean(diary.sharedDiaryId || diary.isShared);
// 보관함 필터는 '범위(왼쪽 메뉴: 내 다이어리 · 공유된 다이어리)'와 '즐겨찾기만(화면 위 칩)' 두 가지를 한 문자열로 담는다.
// 'personal' · 'personal:favorite' · 'shared' · 'shared:favorite'. 예전 값 'all' · 'favorite' 은 범위 없이 전체로 읽는다.
export const filterScope = filter => String(filter).split(':')[0] === 'shared' ? 'shared' : String(filter).split(':')[0] === 'personal' ? 'personal' : 'all';
export const filterFavorite = filter => filter === 'favorite' || String(filter).endsWith(':favorite');
export const withFavorite = (filter, favorite) => {
  const scope = filterScope(filter);
  return scope === 'all' ? (favorite ? 'favorite' : 'all') : `${scope}${favorite ? ':favorite' : ''}`;
};
export function queryDiaries(diaries, { filter = 'all', query = '', sort = 'updated', metadata = {} } = {}) {
  const needle = titleKey(query);
  const metric = diary => metadata[diary.id] ?? {};
  const { key, direction } = parseSort(sort);
  const flip = direction === DEFAULT_DIRECTION[key] ? 1 : -1;
  const scope = filterScope(filter), favorite = filterFavorite(filter);
  return diaries.filter(d => !d.trashedAt && (!favorite || d.favorite) && (scope !== 'shared' || isSharedDiary(d)) && (scope !== 'personal' || !isSharedDiary(d)) && titleKey(d.title).includes(needle))
    .map((diary, index) => ({ diary, index }))
    .sort((a, b) => {
      const x = a.diary, y = b.diary;
      const result = flip * (key === 'title' ? titleKey(x.title).localeCompare(titleKey(y.title), 'ko', { numeric: true })
        : key === 'pages' ? (metric(y).pageCount ?? 0) - (metric(x).pageCount ?? 0)
        : key === 'created' ? createdTime(y) - createdTime(x)
        : Math.max(time(y.updatedAt), time(metric(y).updatedAt), createdTime(y)) - Math.max(time(x.updatedAt), time(metric(x).updatedAt), createdTime(x)));
      return result || a.index - b.index;
    }).map(({ diary }) => diary);
}

// 빈 내 다이어리의 옮기기 입구: 회원에게 옮길 다이어리가 있을 때(guestImport)만, 즐겨찾기 · 공유 빈 화면에는 두지 않는다
export function emptyGuestImportAction(guestImport, scopeId, favoriteOnly) {
  if (!guestImport || scopeId !== 'personal' || favoriteOnly) return null;
  return { label: `이 기기의 다이어리 ${guestImport.count}권 옮기기`, onPress: guestImport.open };
}
