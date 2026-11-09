// 안드로이드는 한글을 음절마다 끊어 줄을 바꿔 낱말 가운데가 갈라진다(예: '작 / 성한', '신승 / 민', 2026-11-09 지라 655).
// 낱말 안의 글자 사이에 폭 없는 단어 결합자(U+2060)를 넣어 띄어쓰기에서만 줄이 바뀌게 한다.
// iOS 는 lineBreakStrategyIOS="hangul-word", 웹은 word-break: keep-all 이 같은 일을 하므로 안드로이드에만 쓴다.
// 앱의 Text 는 metro.config.cjs 가 DioText(Pretendard)로 바꿔 그리고, Pretendard 는 U+2060 · U+200B 를 폭 0 글리프로 갖고 있다(폰트 cmap 확인).
// 다른 폰트로 대체되더라도 안드로이드 글자 모양 엔진(HarfBuzz)은 기본 무시 문자(Default_Ignorable)를 보이지 않게 그린다. 줄보다 긴 낱말은 안드로이드가 알아서 끊는다.
const WORD_JOINER = String.fromCharCode(0x2060); // 단어 결합자: 이 자리에서는 줄을 바꾸지 않는다
const BREAK = String.fromCharCode(0x200B); // 폭 없는 빈칸: 이 자리에서 줄을 바꿀 수 있다
const HANGUL = /[가-힣]/;
const SPACE = /\s/;

/**
 * breakAfterDot: '개인정보처리자·운영자'처럼 가운뎃점으로 이은 긴 말은 '·' 뒤에서 줄을 바꿀 수 있게 한다
 * (긴 말이 통째로 넘어가 줄 끝이 크게 비지 않게). '·' 앞은 붙여 '·'가 줄 첫머리에 오지 않게 한다(실기기 확인 2026-11-09).
 */
export function keepKoreanWords(text, os, { breakAfterDot = false } = {}) {
  if (os !== 'android' || typeof text !== 'string') return text;
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const a = text[i], b = text[i + 1];
    out += a;
    if (b === undefined || SPACE.test(a) || SPACE.test(b)) continue;
    if (breakAfterDot && a === '·') out += BREAK;
    else if (HANGUL.test(a) || HANGUL.test(b) || a === '·' || b === '·') out += WORD_JOINER;
  }
  return out;
}
