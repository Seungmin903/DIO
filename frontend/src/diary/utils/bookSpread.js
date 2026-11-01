// 펼쳐서 보기의 펼침면 계산(OpenBookShelf). 화면 부품과 떼어 두어 테스트한다.

/** 가장 최근에 무언가를 붙인 쪽 번호(1부터). 다 비어 있으면 1. */
function latestNumber(pages) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    if (pages[index].objects?.some(object => !object.hidden)) return index + 1;
  }
  return 1;
}

/** 가장 최근 쪽이 보이는 펼침면. 좌철이라 오른쪽이 홀수 쪽: 1쪽이면 왼쪽은 면지, 짝수 쪽이면 오른쪽은 다음 쪽(없으면 빈 종이). */
export function spreadOf(pages) {
  if (!pages?.length) return null;
  const n = latestNumber(pages), total = pages.length;
  const [left, right] = n === 1 ? [0, 1] : n % 2 ? [n - 1, n] : [n, n + 1];
  return { left: left ? pages[left - 1] : 'endpaper', right: pages[right - 1] ?? 'blank', latest: n, total,
    label: left && right <= total ? `${left}–${right} / ${total}` : `${n} / ${total}` };
}
