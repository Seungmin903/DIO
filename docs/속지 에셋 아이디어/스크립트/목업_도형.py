"""목업 공통 라이브러리 — 속지(1024×768) · 에셋 카드(640×480) SVG 조각 생성기

모든 목업은 이 파일의 도형 · 소품 함수만으로 그린다. 색은 디자인 가이드 §2.4 꾸미기 팔레트(표지 색 · 테이프 색)에서 가져왔고, 종이 바탕은 흰색(#FFFFFF)이다.
속지 함수 시그니처:  fn(W, H, land) -> list[str]   (W=1024, H=768, land=True)
에셋 함수 시그니처:  fn(W, H) -> list[str]         (W=640, H=480)
"""
import html
import math
import random

# ── 팔레트 (디자인 가이드 §2.4) ──────────────────────────────────────────
PAPER = "#FFFFFF"; INK = "#1D1D1F"; MUTED = "#8A8F98"; LINE = "#D9D4C7"; LINE2 = "#ECE7DC"
PERI = "#9DABD8"; ROSE = "#F0B0AA"; SAGE = "#A9BFA6"; MUST = "#EBC56F"; LAV = "#C3AEDD"; CAMEL = "#D9A87F"; CHAR = "#474F55"; CREAM = "#EAE3D4"
PEN = "#3B4A8F"              # 손글씨 샘플(파란 펜)
NAVY = "#0B1957"             # 앱 UI 글자색(알림 알약 바탕)
PRIMARY = "#6E92C6"          # 앱 주요 색
TAPES = {"pink": ("#FAD3DC", "#F59AB2"), "butter": ("#FFF1C2", "#EFC04F"), "mint": ("#E3F4EC", "#8FD3B6"),
         "sky": ("#DCEBFA", "#6E92C6"), "lavender": ("#ECE5FB", "#B39DED"), "kraft": ("#D9B98F", "#A27B4E"),
         "charcoal": ("#3E4350", "#F3F1EA"), "ivory": ("#F3F1EA", "#3E4350")}
PENS = ["#1D1D1F", "#14B8A6", "#22A06B", "#F59E0B", "#EF476F", "#9B6BDF", "#6B7280"]
HIGHLIGHTERS = ["#FFE066", "#FFB3C7", "#B5EAD7", "#A0C4FF", "#D0B8FF", "#FFD6A5", "#C7F0A0"]
PAPERS = ["#FFFFFF", "#FFF8E7", "#EDF3EA", "#FBEFF0", "#EDF3FA", "#F1EFEB"]
MEMBERS = [("민", PERI), ("수", ROSE), ("지", SAGE), ("현", MUST)]
NAMES = ["민희", "수아", "지우", "현아"]
M = 48  # 속지 여백

FONT_CSS = ("@import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800"
            "&family=Nanum+Pen+Script&family=Nanum+Myeongjo:wght@700&display=swap');"
            ".l{font-family:'Nanum Gothic','Malgun Gothic',sans-serif}"
            ".h{font-family:'Nanum Pen Script','Nanum Gothic',cursive}"
            ".s{font-family:'Nanum Myeongjo',serif;font-weight:700}"
            ".m{font-family:ui-monospace,Consolas,'Nanum Gothic',monospace}")

DEFS = ('<defs>'
        '<pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#B3B6BE" stroke-width="2"/></pattern>'
        '<linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        '<linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C3AEDD"/><stop offset="1" stop-color="#9DABD8"/></linearGradient>'
        '<linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD1E8"/><stop offset=".25" stop-color="#FFF4B8"/><stop offset=".5" stop-color="#C8F7E2"/><stop offset=".75" stop-color="#C7D9FF"/><stop offset="1" stop-color="#EBD1FF"/></linearGradient>'
        '<linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3D98B"/><stop offset=".5" stop-color="#C79A2E"/><stop offset="1" stop-color="#F7E6B0"/></linearGradient>'
        '<linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D9DCE3"/><stop offset=".5" stop-color="#AEB3BE"/><stop offset="1" stop-color="#E9EBF0"/></linearGradient>'
        '<filter id="shadow" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#5B5248" flood-opacity=".22"/></filter>'
        '<filter id="softshadow" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#5B5248" flood-opacity=".18"/></filter>'
        '<filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>'
        '<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" seed="7" result="n"/><feColorMatrix in="n" type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".18"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter>'
        '</defs>')


