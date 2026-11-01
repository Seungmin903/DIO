# -*- coding: utf-8 -*-
"""시안 목업(안.css · 안.js · 혼합.js)의 색이 '색 규칙 v2'를 지키는지 검사한다.

규칙: 허용 색상각은 UI 계열 H 228~242° · 캐릭터 노랑 H 40~52° · 무채색(채도 8% 이하, 또는 거의 흰색·검정)뿐이다.
예외(코드에서 이름으로 허용): 사용자 콘텐츠(표지 샘플색), 외부 로그인 브랜드색, 기능색 danger.
실행:  python "docs/앱 감성 리뉴얼/스크립트/색 검수.py"          시안 파일 검사
       python "docs/앱 감성 리뉴얼/스크립트/색 검수.py" 표        토큰 표(마크다운) 출력
"""
import colorsys
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
FILES = ["안.css", "안.js", "혼합.js"]
UI, YELLOW = (228, 242), (40, 52)
# 사용자 콘텐츠 · 기능색 예외: 값 → 이유
EXCEPT = {
    "#9FC2C9": "휴지통 샘플 표지(사용자 콘텐츠)",
    "#E04D6F": "기존 기능색 danger(홈 도구 시안에서는 쓰지 않는다)",
    "#B63F7C": "알림 점 전용 쿨톤 핑크(사용자 지시 예외)",
}


def rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def hsl(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return round(h * 360), round(s * 100), round(l * 100)


def lum(c):
    f = lambda v: v / 255 / 12.92 if v / 255 <= .03928 else ((v / 255 + .055) / 1.055) ** 2.4
    r, g, b = [f(v) for v in c]
    return .2126 * r + .7152 * g + .0722 * b


def contrast(a, b):
    la, lb = lum(rgb(a)), lum(rgb(b))
    if la < lb:
        la, lb = lb, la
    return (la + .05) / (lb + .05)


def zone(r, g, b):
    h, s, l = hsl(r, g, b)
    if s <= 8 or l >= 97 or l <= 6:
        return "무채색"
    if UI[0] <= h <= UI[1]:
        return "UI 계열"
    if YELLOW[0] <= h <= YELLOW[1]:
        return "캐릭터 노랑"
    return "이탈"


# 코덱스 토큰(2026-10-31) 중 채택한 것
TOKENS = [
    ("page-bg", "#F3F3F7", "앱 바탕(지금 값 그대로)"), ("card-bg", "#FFFFFF", "카드 · 입력"),
    ("lavender-50", "#F0F1F9", "가장 연한 카드 틴트 · 보드"), ("lavender-100", "#DBDCF9", "보조 카드 · 라벤더 테이프 · 두리 목도리"),
    ("lavender-200", "#ABB1D8", "아바타 원 · 규칙선 · 로고 원"), ("primary", "#818AC3", "핵심 토큰(불변)"),
    ("primaryStrong", "#606BB2", "채운 버튼 · FAB(불변)"), ("navy", "#0B1766", "글자 · 선택 칩(불변)"),
    ("card-border", "#D9DCEF", "카드 · 필드 구분선(장식)"), ("accent-butter", "#FEF0BF", "작은 면 · 상태 칩 · 디오 몸"),
    ("butter-tape", "#FBE5A3", "마스킹테이프"), ("butter-strong", "#B98208", "점 · 짧은 선 · 만료 고리 · 알림 점"),
    ("danger-confirm", "#B52E52", "영구 삭제 확인 단계 한 곳(기능 예외)"),
    ("notify-pink", "#B63F7C", "알림 점 전용 쿨톤 핑크(사용자 지시 예외)"),
]


def table():
    print("| 토큰 | hex | H° | 구분 | 네이비 글자 대비 | 흰 글자 대비 | 용도 |\n|---|---|---:|---|---:|---:|---|")
    for n, h, use in TOKENS:
        r, g, b = rgb(h)
        z = "기능 예외" if n == "danger-confirm" else "사용자 지시 예외" if n == "notify-pink" else zone(r, g, b)
        print(f"| `{n}` | `{h}` | {hsl(r, g, b)[0]} | {z} | {contrast(h, '#0B1766'):.1f} | {contrast(h, '#FFFFFF'):.1f} | {use} |")


def scan():
    bad, seen, total = [], {}, 0
    for name in FILES:
        text = (HERE / "목업" / name).read_text(encoding="utf-8")
        for m in re.finditer(r"#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", text):
            tok = m.group(0)
            if tok.startswith("#"):
                key = tok.upper() if len(tok) == 7 else "#" + "".join(c * 2 for c in tok[1:]).upper()
                r, g, b = rgb(key)
            else:
                r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
                key = f"rgb({r},{g},{b})"
            total += 1
            z = zone(r, g, b)
            seen.setdefault(key, [z, set()])[1].add(name)
            if z == "이탈" and key not in EXCEPT:
                bad.append((key, name, hsl(r, g, b)))
    print(f"검사한 색 {total}개 · 서로 다른 값 {len(seen)}개 · 파일 {', '.join(FILES)}")
    for z in ["UI 계열", "캐릭터 노랑", "무채색", "이탈"]:
        vals = sorted(k for k, v in seen.items() if v[0] == z)
        print(f"  {z}: {len(vals)}개" + (f"  {' '.join(vals)}" if z in ("이탈", "캐릭터 노랑") else ""))
    ex = [k for k in seen if k in EXCEPT]
    if ex:
        print("  예외 허용:", ", ".join(f"{k}({EXCEPT[k]})" for k in ex))
    if bad:
        print("\n규칙 위반:")
        for k, n, h in bad:
            print(f"  {k} H{h[0]} S{h[1]} L{h[2]}  ← {n}")
        raise SystemExit(1)
    print("\n통과: 이탈 색 없음")


if __name__ == "__main__":
    table() if sys.argv[1:2] == ["표"] else scan()
