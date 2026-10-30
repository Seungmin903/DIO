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
export const createdTime = diary => time(diary.createdAt) || Number(/^diary-(\d+)$/.exec(diary.id)?.[1]) || 0;
const titleKey = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('ko');
export const isSharedDiary = diary => Boolean(diary.sharedDiaryId || diary.isShared);
export function queryDiaries(diaries, { filter = 'all', query = '', sort = 'updated', metadata = {} } = {}) {
  const needle = titleKey(query);
  const metric = diary => metadata[diary.id] ?? {};
  const { key, direction } = parseSort(sort);
  const flip = direction === DEFAULT_DIRECTION[key] ? 1 : -1;
  return diaries.filter(d => !d.trashedAt && (filter !== 'favorite' || d.favorite) && (filter !== 'shared' || isSharedDiary(d)) && (filter !== 'personal' || !isSharedDiary(d)) && titleKey(d.title).includes(needle))
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