# ── 기본 도형 ─────────────────────────────────────────────────────────────
def T(x, y, s, size=13, cls="l", fill=INK, anchor="start", weight=None, opacity=None, rotate=None, ls=None):
    a = [f'x="{x}" y="{y}" font-size="{size}" class="{cls}" fill="{fill}" text-anchor="{anchor}"']
    if weight: a.append(f'font-weight="{weight}"')
    if opacity is not None: a.append(f'opacity="{opacity}"')
    if rotate: a.append(f'transform="rotate({rotate} {x} {y})"')
    if ls: a.append(f'letter-spacing="{ls}"')
    return f"<text {' '.join(a)}>{html.escape(str(s))}</text>"


def R(x, y, w, h, fill="none", stroke=LINE, sw=1, rx=0, dash=None, opacity=None, filt=None):
    a = f'x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" rx="{rx}"'
    if dash: a += f' stroke-dasharray="{dash}"'
    if opacity is not None: a += f' opacity="{opacity}"'
    if filt: a += f' filter="url(#{filt})"'
    return f"<rect {a}/>"


def L(x1, y1, x2, y2, stroke=LINE, sw=1, dash=None, opacity=None):
    a = f'x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round"'
    if dash: a += f' stroke-dasharray="{dash}"'
    if opacity is not None: a += f' opacity="{opacity}"'
    return f"<line {a}/>"


def C(cx, cy, r, fill="none", stroke=LINE, sw=1, dash=None, opacity=None, filt=None):
    a = f'cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"'
    if dash: a += f' stroke-dasharray="{dash}"'
    if opacity is not None: a += f' opacity="{opacity}"'
    if filt: a += f' filter="url(#{filt})"'
    return f"<circle {a}/>"


def E(cx, cy, rx, ry, fill="none", stroke=LINE, sw=1, opacity=None):
    a = f'cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"'
    if opacity is not None: a += f' opacity="{opacity}"'
    return f"<ellipse {a}/>"


def P(d, fill="none", stroke=LINE, sw=1, opacity=None, dash=None, filt=None, cap="round"):
    a = f'd="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="{cap}" stroke-linejoin="round"'
    if opacity is not None: a += f' opacity="{opacity}"'
    if dash: a += f' stroke-dasharray="{dash}"'
    if filt: a += f' filter="url(#{filt})"'
    return f"<path {a}/>"


def G(items, transform=None, opacity=None, filt=None, clip=None):
    a = ""
    if transform: a += f' transform="{transform}"'
    if opacity is not None: a += f' opacity="{opacity}"'
    if filt: a += f' filter="url(#{filt})"'
    if clip: a += f' clip-path="url(#{clip})"'
    return f"<g{a}>{''.join(items)}</g>"


def clip_rect(cid, x, y, w, h, rx=0):
    return f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/></clipPath>'


def poly(points, fill="none", stroke=LINE, sw=1, opacity=None):
    pts = " ".join(f"{x},{y}" for x, y in points)
    a = f'points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"'
    if opacity is not None: a += f' opacity="{opacity}"'
    return f"<polygon {a}/>"


# ── 다꾸 소품 ─────────────────────────────────────────────────────────────
def torn_rect_path(x, y, w, h, z=5, seed=1):
    """양끝이 찢긴 사각형 패스 (테이프 · 종이 조각)."""
    rnd = random.Random(seed)
    left = " ".join(f"L{x + (z if i % 2 else 0) + rnd.uniform(-1, 1):.1f},{y + h * i / 6:.1f}" for i in range(1, 6))
    right = " ".join(f"L{x + w - (z if i % 2 else 0) + rnd.uniform(-1, 1):.1f},{y + h - h * i / 6:.1f}" for i in range(1, 6))
    return f"M{x},{y} L{x + w},{y} {right} L{x + w},{y + h} L{x},{y + h} {left} Z"


