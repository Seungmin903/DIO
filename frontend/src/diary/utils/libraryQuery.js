export const SORT_OPTIONS = [
  { id: 'updated', label: '최근 수정순' },
  { id: 'created', label: '최근 생성순' },
  { id: 'pages', label: '페이지 많은 순' },
  { id: 'title', label: '이름순' },
];
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
export const createdTime = diary => time(diary.createdAt) || Number(/^diary-(\d+)$/.exec(diary.id)?.[1]) || 0;
const titleKey = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('ko');
export function queryDiaries(diaries, { filter = 'personal', query = '', sort = 'updated', metadata = {} } = {}) {
  const needle = titleKey(query);
  const metric = diary => metadata[diary.id] ?? {};
  return diaries.filter(d => !d.trashedAt && (filter !== 'favorite' || d.favorite) && titleKey(d.title).includes(needle))
    .map((diary, index) => ({ diary, index }))
    .sort((a, b) => {
      const x = a.diary, y = b.diary;
      const result = sort === 'title' ? titleKey(x.title).localeCompare(titleKey(y.title), 'ko', { numeric: true })
        : sort === 'pages' ? (metric(y).pageCount ?? 0) - (metric(x).pageCount ?? 0)
        : sort === 'created' ? createdTime(y) - createdTime(x)
        : Math.max(time(y.updatedAt), time(metric(y).updatedAt), createdTime(y)) - Math.max(time(x.updatedAt), time(metric(x).updatedAt), createdTime(x));
      return result || a.index - b.index;
    }).map(({ diary }) => diary);
}
