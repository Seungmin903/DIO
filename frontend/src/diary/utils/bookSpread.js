// 펼쳐서 보기의 펼침면 계산(OpenBookShelf). 화면 부품과 떼어 두어 테스트한다.

/** 보이는 요소가 하나라도 있는 쪽인가. 저장 목차에도 이 값을 적어 둔다. */
export const pageHasContent = page => Boolean(page?.objects?.some(object => !object.hidden));

/** 가장 최근에 무언가를 붙인 쪽 번호(1부터). 다 비어 있으면 1. */
export function latestFilledNumber(filled) {
  for (let index = filled.length - 1; index >= 0; index -= 1) {
    if (filled[index]) return index + 1;
  }
  return 1;
}

/** n쪽이 보이는 펼침면의 왼쪽 · 오른쪽 쪽 번호. 0은 면지. */
export const spreadNumbers = n => (n === 1 ? [0, 1] : n % 2 ? [n - 1, n] : [n, n + 1]);

/** 쪽 번호로 쪽을 찾는 함수로 펼침면을 만든다. 일부 쪽만 읽어 온 경우에도 쓴다. */
export function spreadAt(pageAt, n, total) {
  const [left, right] = spreadNumbers(n);
  return { left: left ? pageAt(left) : 'endpaper', right: pageAt(right) ?? 'blank', latest: n, total,
    label: left && right <= total ? `${left}–${right} / ${total}` : `${n} / ${total}` };
}

/** 가장 최근 쪽이 보이는 펼침면. 좌철이라 오른쪽이 홀수 쪽: 1쪽이면 왼쪽은 면지, 짝수 쪽이면 오른쪽은 다음 쪽(없으면 빈 종이). */
export function spreadOf(pages) {
  if (!pages?.length) return null;
  return spreadAt(number => pages[number - 1], latestFilledNumber(pages.map(pageHasContent)), pages.length);
}