def tape(x, y, w, h, key="pink", angle=0, torn=True, pattern="dots", opacity=0.85):
    """마스킹테이프 조각. pattern: dots · stripes · check · plain · grid · zigzag"""
    bg, fg = TAPES[key]
    d = torn_rect_path(x, y, w, h) if torn else f"M{x},{y} h{w} v{h} h-{w} Z"
    deco = []
    if pattern == "dots":
        deco = [C(x + 10 + i * 14, y + h / 2, 2, fill=fg, stroke="none") for i in range(max(0, int((w - 20) / 14)))]
    elif pattern == "stripes":
        deco = [L(x + 8 + i * 12, y + 2, x + 8 + i * 12 - 6, y + h - 2, stroke=fg, sw=2) for i in range(max(0, int((w - 10) / 12)))]
    elif pattern == "check":
        cs = max(6, h / 3)
        for i in range(int(w / cs)):
            for j in range(int(h / cs)):
                if (i + j) % 2 == 0: deco.append(R(x + i * cs, y + j * cs, cs, cs, fill=fg, stroke="none", opacity=0.45))
    elif pattern == "grid":
        deco = [L(x + i * 10, y, x + i * 10, y + h, stroke=fg, sw=0.8, opacity=0.6) for i in range(int(w / 10) + 1)]
        deco += [L(x, y + j * 10, x + w, y + j * 10, stroke=fg, sw=0.8, opacity=0.6) for j in range(int(h / 10) + 1)]
    elif pattern == "zigzag":
        pts = " ".join(f"L{x + 6 + i * 8},{y + h / 2 + (h / 4 if i % 2 else -h / 4)}" for i in range(int((w - 12) / 8)))
        deco = [P(f"M{x + 6},{y + h / 2} {pts}", stroke=fg, sw=1.6)]
    return G([P(d, fill=bg, stroke="none"), *deco], transform=f"rotate({angle} {x + w / 2} {y + h / 2})", opacity=opacity)


def tape_roll(cx, cy, r, key="butter", label=None):
    bg, fg = TAPES[key]
    g = [C(cx, cy, r, fill=bg, stroke=fg, sw=1.5), C(cx, cy, r * 0.42, fill=PAPER, stroke="#D9CBA6", sw=1.2),
         C(cx, cy, r * 0.42, fill="none", stroke="#C9BB95", sw=0.6, opacity=0.6)]
    if label: g.append(T(cx, cy + r + 16, label, 11, fill=MUTED, anchor="middle"))
    return G(g)


def avatar(cx, cy, r, color, ch, size=None):
    return G([C(cx, cy, r, fill=color, stroke="none"), C(cx, cy, r, stroke="#fff", sw=2),
              T(cx, cy + (size or r) * 0.36, ch, size or r, fill="#fff", anchor="middle", weight=700)])


def stamp(cx, cy, r, color, text, size=14, angle=-12, rough=True):
    return G([C(cx, cy, r, stroke=color, sw=2.5, opacity=0.85), C(cx, cy, r - 5, stroke=color, sw=1, opacity=0.6),
              T(cx, cy + size * 0.35, text, size, fill=color, anchor="middle", weight=800, opacity=0.9)],
             transform=f"rotate({angle} {cx} {cy})", filt="rough" if rough else None)


