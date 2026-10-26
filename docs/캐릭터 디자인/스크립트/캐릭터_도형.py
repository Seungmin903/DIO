# -*- coding: utf-8 -*-
"""DIO 캐릭터 SVG 라이브러리 — 디오(다이어리 친구) · 두리(목도리 친구) · 스티커 · 공통 도형

좌표계: 각 캐릭터는 가로 100 단위의 상자 안에 그린다(디오 100×122, 두리 100×150).
호출부가 translate/scale 로 자리와 크기를 정하고, 선 굵기는 '절대값(px)'을 받아 scale 로 나눠 어느 크기에서도 같은 굵기가 되게 한다.
그림체 규칙(03·04 문서): 먹선 #242424 · 둥근 끝 · 단색 면 · 점 눈 · 스티커는 흰 테두리(먹선 없음).
"""
import math

INK = "#242424"          # Brand Ink — 로고 D 와 같은 선 색
NAVY = "#0B1957"         # text 토큰
PRIMARY = "#6E92C6"
ACCENT = "#9FB6D9"       # 로고 테마 원
SOFT = "#CED9EE"         # 앱 배경
MUTED = "#EEF2F9"
PAPER = "#FFFCF6"
WHITE = "#FFFFFF"
ROSE = "#F0B0AA"         # 표지 팔레트 로즈 — 볼
MUSTARD = "#EBC56F"      # 표지 팔레트 머스터드
SOURCE_YELLOW = "#F8D860"  # 원본 시안 노랑
CREAM = "#EAE3D4"
SAGE = "#A9BFA6"
LAVENDER = "#C3AEDD"
PERI = "#9DABD8"
CAMEL = "#D9A87F"
CHARCOAL = "#474F55"
# 스티커 색 (꾸미기 팔레트 — 펜 · 형광펜 · 테이프에서 가져옴)
ST = {"red": "#EF476F", "orange": "#F59E0B", "yellow": "#FFE066", "green": "#22A06B", "mint": "#8FD3B6", "teal": "#14B8A6",
      "blue": "#6E92C6", "sky": "#A0C4FF", "purple": "#9B6BDF", "lav": "#B39DED", "pink": "#F59AB2", "peach": "#FFD6A5",
      "grey": "#9AA3B2", "slate": "#6B7280", "dark": "#3E4350", "leaf": "#7FB069"}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def g(body, x=0, y=0, k=1, extra=""):
    return f'<g transform="translate({x:.2f},{y:.2f}) scale({k:.4f})" {extra}>{body}</g>'


def limb(path, w, fill, lw, ink=INK):
    """굵은 팔다리: 먹선 띠 위에 살색 띠. 둥근 끝 → 벙어리장갑 · 발 모양이 저절로 난다."""
    return (f'<path d="{path}" fill="none" stroke="{ink}" stroke-width="{w + 2 * lw:.2f}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{path}" fill="none" stroke="{fill}" stroke-width="{w:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')


def stroke_attrs(lw, ink=INK):
    return f'stroke="{ink}" stroke-width="{lw:.2f}" stroke-linecap="round" stroke-linejoin="round"'


def text(x, y, s, size=14, weight=700, fill=NAVY, anchor="start", family=None, extra=""):
    fam = family or "'Malgun Gothic','Nanum Gothic','Noto Sans KR',sans-serif"
    return f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" {extra}>{esc(s)}</text>'


# ──────────────────────────────── 스티커 ────────────────────────────────
# 모두 가운데 (0,0) 기준 지름 ≈ 20 단위. 흰 테두리(die-cut) + 단색. 먹선 없음 — 몸(먹선)과 구별되는 '붙인 것'.

def _cut(shape_path, fill, border=3.2, inner=None):
    """흰 테두리 스티커. shape_path 는 (0,0) 기준 path d."""
    s = f'<path d="{shape_path}" fill="{WHITE}" stroke="{WHITE}" stroke-width="{border * 2:.1f}" stroke-linejoin="round"/>'
    s += f'<path d="{shape_path}" fill="{fill}"/>'
    if inner:
        s += inner
    return s


def star_path(r=9, r2=None, n=5, rot=-90):
    r2 = r2 or r * 0.48
    pts = []
    for i in range(n * 2):
        a = math.radians(rot + i * 180 / n)
        rr = r if i % 2 == 0 else r2
        pts.append(f"{rr * math.cos(a):.2f},{rr * math.sin(a):.2f}")
    return "M" + " L".join(pts) + " Z"


def sparkle_path(r=9, w=0.28):
    return f"M0,{-r} Q{r * w},{-r * w} {r},0 Q{r * w},{r * w} 0,{r} Q{-r * w},{r * w} {-r},0 Q{-r * w},{-r * w} 0,{-r} Z"


HEART = "M0,7 C-9,0 -9,-7 -4.5,-7 C-2,-7 -0.5,-5.5 0,-4 C0.5,-5.5 2,-7 4.5,-7 C9,-7 9,0 0,7 Z"
MOON = "M2,-9 A9,9 0 1 0 2,9 A11,11 0 0 1 2,-9 Z"
DROP = "M0,-9 C4,-3 7,1 7,4 A7,7 0 1 1 -7,4 C-7,1 -4,-3 0,-9 Z"
CLOUD = "M-10,4 A5,5 0 0 1 -8,-4 A6,6 0 0 1 2,-7 A6,6 0 0 1 10,0 A4.5,4.5 0 0 1 8,8 L-6,8 A4.5,4.5 0 0 1 -10,4 Z"


