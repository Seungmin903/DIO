// 도구 줄에 3색 칸(144)을 더해도 밀지 않고 들어가는 창 폭(세로 태블릿 · 분할 화면은 없음)
export const PRESET_MIN_WIDTH = 840;
export const PRESET_COUNT = 3;

// 팔레트와 도구 설정이 같은 색을 다른 대소문자로 들고 있어도 같은 칸으로 본다
export const sameColor = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

// 칸을 눌렀을 때: 그 도구를 쓰는 중에 고른 칸을 다시 누르면 설정, 그 밖에는 색 고르기(다른 도구 중이면 그 도구로 돌아온다)
export const presetPress = ({ chosen, active }) => (chosen && active ? 'settings' : 'pick');