def stamp_rect(x, y, w, h, color, lines_, size=12, angle=-6, rough=True):
    """네모 도장(타자 날짜 도장 느낌). lines_: 글줄 목록"""
    g = [R(x, y, w, h, stroke=color, sw=2, rx=3, opacity=0.9), R(x + 3, y + 3, w - 6, h - 6, stroke=color, sw=0.8, rx=2, opacity=0.6)]
    for i, s in enumerate(lines_):
        g.append(T(x + w / 2, y + h / 2 + (i - (len(lines_) - 1) / 2) * (size + 4) + size * 0.35, s, size, cls="m", fill=color, anchor="middle", weight=700, opacity=0.9))
    return G(g, transform=f"rotate({angle} {x + w / 2} {y + h / 2})", filt="rough" if rough else None)


def scratch(x, y, w, h, label="긁어서 보기", rx=6):
    return G([R(x, y, w, h, fill="url(#silver)", stroke="#B3B6BE", rx=rx),
              R(x, y, w, h, fill="url(#hatch)", stroke="none", rx=rx, opacity=0.5),
              T(x + w / 2, y + h / 2 + 5, label, 13, fill="#5B5F6B", anchor="middle", weight=700)])


def lock(cx, cy, s=14, color=MUTED, open_=False):
    arc = (f"M{cx - s * .35},{cy} v-{s * .45} a{s * .35},{s * .35} 0 0 1 {s * .7},0 v{s * .15}" if open_
           else f"M{cx - s * .35},{cy} v-{s * .45} a{s * .35},{s * .35} 0 0 1 {s * .7},0 v{s * .45}")
    return G([P(arc, stroke=color, sw=2), R(cx - s * .55, cy, s * 1.1, s * .85, fill=color, stroke="none", rx=2)])


def pen(cx, cy, color=INK):
    return P(f"M{cx - 10},{cy + 10} l16,-16 l5,5 l-16,16 z M{cx - 10},{cy + 10} l-2,7 l7,-2", fill=color, stroke=color, sw=1.5)


def check(x, y, s=16, color=INK, on=False):
    g = [R(x, y, s, s, stroke=color, sw=1.5, rx=3)]
    if on: g.append(P(f"M{x + 3},{y + s / 2} l{s * .25},{s * .25} l{s * .45},-{s * .5}", stroke=color, sw=2.5))
    return G(g)


def photo(x, y, w, h, label="사진", color=LINE2, rx=4):
    """사진 자리(산 · 해 아이콘)."""
    return G([R(x, y, w, h, fill=color, stroke=LINE, rx=rx),
              P(f"M{x + w * .15},{y + h * .8} l{w * .22},-{h * .3} l{w * .15},{h * .15} l{w * .18},-{h * .25} l{w * .15},{h * .4}", stroke="#C8C2B4", sw=2, fill="none"),
              C(x + w * .72, y + h * .25, min(w, h) * .07, fill="#C8C2B4", stroke="none"),
              *( [T(x + w / 2, y + h - 8, label, 11, fill=MUTED, anchor="middle")] if label else [])])


def photo_filled(x, y, w, h, tone="sky", rx=4):
    """색이 채워진 '찍은 사진' 느낌(하늘 · 바닥 두 톤)."""
    tones = {"sky": ("#CFE3F5", "#B8D0B0"), "cafe": ("#E9D9C8", "#C9A98B"), "night": ("#9FA8C9", "#5B6283"), "pink": ("#F6D8DF", "#E8B6C3"), "green": ("#D7E8CF", "#A6C49A")}
    a, b = tones.get(tone, tones["sky"])
    return G([R(x, y, w, h, fill=a, stroke="none", rx=rx), R(x, y + h * .62, w, h * .38, fill=b, stroke="none", rx=rx),
              C(x + w * .75, y + h * .28, min(w, h) * .09, fill="#FFF3C4", stroke="none", opacity=0.9), R(x, y, w, h, stroke="#CFC8BA", rx=rx)])