def sticker(kind, x=0, y=0, k=1.0):
    """감정 스티커 모음. kind 별 (0,0) 기준 그림을 (x,y) 로 옮기고 k 배."""
    S = ST
    if kind == "star":
        body = _cut(star_path(10), S["yellow"])
    elif kind == "star_orange":
        body = _cut(star_path(9), S["orange"])
    elif kind == "sparkle":
        body = _cut(sparkle_path(10), S["sky"], inner=f'<path d="{sparkle_path(3.2)}" transform="translate(-2,-2)" fill="{WHITE}" opacity=".8"/>')
    elif kind == "sparkle_pink":
        body = _cut(sparkle_path(9), S["pink"])
    elif kind == "heart":
        body = _cut(HEART, S["red"], inner=f'<ellipse cx="-3.5" cy="-3.2" rx="2" ry="1.1" fill="{WHITE}" opacity=".75" transform="rotate(-30 -3.5 -3.2)"/>')
    elif kind == "heart_orange":
        body = _cut(HEART, S["orange"])
    elif kind == "heart_pink":
        body = _cut(HEART, S["pink"])
    elif kind == "flower":
        petals = "".join(f'<circle cx="{6.2 * math.cos(math.radians(a)):.2f}" cy="{6.2 * math.sin(math.radians(a)):.2f}" r="4.6" fill="{S["lav"]}"/>' for a in range(-90, 270, 72))
        body = (f'<circle r="11.5" fill="{WHITE}"/>' + petals + f'<circle r="3" fill="{S["yellow"]}"/>')
    elif kind == "flower_pink":
        petals = "".join(f'<circle cx="{6 * math.cos(math.radians(a)):.2f}" cy="{6 * math.sin(math.radians(a)):.2f}" r="4.4" fill="{S["pink"]}"/>' for a in range(-90, 270, 72))
        body = (f'<circle r="11" fill="{WHITE}"/>' + petals + f'<circle r="2.8" fill="{S["yellow"]}"/>')
    elif kind == "moon":
        body = _cut(MOON, S["orange"], inner=f'<path d="M1,-5 A5,5 0 0 0 1,5" fill="none" stroke="{WHITE}" stroke-width="1.6" opacity=".7" stroke-linecap="round"/>')
    elif kind == "wave":
        p = "M-11,0 Q-7,-7 -3,0 T5,0 T13,0"
        body = (f'<path d="{p}" fill="none" stroke="{WHITE}" stroke-width="9" stroke-linecap="round"/>'
                f'<path d="{p}" fill="none" stroke="{S["mint"]}" stroke-width="3.6" stroke-linecap="round"/>')
    elif kind == "rainbow":
        cols = [S["red"], S["orange"], S["yellow"], S["green"], S["blue"], S["purple"]]
        body = f'<path d="M-15,6 A15,15 0 0 1 15,6 L15,8 L-15,8 Z" fill="{WHITE}" stroke="{WHITE}" stroke-width="5" stroke-linejoin="round"/>'
        for i, c in enumerate(cols):
            r = 14 - i * 2.1
            body += f'<path d="M{-r},6 A{r},{r} 0 0 1 {r},6" fill="none" stroke="{c}" stroke-width="2.1"/>'
        body += f'<rect x="-15" y="5.5" width="30" height="2.5" fill="{WHITE}"/>'
    elif kind == "confetti":
        body = ""
        for (cx, cy, rot, c) in [(-8, -6, 20, S["red"]), (6, -8, -30, S["sky"]), (-2, 4, 60, S["purple"]), (9, 5, 10, S["green"]), (-9, 8, -50, S["orange"])]:
            body += f'<rect x="{cx - 3}" y="{cy - 1.6}" width="6" height="3.2" rx="1" fill="{WHITE}" stroke="{WHITE}" stroke-width="2.4" transform="rotate({rot} {cx} {cy})"/>'
            body += f'<rect x="{cx - 3}" y="{cy - 1.6}" width="6" height="3.2" rx="1" fill="{c}" transform="rotate({rot} {cx} {cy})"/>'
    elif kind == "popper":
        cone = "M-10,10 L2,-6 L10,2 Z"
        body = _cut(cone, S["pink"], inner=f'<path d="M-6,8 L4,-2 M-2,9 L7,0" stroke="{WHITE}" stroke-width="1.6" opacity=".8"/>')
        for (cx, cy, c) in [(7, -8, S["sky"]), (12, -2, S["yellow"]), (3, -12, S["green"]), (14, -9, S["red"])]:
            body += f'<circle cx="{cx}" cy="{cy}" r="2.6" fill="{WHITE}"/><circle cx="{cx}" cy="{cy}" r="1.6" fill="{c}"/>'
        body += f'<path d="M4,-5 Q8,-10 13,-6" fill="none" stroke="{WHITE}" stroke-width="3.6" stroke-linecap="round"/><path d="M4,-5 Q8,-10 13,-6" fill="none" stroke="{S["purple"]}" stroke-width="1.5" stroke-linecap="round"/>'
    elif kind == "balloon_sad":  # 바람 빠진 풍선
        body = _cut("M0,-9 C7,-9 9,-2 6,3 C4,6 2,7 0,7 C-2,7 -4,6 -6,3 C-9,-2 -7,-9 0,-9 Z", S["grey"],
                    inner=f'<path d="M0,7 Q-3,11 1,14" fill="none" stroke="{S["slate"]}" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="-3" cy="-4" rx="2" ry="1" fill="{WHITE}" opacity=".6" transform="rotate(-40 -3 -4)"/>')
        body += f'<path d="M-10,9 L-12,13 M-7,11 L-8,15" stroke="{WHITE}" stroke-width="3.5" stroke-linecap="round"/><path d="M-10,9 L-12,13 M-7,11 L-8,15" stroke="{S["sky"]}" stroke-width="1.5" stroke-linecap="round"/>'
    elif kind == "star_broken":
        body = _cut(star_path(10), S["lav"], inner=f'<path d="M-1,-9 L2,-3 L-2,1 L1,7" fill="none" stroke="{WHITE}" stroke-width="1.8" stroke-linejoin="round"/>')
    elif kind == "flower_wilted":
        stem = "M2,10 C2,2 0,-2 -4,-4"
        body = (f'<path d="{stem}" fill="none" stroke="{WHITE}" stroke-width="6" stroke-linecap="round"/>'
                f'<path d="{stem}" fill="none" stroke="{S["leaf"]}" stroke-width="2.2" stroke-linecap="round"/>'
                f'<path d="M-4,-4 C-10,-2 -11,2 -7,5 C-9,0 -4,0 -4,-4 Z" fill="{WHITE}" stroke="{WHITE}" stroke-width="3" stroke-linejoin="round"/>'
                f'<path d="M-4,-4 C-10,-2 -11,2 -7,5 C-9,0 -4,0 -4,-4 Z" fill="{S["pink"]}"/>'
                f'<path d="M-4,-4 C-6,-8 -2,-9 -1,-6 C0,-9 4,-8 2,-4 Z" fill="{WHITE}" stroke="{WHITE}" stroke-width="3" stroke-linejoin="round"/>'
                f'<path d="M-4,-4 C-6,-8 -2,-9 -1,-6 C0,-9 4,-8 2,-4 Z" fill="{S["pink"]}"/>'
                f'<circle cx="7" cy="10" r="2.4" fill="{WHITE}"/><circle cx="7" cy="10" r="1.4" fill="{S["pink"]}"/>')
    elif kind == "battery_low":
        body = (f'<rect x="-11" y="-6" width="20" height="12" rx="2.5" fill="{WHITE}" stroke="{WHITE}" stroke-width="5" stroke-linejoin="round"/>'
                f'<rect x="-11" y="-6" width="20" height="12" rx="2.5" fill="{S["dark"]}"/>'
                f'<rect x="9" y="-2.5" width="3" height="5" rx="1" fill="{S["dark"]}"/>'
                f'<rect x="-9" y="-4" width="3.5" height="8" rx="1" fill="{S["red"]}"/>')
    elif kind == "sigh":
        body = (f'<path d="{CLOUD}" transform="translate(-4,2) scale(.9)" fill="{WHITE}" stroke="{WHITE}" stroke-width="6" stroke-linejoin="round"/>'
                f'<path d="{CLOUD}" transform="translate(-4,2) scale(.9)" fill="{S["grey"]}"/>'
                f'<path d="M8,-6 L13,-7 M9,-2 L15,-3" stroke="{WHITE}" stroke-width="4" stroke-linecap="round"/>'
                f'<path d="M8,-6 L13,-7 M9,-2 L15,-3" stroke="{S["slate"]}" stroke-width="1.4" stroke-linecap="round"/>')
    elif kind == "star_sleepy":
        body = _cut(star_path(11), S["sky"], inner=f'<path d="M-4,1 Q-2.5,2.5 -1,1 M1,1 Q2.5,2.5 4,1" fill="none" stroke="{S["dark"]}" stroke-width="1.2" stroke-linecap="round"/><path d="M-2,4.5 Q0,3.5 2,4.5" fill="none" stroke="{S["dark"]}" stroke-width="1.1" stroke-linecap="round"/>')
        body += f'<path d="M10,-9 L10,-3 M13,-10 L13,-5 M16,-9 L16,-6" stroke="{WHITE}" stroke-width="3.6" stroke-linecap="round"/><path d="M10,-9 L10,-3 M13,-10 L13,-5 M16,-9 L16,-6" stroke="{S["slate"]}" stroke-width="1.4" stroke-linecap="round"/>'
    elif kind == "blush":
        body = (f'<ellipse rx="9" ry="5" fill="{WHITE}"/><ellipse rx="7" ry="3.4" fill="{ROSE}"/>'
                f'<path d="M-3,-1 L-1.5,1 M1,-1 L2.5,1" stroke="{S["red"]}" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>')
    elif kind == "scribble":
        p = "M-8,2 C-10,-6 -2,-10 2,-5 C6,0 10,-6 7,-9 C3,-12 -4,-8 -6,-2 C-8,4 0,9 5,4 C9,0 4,-6 -1,-3 C-5,0 -3,6 2,6"
        body = (f'<path d="{p}" fill="none" stroke="{WHITE}" stroke-width="6" stroke-linecap="round"/>'
                f'<path d="{p}" fill="none" stroke="{S["purple"]}" stroke-width="1.8" stroke-linecap="round"/>')
    elif kind == "storm":
        body = (f'<path d="{CLOUD}" transform="translate(0,-3)" fill="{WHITE}" stroke="{WHITE}" stroke-width="6" stroke-linejoin="round"/>'
                f'<path d="{CLOUD}" transform="translate(0,-3)" fill="{S["slate"]}"/>'
                f'<path d="M1,5 L-3,11 L1,11 L-2,17" fill="none" stroke="{WHITE}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>'
                f'<path d="M1,5 L-3,11 L1,11 L-2,17" fill="none" stroke="{S["yellow"]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
    elif kind == "drops":
        body = _cut(DROP, S["sky"], inner=f'<ellipse cx="-2.5" cy="1" rx="1.4" ry="2.6" fill="{WHITE}" opacity=".8"/>')
        body += g(_cut(DROP, S["sky"]), 10, 10, 0.5) + g(_cut(DROP, S["sky"]), 13, 2, 0.4)
    elif kind == "bow":
        p = "M0,0 C-4,-8 -14,-8 -13,-1 C-12,4 -5,4 0,0 C5,4 12,4 13,-1 C14,-8 4,-8 0,0 Z"
        body = _cut(p, S["pink"], inner=f'<circle r="2.6" fill="{S["red"]}" opacity=".7"/>'
                    f'<path d="M-2,2 L-5,10 M2,2 L5,10" stroke="{S["pink"]}" stroke-width="3" stroke-linecap="round"/>')
    elif kind == "bouquet":
        cone = "M-7,2 L7,2 L2,13 L-2,13 Z"
        body = (f'<path d="{cone}" fill="{WHITE}" stroke="{WHITE}" stroke-width="5" stroke-linejoin="round"/><path d="{cone}" fill="{S["peach"]}"/>')
        for (cx, cy) in [(-6, -4), (0, -7), (6, -4)]:
            body += f'<circle cx="{cx}" cy="{cy}" r="6" fill="{WHITE}"/>'
            body += "".join(f'<circle cx="{cx + 3.4 * math.cos(math.radians(a)):.2f}" cy="{cy + 3.4 * math.sin(math.radians(a)):.2f}" r="2.4" fill="{S["pink"]}"/>' for a in range(-90, 270, 72))
            body += f'<circle cx="{cx}" cy="{cy}" r="1.5" fill="{S["yellow"]}"/>'
        body += f'<path d="M-4,13 L-6,17 M4,13 L6,17" stroke="{WHITE}" stroke-width="3.5" stroke-linecap="round"/><path d="M-4,13 L-6,17 M4,13 L6,17" stroke="{S["pink"]}" stroke-width="1.6" stroke-linecap="round"/>'
    elif kind == "photo":  # 오늘의 사진 (DIO 의 핵심 — 사진 한 장)
        body = (f'<rect x="-11" y="-9" width="22" height="18" rx="1.5" fill="{WHITE}" stroke="{WHITE}" stroke-width="4" stroke-linejoin="round"/>'
                f'<rect x="-9" y="-7" width="18" height="12" fill="{S["sky"]}"/>'
                f'<path d="M-9,5 L-4,-1 L0,3 L3,0 L9,5 Z" fill="{S["green"]}"/><circle cx="5" cy="-4" r="1.6" fill="{S["yellow"]}"/>')
    elif kind == "tape":  # 마스킹 테이프 조각
        body = (f'<path d="M-12,-4 L12,-5 L11,4 L-11,5 Z" fill="{WHITE}" stroke="{WHITE}" stroke-width="3" stroke-linejoin="round"/>'
                f'<path d="M-12,-4 L12,-5 L11,4 L-11,5 Z" fill="{S["peach"]}" opacity=".9"/>'
                + "".join(f'<circle cx="{cx}" cy="{cy}" r="1.1" fill="{S["orange"]}" opacity=".8"/>' for cx, cy in [(-8, -1), (-3, 2), (2, -2), (7, 1)]))
    elif kind == "dot":  # 작은 동그라미 (도트 스티커)
        body = f'<circle r="6" fill="{WHITE}"/><circle r="4.4" fill="{S["mint"]}"/>'
    elif kind == "check":
        body = (f'<circle r="9" fill="{WHITE}"/><circle r="7.4" fill="{S["green"]}"/>'
                f'<path d="M-3.5,0 L-1,2.6 L3.8,-2.6" fill="none" stroke="{WHITE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>')
    elif kind == "zzz":
        body = ""
        for i, (cx, cy, s) in enumerate([(-6, 4, 1.0), (2, -3, .8), (8, -9, .62)]):
            body += text(cx, cy, "z", size=12 * s, weight=900, fill=WHITE, anchor="middle", extra=f'stroke="{WHITE}" stroke-width="3"')
            body += text(cx, cy, "z", size=12 * s, weight=900, fill=S["sky"], anchor="middle")
    elif kind == "exclaim":
        body = (f'<path d="M0,-9 L0,2" stroke="{WHITE}" stroke-width="7" stroke-linecap="round"/><circle cy="8" r="3.6" fill="{WHITE}"/>'
                f'<path d="M0,-9 L0,2" stroke="{S["orange"]}" stroke-width="3.2" stroke-linecap="round"/><circle cy="8" r="2" fill="{S["orange"]}"/>')
    elif kind == "question":
        p = "M-5,-5 A5,5 0 1 1 1,1 L0,3"
        body = (f'<path d="{p}" fill="none" stroke="{WHITE}" stroke-width="7" stroke-linecap="round"/><circle cy="8" r="3.6" fill="{WHITE}"/>'
                f'<path d="{p}" fill="none" stroke="{S["purple"]}" stroke-width="3" stroke-linecap="round"/><circle cy="8" r="2" fill="{S["purple"]}"/>')
    else:
        raise KeyError(kind)
    return g(body, x, y, k)


# ──────────────────────────────── 디오 (다이어리 친구) ────────────────────────────────
# 상자 100×122. 표지 (10,10)-(84,100). 다리 끝 y≈116.

DIO_ZONES = {"tl": (27, 27), "tr": (68, 26), "bl": (27, 82), "br": (67, 83), "ml": (22, 56), "mr": (72, 56), "c": (47, 70)}


def dio_face(mood, lw, cx=47, ey=46):
    """눈 · 입 · 눈썹 · 볼. 표정은 작게 — 감정은 스티커가 말한다."""
    L, R = cx - 11, cx + 11
    s = ""
    sa = stroke_attrs(lw)
    if mood in ("default", "wave", "walk", "hold", "photo", "pen"):
        s += f'<ellipse cx="{L}" cy="{ey}" rx="2.9" ry="3.4" fill="{INK}"/><ellipse cx="{R}" cy="{ey}" rx="2.9" ry="3.4" fill="{INK}"/>'
        s += f'<path d="M{cx - 6},{ey + 9} Q{cx},{ey + 14} {cx + 6},{ey + 9}" fill="none" {sa}/>'
    elif mood in ("celebrate", "happy"):
        s += f'<path d="M{L - 5},{ey + 1} Q{L},{ey - 5} {L + 5},{ey + 1} M{R - 5},{ey + 1} Q{R},{ey - 5} {R + 5},{ey + 1}" fill="none" {sa}/>'
        if mood == "celebrate":
            s += f'<path d="M{cx - 7},{ey + 8} Q{cx},{ey + 20} {cx + 7},{ey + 8} Z" fill="{INK}"/><path d="M{cx - 3.5},{ey + 14} Q{cx},{ey + 17.5} {cx + 3.5},{ey + 14} Z" fill="{ROSE}"/>'
        else:
            s += f'<path d="M{cx - 6},{ey + 9} Q{cx},{ey + 15} {cx + 6},{ey + 9}" fill="none" {sa}/>'
    elif mood == "sad":
        s += f'<path d="M{L - 5},{ey - 4} L{L + 4},{ey - 7} M{R + 5},{ey - 4} L{R - 4},{ey - 7}" fill="none" {sa}/>'
        s += f'<ellipse cx="{L}" cy="{ey + 1}" rx="2.6" ry="3" fill="{INK}"/><ellipse cx="{R}" cy="{ey + 1}" rx="2.6" ry="3" fill="{INK}"/>'
        s += f'<path d="M{cx - 5},{ey + 13} Q{cx},{ey + 8} {cx + 5},{ey + 13}" fill="none" {sa}/>'
    elif mood == "tired":
        s += f'<path d="M{L - 5},{ey - 1} L{L + 5},{ey - 1} M{R - 5},{ey - 1} L{R + 5},{ey - 1}" fill="none" {sa}/>'
        s += f'<path d="M{L - 4},{ey} A4.5,3.4 0 0 0 {L + 4},{ey} Z M{R - 4},{ey} A4.5,3.4 0 0 0 {R + 4},{ey} Z" fill="{INK}"/>'
        s += f'<path d="M{cx - 5},{ey + 11} L{cx + 5},{ey + 11}" fill="none" {sa}/>'
    elif mood == "shy":
        s += f'<path d="M{L - 5},{ey - 6} Q{L},{ey - 9} {L + 4},{ey - 6} M{R + 5},{ey - 6} Q{R},{ey - 9} {R - 4},{ey - 6}" fill="none" {sa}/>'
        s += f'<path d="M{L - 4},{ey + 1} A4,3.5 0 0 1 {L + 4},{ey + 1} Z M{R - 4},{ey + 1} A4,3.5 0 0 1 {R + 4},{ey + 1} Z" fill="{INK}"/>'
        s += f'<path d="M{cx - 5},{ey + 9} Q{cx},{ey + 14} {cx + 5},{ey + 9}" fill="none" {sa}/>'
        s += f'<ellipse cx="{L - 3}" cy="{ey + 8}" rx="5" ry="2.8" fill="{ROSE}" opacity=".9"/><ellipse cx="{R + 3}" cy="{ey + 8}" rx="5" ry="2.8" fill="{ROSE}" opacity=".9"/>'
    elif mood == "anxious":
        s += f'<path d="M{L - 5},{ey - 5} Q{L},{ey - 9} {L + 5},{ey - 6} M{R + 5},{ey - 5} Q{R},{ey - 9} {R - 5},{ey - 6}" fill="none" {sa}/>'
        s += f'<ellipse cx="{L}" cy="{ey + 1}" rx="2.8" ry="3.2" fill="{INK}"/><ellipse cx="{R}" cy="{ey + 1}" rx="2.8" ry="3.2" fill="{INK}"/>'
        s += f'<path d="M{cx - 6},{ey + 11} Q{cx - 3},{ey + 8} {cx},{ey + 11} T{cx + 6},{ey + 11}" fill="none" {sa}/>'
    elif mood == "grateful":
        s += f'<path d="M{L - 5},{ey + 1} Q{L},{ey - 5} {L + 5},{ey + 1} M{R - 5},{ey + 1} Q{R},{ey - 5} {R + 5},{ey + 1}" fill="none" {sa}/>'
        s += f'<path d="M{cx - 5},{ey + 9} Q{cx},{ey + 14} {cx + 5},{ey + 9}" fill="none" {sa}/>'
        s += f'<ellipse cx="{L - 4}" cy="{ey + 7}" rx="4.6" ry="2.6" fill="{ROSE}" opacity=".9"/><ellipse cx="{R + 4}" cy="{ey + 7}" rx="4.6" ry="2.6" fill="{ROSE}" opacity=".9"/>'
    elif mood == "sleep":
        s += f'<path d="M{L - 5},{ey + 1} Q{L},{ey + 5} {L + 5},{ey + 1} M{R - 5},{ey + 1} Q{R},{ey + 5} {R + 5},{ey + 1}" fill="none" {sa}/>'
        s += f'<ellipse cx="{cx}" cy="{ey + 11}" rx="2.2" ry="2.6" fill="{INK}"/>'
    elif mood == "surprised":
        s += f'<circle cx="{L}" cy="{ey}" r="3.8" fill="{INK}"/><circle cx="{R}" cy="{ey}" r="3.8" fill="{INK}"/>'
        s += f'<ellipse cx="{cx}" cy="{ey + 11}" rx="3" ry="3.6" fill="{INK}"/>'
    elif mood == "wink":
        s += f'<ellipse cx="{L}" cy="{ey}" rx="2.9" ry="3.4" fill="{INK}"/><path d="M{R - 5},{ey + 1} Q{R},{ey - 5} {R + 5},{ey + 1}" fill="none" {sa}/>'
        s += f'<path d="M{cx - 6},{ey + 9} Q{cx},{ey + 14} {cx + 6},{ey + 9}" fill="none" {sa}/>'
    elif mood == "blank":
        pass
    return s


DIO_STICKERS = {
    "default": [], "wave": [], "walk": [], "pen": [], "sleep": [],
    "celebrate": [("rainbow", "tl", 1.0), ("star", "tr", 0.95), ("sparkle_pink", "mr", 0.6), ("popper", "br", 1.0), ("confetti", "bl", 0.9), ("sparkle", "ml", 0.55)],
    "happy": [("heart", "tl", 1.05), ("flower", "tr", 1.0), ("sparkle", "bl", 1.0), ("moon", "br", 0.95), ("wave", "c", 0.9)],
    "sad": [("balloon_sad", "tl", 1.0), ("star_broken", "tr", 0.95), ("flower_wilted", "br", 1.05)],
    "tired": [("battery_low", "tr", 0.95), ("sigh", "bl", 1.0), ("star_sleepy", "br", 0.95)],
    "shy": [("flower", "tr", 0.9), ("heart_pink", "bl", 0.8), ("flower_pink", "br", 0.7)],
    "anxious": [("scribble", "tl", 1.0), ("drops", "tr", 0.9), ("storm", "ml", 0.8)],
    "grateful": [("bow", "tr", 1.1), ("heart_orange", "tl", 0.8), ("bouquet", "bl", 1.05), ("heart_orange", "mr", 0.65)],
    "photo": [("photo", "tl", 1.1), ("tape", "tr", 0.8), ("dot", "br", 0.8)],
    "surprised": [("exclaim", "tr", 1.0)], "wink": [("check", "tr", 0.9)],
}


def dio(x, y, h, mood="default", color=SOURCE_YELLOW, page=PAPER, lw_abs=4.0, stickers=None, view="front", pose=None, ink=INK, face=True, extra_body=""):
    """디오 한 마리. h = 상자 높이(122 단위 기준) 의 실제 px. stickers = [(kind, zone|(x,y), k)] 또는 None(=mood 기본)."""
    k = h / 122.0
    lw = lw_abs / k
    sa = stroke_attrs(lw, ink)
    pose = pose or mood
    s = ""
    # 다리 (몸 뒤)
    if view != "side":
        if pose == "celebrate":
            s += limb("M34,100 V110 H25", 9, color, lw, ink) + limb("M60,100 L68,108 L76,104", 9, color, lw, ink)
        elif pose in ("shy", "grateful"):
            s += limb("M42,100 V110 H36", 9, color, lw, ink) + limb("M52,100 V110 H58", 9, color, lw, ink)
        elif pose == "walk":
            s += limb("M34,100 L30,112 H22", 9, color, lw, ink) + limb("M60,100 L66,110 H74", 9, color, lw, ink)
        elif pose == "sleep":
            s += limb("M34,100 V106 H26", 9, color, lw, ink) + limb("M60,100 V106 H68", 9, color, lw, ink)
        else:
            s += limb("M34,100 V111 H25", 9, color, lw, ink) + limb("M60,100 V111 H69", 9, color, lw, ink)
    # 팔 (몸 뒤에서 나오는 것)
    if view == "front":
        if pose == "celebrate":
            s += limb("M12,52 C2,46 -2,36 2,28", 9, color, lw, ink) + limb("M82,52 C92,46 96,36 92,28", 9, color, lw, ink)
        elif pose == "happy":
            s += limb("M12,54 C4,50 0,42 2,34", 9, color, lw, ink) + limb("M82,54 C90,50 94,42 92,34", 9, color, lw, ink)
        elif pose == "wave" or pose == "default":
            s += limb("M12,56 C4,54 0,44 2,36", 9, color, lw, ink) + limb("M82,60 C90,64 92,72 88,80", 9, color, lw, ink)
        elif pose in ("sad", "tired"):
            s += limb("M12,60 C6,66 4,76 6,84", 9, color, lw, ink) + limb("M82,60 C88,66 90,76 88,84", 9, color, lw, ink)
        elif pose == "walk":
            s += limb("M12,60 C6,64 4,74 8,82", 9, color, lw, ink) + limb("M82,58 C90,52 96,46 94,38", 9, color, lw, ink)
        elif pose == "pen":
            s += limb("M12,60 C6,66 4,76 6,84", 9, color, lw, ink)
        elif pose == "sleep":
            s += limb("M12,64 C6,68 2,74 4,80", 9, color, lw, ink) + limb("M82,64 C88,68 92,74 90,80", 9, color, lw, ink)
        elif pose == "hold":  # 사진을 앞에 든다
            pass
    # 속지 묶음 (오른쪽 · 아래로 살짝 어긋난 흰 블록)
    if view == "front":
        s += f'<rect x="16" y="14" width="74" height="90" rx="10" fill="{page}" {sa}/>'
        s += f'<rect x="10" y="10" width="74" height="90" rx="10" fill="{color}" {sa}/>'
    elif view == "three":
        s += f'<rect x="22" y="14" width="62" height="90" rx="10" fill="{page}" {sa}/>'
        s += f'<path d="M14,10 L76,10 Q84,10 84,18 L84,92 Q84,100 76,100 L18,100 Q10,100 10,92 L10,14 Q10,10 14,10 Z" fill="{color}" {sa}/>'
        s += f'<path d="M22,14 L22,100" fill="none" stroke="{ink}" stroke-width="{lw:.2f}" opacity=".35"/>'
    elif view == "side":
        s += limb("M44,100 V111 H36", 9, color, lw, ink) + limb("M56,100 V111 H64", 9, color, lw, ink)
        s += f'<rect x="38" y="12" width="24" height="90" rx="4" fill="{page}" {sa}/>'
        s += f'<rect x="34" y="10" width="10" height="90" rx="5" fill="{color}" {sa}/>'
        s += f'<rect x="58" y="12" width="6" height="88" rx="3" fill="{color}" {sa}/>'
        for yy in (30, 50, 70, 90):
            s += f'<path d="M46,{yy} L56,{yy}" stroke="{ink}" stroke-width="{lw * .6:.2f}" opacity=".3"/>'
        s += limb("M40,58 C34,62 32,72 36,80", 8, color, lw, ink)
    elif view == "back":
        s += f'<rect x="10" y="14" width="74" height="90" rx="10" fill="{page}" {sa}/>'
        s += f'<rect x="16" y="10" width="74" height="90" rx="10" fill="{color}" {sa}/>'
        s += f'<rect x="16" y="10" width="12" height="90" rx="6" fill="{ink}" opacity=".12"/>'
        s += f'<rect x="60" y="80" width="20" height="12" rx="3" fill="{page}" {sa}/>'
        s += f'<path d="M64,86 L76,86" stroke="{ink}" stroke-width="{lw:.2f}" opacity=".5"/>'
    # 얼굴
    if face and view in ("front", "three"):
        s += dio_face(mood, lw, cx=47 if view == "front" else 50, ey=46)
    # 스티커
    if view in ("front", "three"):
        for kind, zone, kk in (stickers if stickers is not None else DIO_STICKERS.get(mood, [])):
            zx, zy = DIO_ZONES[zone] if isinstance(zone, str) else zone
            s += sticker(kind, zx, zy, kk * 0.72)
    # 팔 (몸 앞)
    if view == "front":
        if pose == "shy":
            s += limb("M12,60 C8,70 20,78 30,66", 9, color, lw, ink) + limb("M82,60 C86,70 74,78 64,66", 9, color, lw, ink)
        elif pose == "grateful":
            s += limb("M12,62 C10,74 24,78 36,70", 9, color, lw, ink) + limb("M82,62 C84,74 70,78 58,70", 9, color, lw, ink)
        elif pose == "anxious":
            s += limb("M12,60 C8,72 26,80 40,74", 9, color, lw, ink) + limb("M82,60 C86,72 68,80 54,74", 9, color, lw, ink)
        elif pose == "hold":
            s += limb("M12,62 C10,72 20,80 30,80", 9, color, lw, ink) + limb("M82,62 C84,72 74,80 64,80", 9, color, lw, ink)
        elif pose == "pen":
            s += limb("M82,58 C92,52 94,40 86,32", 9, color, lw, ink)
            # 펜
            s += f'<path d="M86,30 L104,6" stroke="{ink}" stroke-width="{lw * 2.2:.2f}" stroke-linecap="round"/><path d="M87,29 L103,7" stroke="{PRIMARY}" stroke-width="{lw * 1.1:.2f}" stroke-linecap="round"/><path d="M100,10 L104,6" stroke="{ink}" stroke-width="{lw * 1.3:.2f}" stroke-linecap="round"/>'
    s += extra_body
    return g(s, x, y, k)


# ──────────────────────────────── 두리 (목도리 친구) ────────────────────────────────
# 상자 100×150. 머리 (20,10)-(80,66). 목도리 y 58~76. 코트 76~132. 발 끝 ≈146.

HEAD_PATH = "M14,56 C14,24 30,12 50,12 C70,12 86,24 86,56 C86,62 82,66 76,66 L24,66 C18,66 14,62 14,56 Z"
COAT_PATH = "M31,74 L69,74 L78,128 Q79,132 74,132 L26,132 Q21,132 22,128 Z"


def stripes(clip_id, color, lw, x0=0, y0=40, x1=100, y1=130, gap=8.5, angle=-55):
    s = f'<g clip-path="url(#{clip_id})">'
    n = int((x1 - x0 + 120) / gap)
    for i in range(n):
        x = x0 - 60 + i * gap
        s += f'<path d="M{x},{y1} L{x + 60},{y0 - 20}" stroke="{color}" stroke-width="{lw:.2f}" stroke-linecap="round"/>'
    return s + "</g>"


_uid = [0]


def duri_face(mood, lw, cx=50, ey=44, lift=0):
    """눈만으로 말한다. 입은 목도리 속."""
    L, R = cx - 9.5, cx + 9.5
    sa = stroke_attrs(lw)
    s = ""
    if mood in ("default", "walk", "hug", "wave"):
        s += f'<ellipse cx="{L}" cy="{ey}" rx="2.6" ry="3.6" fill="{INK}"/><ellipse cx="{R}" cy="{ey}" rx="2.6" ry="3.6" fill="{INK}"/>'
    elif mood == "happy":
        s += f'<path d="M{L - 4.5},{ey + 1} Q{L},{ey - 5} {L + 4.5},{ey + 1} M{R - 4.5},{ey + 1} Q{R},{ey - 5} {R + 4.5},{ey + 1}" fill="none" {sa}/>'
    elif mood == "sleepy":
        s += f'<path d="M{L - 4.5},{ey} L{L + 4.5},{ey} M{R - 4.5},{ey} L{R + 4.5},{ey}" fill="none" {sa}/>'
    elif mood == "surprised":
        s += f'<circle cx="{L}" cy="{ey}" r="3.6" fill="{INK}"/><circle cx="{R}" cy="{ey}" r="3.6" fill="{INK}"/>'
    elif mood == "shy":
        s += f'<path d="M{L - 4},{ey + 1} A4,3.5 0 0 1 {L + 4},{ey + 1} Z M{R - 4},{ey + 1} A4,3.5 0 0 1 {R + 4},{ey + 1} Z" fill="{INK}"/>'
        s += f'<ellipse cx="{L - 4}" cy="{ey + 7}" rx="4.6" ry="2.6" fill="{ROSE}" opacity=".9"/><ellipse cx="{R + 4}" cy="{ey + 7}" rx="4.6" ry="2.6" fill="{ROSE}" opacity=".9"/>'
    elif mood == "sad":
        s += f'<path d="M{L - 5},{ey - 4} L{L + 3},{ey - 7} M{R + 5},{ey - 4} L{R - 3},{ey - 7}" fill="none" {sa}/>'
        s += f'<ellipse cx="{L}" cy="{ey + 1}" rx="2.4" ry="3.2" fill="{INK}"/><ellipse cx="{R}" cy="{ey + 1}" rx="2.4" ry="3.2" fill="{INK}"/>'
    elif mood == "look":  # 곁눈질 (디오 쪽을 본다)
        s += f'<ellipse cx="{L + 2}" cy="{ey}" rx="2.6" ry="3.6" fill="{INK}"/><ellipse cx="{R + 2}" cy="{ey}" rx="2.6" ry="3.6" fill="{INK}"/>'
    elif mood == "wink":
        s += f'<ellipse cx="{L}" cy="{ey}" rx="2.6" ry="3.6" fill="{INK}"/><path d="M{R - 4.5},{ey + 1} Q{R},{ey - 5} {R + 4.5},{ey + 1}" fill="none" {sa}/>'
    elif mood == "blank":
        pass
    return s


def duri(x, y, h, mood="default", head=WHITE, coat=PRIMARY, scarf=ACCENT, stripe=SOFT, lw_abs=4.0, view="front", pose=None, ink=INK, scarf_up=False, tail="down", extra_body=""):
    """두리 한 마리. h = 상자 높이(150) 의 실제 px. tail: down · fly(바람) · back · none."""
    k = h / 150.0
    lw = lw_abs / k
    sa = stroke_attrs(lw, ink)
    pose = pose or mood
    _uid[0] += 1
    cid = f"sc{_uid[0]}"
    s = ""
    # 다리
    if pose == "walk":
        s += limb("M41,132 L36,144 H28", 7, coat, lw, ink) + limb("M59,132 L64,142 H72", 7, coat, lw, ink)
    elif view == "side":
        s += limb("M46,132 V144 H38", 7, coat, lw, ink) + limb("M54,132 V144 H62", 7, coat, lw, ink)
    else:
        s += limb("M40,132 V144 H32", 7, coat, lw, ink) + limb("M60,132 V144 H68", 7, coat, lw, ink)
    # 뒤쪽 팔 (포즈)
    if view == "front" and pose in ("wave",):
        s += limb("M70,88 C80,84 88,74 86,64", 8, coat, lw, ink)
    if view == "front" and pose == "happy":
        s += limb("M31,88 C22,84 16,76 18,66", 8, coat, lw, ink) + limb("M69,88 C78,84 84,76 82,66", 8, coat, lw, ink)
    # 코트
    if view == "back":
        s += f'<path d="{COAT_PATH}" fill="{coat}" {sa}/>'
        s += f'<path d="M50,78 L50,128" stroke="{ink}" stroke-width="{lw:.2f}" opacity=".25"/>'
    elif view == "side":
        s += f'<path d="M38,74 L62,74 L68,128 Q69,132 64,132 L36,132 Q31,132 32,128 Z" fill="{coat}" {sa}/>'
    else:
        s += f'<path d="{COAT_PATH}" fill="{coat}" {sa}/>'
        if view == "front":
            s += f'<circle cx="50" cy="94" r="3.2" fill="{head}" {sa}/><circle cx="50" cy="110" r="3.2" fill="{head}" {sa}/>'
        else:
            s += f'<circle cx="44" cy="94" r="3.2" fill="{head}" {sa}/><circle cx="44" cy="110" r="3.2" fill="{head}" {sa}/>'
    # 머리
    if view == "side":
        hp = "M28,56 C28,24 40,12 54,12 C70,12 80,24 80,56 C80,62 76,66 70,66 L38,66 C32,66 28,62 28,56 Z"
        s += f'<path d="{hp}" fill="{head}" {sa}/>'
        s += f'<ellipse cx="66" cy="44" rx="2.6" ry="3.6" fill="{ink}"/>'
    elif view == "back":
        s += f'<path d="{HEAD_PATH}" fill="{head}" {sa}/>'
    else:
        s += f'<path d="{HEAD_PATH}" fill="{head}" {sa}/>'
        if not scarf_up:
            s += duri_face(mood, lw, cx=50 if view == "front" else 54)
    # 목도리 꼬리 (띠 아래에서 나온다)
    if tail == "down" and view != "back":
        tp = "M24,72 C12,84 4,98 10,112 C13,119 24,117 26,109 C28,98 32,86 40,76 Z"
    elif tail == "fly":
        tp = "M24,66 C8,58 -8,52 -16,40 C-20,34 -12,28 -6,32 C6,42 18,54 36,64 Z"
    elif tail == "back":
        tp = "M76,70 C86,80 94,96 90,110 C88,117 78,116 76,108 C74,98 72,88 64,76 Z"
    else:
        tp = None
    if tp:
        s += f'<clipPath id="{cid}t"><path d="{tp}"/></clipPath>'
        s += f'<path d="{tp}" fill="{scarf}"/>' + stripes(cid + "t", stripe, 2.6, -30, 20, 110, 130) + f'<path d="{tp}" fill="none" {sa}/>'
    # 목도리 띠
    by = 50 if scarf_up else 58
    bh = 24 if scarf_up else 19
    if view == "back":
        band = f"M18,{by} L82,{by} Q88,{by} 88,{by + 8} L88,{by + bh - 8} Q88,{by + bh} 82,{by + bh} L18,{by + bh} Q12,{by + bh} 12,{by + bh - 8} L12,{by + 8} Q12,{by} 18,{by} Z"
    elif view == "side":
        band = f"M30,{by} L74,{by} Q82,{by} 82,{by + 9} Q82,{by + bh} 74,{by + bh} L30,{by + bh} Q22,{by + bh} 22,{by + 9} Q22,{by} 30,{by} Z"
    else:
        band = f"M18,{by} L82,{by} Q92,{by} 92,{by + 9} Q92,{by + bh} 82,{by + bh} L18,{by + bh} Q8,{by + bh} 8,{by + 9} Q8,{by} 18,{by} Z"
    s += f'<clipPath id="{cid}b"><path d="{band}"/></clipPath>'
    s += f'<path d="{band}" fill="{scarf}"/>' + stripes(cid + "b", stripe, 2.6, 0, by - 10, 100, by + bh + 10) + f'<path d="{band}" fill="none" {sa}/>'
    if scarf_up and view == "front":
        # 눈만 빼꼼
        s += duri_face(mood, lw, cx=50, ey=42)
    # 앞 팔
    s += extra_body
    return g(s, x, y, k)


# ──────────────────────────────── 시트 공통 ────────────────────────────────

def svg_doc(w, h, body, bg=WHITE):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>')


def badge(x, y, n, r=11, fill=PRIMARY):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>' + text(x, y + 4.2, str(n), size=12, weight=800, fill=WHITE, anchor="middle")


def callout(x1, y1, x2, y2, n, color=PRIMARY):
    """(x1,y1) 부위 → (x2,y2) 번호표."""
    return (f'<circle cx="{x1}" cy="{y1}" r="3.2" fill="{color}"/>'
            f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{color}" stroke-width="1.6" fill="none"/>' + badge(x2, y2, n))


def label(x, y, title, sub="", size=13, w=None):
    s = text(x, y, title, size=size, weight=800, fill=NAVY)
    if sub:
        s += text(x, y + size + 3, sub, size=size - 2.5, weight=600, fill="rgba(11,25,87,0.68)")
    return s


def title_bar(w, title, sub=""):
    s = f'<rect x="0" y="0" width="{w}" height="54" fill="{MUTED}"/>'
    s += text(28, 34, title, size=20, weight=900, fill=NAVY)
    if sub:
        s += text(w - 28, 34, sub, size=12.5, weight=600, fill="rgba(11,25,87,0.68)", anchor="end")
    return s


def swatch(x, y, color, name, hexv, w=96, h=56):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{color}" stroke="rgba(11,25,87,0.16)"/>'
            + text(x, y + h + 16, name, size=11.5, weight=800) + text(x, y + h + 30, hexv, size=10.5, weight=600, fill="rgba(11,25,87,0.68)"))