def polaroid(x, y, w, caption="", angle=0, tone="sky", color="#FFFFFF"):
    """폴라로이드 틀: 폭 w, 사진은 정사각, 아래 넓은 여백."""
    pad = w * 0.07; ph = w - 2 * pad; h = ph + pad + w * 0.28
    g = [R(x, y, w, h, fill=color, stroke="#DDD6C9", rx=2, filt="shadow"), photo_filled(x + pad, y + pad, ph, ph, tone, rx=1)]
    if caption: g.append(T(x + w / 2, y + h - w * 0.1, caption, max(10, w * 0.085), cls="h", fill=PEN, anchor="middle"))
    return G(g, transform=f"rotate({angle} {x + w / 2} {y + h / 2})")


def hand(x, y, s, size=22, color=PEN, rotate=None, anchor="start"):
    return T(x, y, s, size, cls="h", fill=color, rotate=rotate, anchor=anchor)


def dotgrid(x, y, w, h, gap=24, color="#CFC9BB"):
    pts = []
    cx = x
    while cx <= x + w + 0.1:
        cy = y
        while cy <= y + h + 0.1:
            pts.append(f"M{cx:.0f},{cy:.0f}h0.01")
            cy += gap
        cx += gap
    return f'<path d="{" ".join(pts)}" stroke="{color}" stroke-width="2.2" fill="none" stroke-linecap="round"/>'


def lines(x, y, w, h, gap=30, color=LINE):
    out, cy = [], y + gap
    while cy <= y + h + 0.1:
        out.append(L(x, cy, x + w, cy, stroke=color)); cy += gap
    return "".join(out)


def grid(x, y, w, h, gap=24, color=LINE2, bold_every=0, bold_color=LINE):
    out = []
    i = 0; cx = x
    while cx <= x + w + 0.1:
        out.append(L(cx, y, cx, y + h, stroke=bold_color if bold_every and i % bold_every == 0 else color, sw=1 if bold_every and i % bold_every == 0 else 0.8)); cx += gap; i += 1
    j = 0; cy = y
    while cy <= y + h + 0.1:
        out.append(L(x, cy, x + w, cy, stroke=bold_color if bold_every and j % bold_every == 0 else color, sw=1 if bold_every and j % bold_every == 0 else 0.8)); cy += gap; j += 1
    return "".join(out)


def header(W, title, sub=None, accent=PERI, right=None):
    g = [R(M, M, 10, 10, fill=accent, stroke="none", rx=2),
         T(M + 18, M + 10, title, 13, weight=800, ls="0.08em"),
         L(M, M + 24, W - M, M + 24, stroke=LINE, dash="2 4")]
    if sub: g.append(T(M + 18, M + 44, sub, 11, fill=MUTED))
    if right: g.append(T(W - M, M + 10, right, 12, fill=MUTED, anchor="end"))
    return G(g)


def dashed_box(x, y, w, h, label=None, color=LINE, rx=8, dots=True):
    """비어 있는 칸(점선) — 온라인 속지의 '비어 있음' 상태"""
    g = [R(x, y, w, h, stroke=color, dash="4 4", rx=rx)]
    if dots: g.append(dotgrid(x + 12, y + 12, w - 24, h - 24, 24))
    if label: g.append(T(x + w / 2, y + h / 2 + 5, label, 12, fill=MUTED, anchor="middle"))
    return G(g)


def star(cx, cy, r, fill=MUST, stroke="none", sw=1):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    return poly(pts, fill=fill, stroke=stroke, sw=sw)


def heart(cx, cy, s, fill=ROSE, stroke="none", sw=1, opacity=None):
    d = (f"M{cx},{cy + s * .35} C{cx - s * 1.1},{cy - s * .45} {cx - s * .45},{cy - s * 1.05} {cx},{cy - s * .5} "
         f"C{cx + s * .45},{cy - s * 1.05} {cx + s * 1.1},{cy - s * .45} {cx},{cy + s * .35} Z")
    return P(d, fill=fill, stroke=stroke, sw=sw, opacity=opacity)


def sparkle(cx, cy, s, fill=MUST):
    d = f"M{cx},{cy - s} Q{cx},{cy} {cx + s},{cy} Q{cx},{cy} {cx},{cy + s} Q{cx},{cy} {cx - s},{cy} Q{cx},{cy} {cx},{cy - s} Z"
    return P(d, fill=fill, stroke="none")


def ribbon(cx, cy, w, h, color=ROSE, text=None):
    """리본 띠(가운데 글자)."""
    g = [poly([(cx - w / 2 - 14, cy - h / 2), (cx - w / 2 + 6, cy - h / 2), (cx - w / 2 + 6, cy + h / 2), (cx - w / 2 - 14, cy + h / 2), (cx - w / 2 - 4, cy)], fill=color, opacity=0.8),
         poly([(cx + w / 2 + 14, cy - h / 2), (cx + w / 2 - 6, cy - h / 2), (cx + w / 2 - 6, cy + h / 2), (cx + w / 2 + 14, cy + h / 2), (cx + w / 2 + 4, cy)], fill=color, opacity=0.8),
         R(cx - w / 2, cy - h / 2, w, h, fill=color, stroke="none", rx=2)]
    if text: g.append(T(cx, cy + 5, text, 13, fill="#fff", anchor="middle", weight=800))
    return G(g)


def envelope(x, y, w, h, sealed=True, color=CREAM, wax=ROSE, label=None):
    g = [R(x, y, w, h, fill=color, stroke="#D7CDB9", rx=5, filt="softshadow"),
         P(f"M{x},{y} L{x + w / 2},{y + h * .55} L{x + w},{y}", fill="#E3DAC6", stroke="#D7CDB9")]
    if sealed:
        g += [C(x + w / 2, y + h * .52, min(w, h) * .14, fill=wax, stroke="#D98B84", sw=2, filt="rough"),
              T(x + w / 2, y + h * .52 + 4, "DIO", min(w, h) * .09, fill="#fff", anchor="middle", weight=800)]
    else:
        g.append(P(f"M{x},{y} L{x + w / 2},{y - h * .45} L{x + w},{y}", fill="#EDE6D5", stroke="#D7CDB9"))
    if label: g.append(T(x + w / 2, y + h + 16, label, 11, fill=MUTED, anchor="middle"))
    return G(g)


def speech(x, y, w, h, text=None, fill="#FFFFFF", stroke=LINE, tail="left", size=13):
    tx = x + (24 if tail == "left" else w - 24)
    g = [R(x, y, w, h, fill=fill, stroke=stroke, rx=10), poly([(tx - 8, y + h), (tx + 8, y + h), (tx + (-4 if tail == "left" else 4), y + h + 12)], fill=fill, stroke=stroke),
         L(tx - 7, y + h, tx + 7, y + h, stroke=fill, sw=2)]
    if text: g.append(T(x + w / 2, y + h / 2 + size * 0.35, text, size, cls="h" if size > 15 else "l", fill=INK if size <= 15 else PEN, anchor="middle"))
    return G(g)


def notif_pill(x, y, text, w=None, icon=True):
    """앱 알림 알약(디자인 가이드 §9 토스트: 바탕 text 색, 글자 13/700 흰색, 모서리 999)."""
    w = w or (len(text) * 12.5 + 44 + (18 if icon else 0))
    g = [R(x, y, w, 34, fill=NAVY, stroke="none", rx=17, filt="shadow")]
    if icon: g.append(C(x + 18, y + 17, 5, fill=PRIMARY, stroke="none"))
    g.append(T(x + (32 if icon else 16), y + 22, text, 13, fill="#fff", weight=700))
    return G(g)


def label_tag(x, y, text, color=PERI, size=11, fill=None):
    w = len(text) * size * 0.95 + 16
    return G([R(x, y, w, size + 10, fill=fill or color, stroke="none", rx=4), T(x + w / 2, y + size + 2.5, text, size, fill="#fff" if not fill else color, anchor="middle", weight=700)])


def sticker_sheet(x, y, w, h, fill="#FFFFFF", rx=10, label=None):
    """키스컷 스티커 시트(흰 바탕 · 그림자). 위에 스티커를 올린다."""
    g = [R(x, y, w, h, fill=fill, stroke="#E6E0D4", rx=rx, filt="shadow")]
    if label: g.append(T(x + 12, y + h - 10, label, 10, fill=MUTED))
    return G(g)


def sticker_outline(d, fill, pad=3.5):
    """씰 스티커 흰 테두리 느낌: 같은 패스를 굵은 흰 선으로 먼저 그린다."""
    return G([P(d, fill="#fff", stroke="#fff", sw=pad * 2, filt="softshadow"), P(d, fill=fill, stroke="none")])


def paper_swatch(x, y, w, h, fill, label=None, texture=None, rx=6):
    """종이 견본(질감 선택)."""
    g = [R(x, y, w, h, fill=fill, stroke="#D9D2C4", rx=rx, filt="softshadow")]
    if texture == "grain": g.append(R(x, y, w, h, fill=fill, stroke="none", rx=rx, filt="grain"))
    if texture == "grid": g.append(G([grid(x + 6, y + 6, w - 12, h - 12, 12, "#D7D0C2")]))
    if texture == "dots": g.append(dotgrid(x + 10, y + 10, w - 20, h - 20, 12, "#CFC9BB"))
    if texture == "lines": g.append(lines(x + 6, y + 6, w - 12, h - 18, 14, "#D7D0C2"))
    if label: g.append(T(x + w / 2, y + h + 15, label, 11, fill=MUTED, anchor="middle"))
    return G(g)


def phone_card(x, y, w, h, title, sub=None):
    """링크 카드(OG 이미지 + 제목) 종이 카드."""
    return G([R(x, y, w, h, fill="#fff", stroke=LINE, rx=8, filt="softshadow"), photo_filled(x, y, w, h * .6, "night", rx=8), R(x, y + h * .45, w, h * .15, fill="#fff", stroke="none"),
              T(x + 12, y + h * .6 + 20, title, 12, weight=700), *( [T(x + 12, y + h * .6 + 38, sub, 10, fill=MUTED)] if sub else [])])


def mini_calendar(x, y, w, h, days=31, start=3, marks=None, accent=PERI, cell_fill=None):
    """작은 먼슬리 격자(7열). marks: {day: svg_fn(cx, cy, r)}"""
    marks = marks or {}
    cw = w / 7; rows = -(-(days + start) // 7); rh = h / rows
    g = []
    for i, d in enumerate("일월화수목금토"):
        g.append(T(x + i * cw + cw / 2, y - 6, d, 9, fill=ROSE if i == 0 else MUTED, anchor="middle"))
    for d in range(days):
        idx = d + start; r, c = divmod(idx, 7)
        cx, cy = x + c * cw, y + r * rh
        g.append(R(cx, cy, cw, rh, fill=cell_fill or "none", stroke=LINE2))
        g.append(T(cx + 4, cy + 11, str(d + 1), 9, fill=MUTED))
        if d + 1 in marks: g.append(marks[d + 1](cx + cw / 2, cy + rh / 2 + 3, min(cw, rh) * .3))
    g.append(R(x, y, w, rows * rh, stroke=LINE))
    return G(g)


# ── 프레임 ────────────────────────────────────────────────────────────────
def frame(W, H, body, label, bg=PAPER):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{html.escape(label)}">'
            f"<style>{FONT_CSS}</style>{DEFS}"
            f'<rect width="{W}" height="{H}" fill="{bg}"/>{body}</svg>')


def asset_bg(W, H, kind="paper"):
    """에셋 카드 바탕: paper(도트 노트 위) · plain(크림 단색) · dark(차콜, 흰 펜 등)"""
    if kind == "paper":
        return [dotgrid(24, 24, W - 48, H - 48, 24, "#E4DED0")]
    if kind == "dark":
        return [R(0, 0, W, H, fill="#3E4350", stroke="none")]
    return []
