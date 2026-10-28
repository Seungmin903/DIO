# -*- coding: utf-8 -*-
"""헤더(X 프로필 배너) 시안 5안 — 1500×500 마스터(2배 3000×1000 으로 출력) + 안전 영역 설명도

실행:  python "docs/트위터 마케팅/스크립트/헤더만들기.py"
결과:  목업/헤더 1 기본형.jpg … 헤더 5 공지형.jpg (3000×1000)
       목업/헤더 안전 영역.jpg (웹 · 모바일에서 가려지는 자리 설명도)
규칙:  글자는 인장이 가리는 왼쪽 아래(x 0~400, y 330~500) 와 모바일 버튼이 얹히는 위쪽 모서리를 피해 가운데 띠에 둔다. 글은 한 줄 큰 글씨(60px 이상) + 작은 보조 한 줄까지만.
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from 목업_도형 import (COAT, CREAM, FONT, INK, LILAC, NAVY, SOFT, WHITE, art, art_c, dotted_paper, logo, photo_placeholder, polaroid,  # noqa: E402
                       render, sticker, svg_doc, tape, text)

OUT = Path(__file__).resolve().parent.parent / "목업"
W, H = 1500, 500
FLOOR = 498  # 캐릭터가 서는 바닥(헤더 아래 끝)


def pill(x, y, label, size=26, fill=WHITE, fg=NAVY, pad_x=22, h=None, weight=800, stroke=None):
    h = h or size * 1.9
    w = len(label) * size * 0.98 + pad_x * 2
    return (f'<rect x="{x}" y="{y}" width="{w:.0f}" height="{h:.0f}" rx="{h / 2:.0f}" fill="{fill}"' + (f' stroke="{stroke}" stroke-width="2"' if stroke else "") + '/>'
            + text(x + w / 2, y + h / 2 + size * 0.35, label, size=size, weight=weight, fill=fg, anchor="middle"))


def snow(n, seed=7, x0=0, x1=W, y0=0, y1=H, rmin=2.5, rmax=7):
    rnd = random.Random(seed)
    return "".join(f'<circle cx="{rnd.uniform(x0, x1):.0f}" cy="{rnd.uniform(y0, y1):.0f}" r="{rnd.uniform(rmin, rmax):.1f}" fill="#FFFFFF" opacity="{rnd.uniform(.55, .95):.2f}"/>' for _ in range(n))


def pair(dio_x=842, duri_x=1128, h_dio=326, h_duri=398, flip_duri=False):
    """바닥에 선 디오 · 두리(최종 시안 그대로). dio_x/duri_x 는 각 영역 왼쪽 위 x."""
    from 목업_도형 import REGIONS
    dh = REGIONS["dio_all"][3]
    uh = REGIONS["duri_all"][3]
    return (art("dio_all", dio_x, FLOOR - h_dio, h=h_dio)
            + art("duri_all", duri_x, FLOOR - h_duri, h=h_duri, flip=flip_duri))


# ───────────────────────── 1 기본형 ─────────────────────────
def h1():
    b = dotted_paper(W, H, base=SOFT, dot="#B7C6E4", step=38, r=2.6)
    b += tape(-30, 52, 330, 54, rot=-9, color="#FAD3DC", mark="#F59AB2", pattern="dots")
    b += tape(1190, 38, 250, 46, rot=6, color="#FFF1C2", mark="#EFC04F", pattern="stripes")
    b += text(444, 178, "하루 한 장,", size=66, weight=900, fill=NAVY)
    b += text(444, 256, "같이 꾸며요", size=66, weight=900, fill=NAVY)
    b += pill(446, 278, "친구와 함께 쓰는 다이어리", size=24, fill=WHITE, fg="#3B4A82", h=48)
    b += pair()
    b += sticker("heart", 1118, 196, size=64, rot=12) + sticker("star", 782, 124, size=54, rot=-12) + sticker("sparkle_pink", 1432, 236, size=46, rot=8)
    return svg_doc(W, H, b)


# ───────────────────────── 2 콜라주형 ─────────────────────────
def h2():
    b = f'<rect width="{W}" height="{H}" fill="#E6ECF8"/>'
    b += dotted_paper(W, H, base="#E6ECF8", dot="#C9D4EC", step=40, r=2.2)
    b += polaroid(466, 70, 230, 290, rot=-6, kind="sky")
    b += polaroid(724, 52, 230, 290, rot=5, kind="dusk")
    b += polaroid(982, 82, 230, 290, rot=-3, kind="cafe")
    b += tape(450, 62, 120, 40, rot=-28, color="#FFF1C2", mark="#EFC04F", pattern="stripes")
    b += tape(840, 40, 130, 40, rot=18, color="#FAD3DC", mark="#F59AB2", pattern="dots")
    b += tape(1090, 74, 120, 40, rot=-20, color="#E3F4EC", mark="#8FD3B6", pattern="check")
    b += sticker("heart", 640, 300, size=70, rot=-10) + sticker("star", 868, 276, size=64, rot=14) + sticker("flower_pink", 1120, 330, size=64, rot=6)
    b += sticker("sparkle", 560, 130, size=46) + sticker("photo", 1210, 120, size=60, rot=8)
    b += art("dio_all", 1244, FLOOR - 250, h=250)
    b += text(470, 452, "오늘의 한 장 위에", size=56, weight=900, fill=NAVY)
    return svg_doc(W, H, b)


# ───────────────────────── 3 달력형 ─────────────────────────
def h3():
    b = dotted_paper(W, H, base=SOFT, dot="#B7C6E4", step=38, r=2.6)
    days = [("월", "sky", "heart"), ("화", "dusk", "star"), ("수", "cafe", "flower_pink"), ("목", "snow", "sparkle"), ("금", "mint", "check")]
    cw, ch_, gap, x0, y0 = 150, 228, 14, 436, 70
    for i, (d, kind, st) in enumerate(days):
        x = x0 + i * (cw + gap)
        y = y0 + (i % 2) * 22
        b += f'<rect x="{x + 3}" y="{y + 6}" width="{cw}" height="{ch_}" rx="12" fill="#0B1957" opacity=".14"/><rect x="{x}" y="{y}" width="{cw}" height="{ch_}" rx="12" fill="#FFFFFF"/>'
        b += text(x + 14, y + 34, d, size=22, weight=900, fill=NAVY) + f'<circle cx="{x + cw - 24}" cy="{y + 26}" r="9" fill="{LILAC}"/>'
        b += photo_placeholder(x + 12, y + 50, cw - 24, 112, kind, rx=8)
        b += f'<rect x="{x + 14}" y="{y + 176}" width="{cw - 56}" height="8" rx="4" fill="#D5DDEE"/><rect x="{x + 14}" y="{y + 194}" width="{cw - 84}" height="8" rx="4" fill="#D5DDEE"/>'
        b += sticker(st, x + cw - 28, y + 150, size=52, rot=(-12, 10, -6, 14, -10)[i])
    b += tape(x0 - 20, y0 - 18, 120, 40, rot=-8, color="#FAD3DC", mark="#F59AB2", pattern="dots")
    b += text(442, 396, "차곡차곡, 하루 한 장", size=56, weight=900, fill=NAVY)
    b += art("dio_all", 1262, FLOOR - 236, h=236)
    b += art("duri_head", 1380, FLOOR - 160, h=160)
    return svg_doc(W, H, b)


# ───────────────────────── 4 겨울 시즌형 ─────────────────────────
def h4():
    b = f'<rect width="{W}" height="{H}" fill="#DCE6F6"/>' + snow(80, seed=11, y1=380)
    # 눈 쌓인 바닥 — 캐릭터는 그 위에 선다(두리는 눈사람처럼 보인다)
    b += (f'<path d="M0,402 Q220,372 470,404 T980,398 T1500,392 L1500,500 L0,500 Z" fill="#EEF3FC"/>'
          f'<path d="M0,440 Q300,410 640,442 T1260,436 T1500,430 L1500,500 L0,500 Z" fill="#FFFFFF"/>')
    b += pair(dio_x=836, duri_x=1112, h_dio=306, h_duri=380)
    b += text(446, 214, "12월의 한 장", size=68, weight=900, fill=NAVY)
    b += pill(448, 244, "첫눈 사진, 같이 꾸며요", size=24, fill=WHITE, fg="#3B4A82", h=48)
    b += sticker("bow", 880, FLOOR - 296, size=74, rot=-14)  # 디오 표지 왼쪽 위 모서리의 리본
    b += sticker("sparkle", 1010, 140, size=58, rot=-8) + sticker("sparkle_pink", 1436, 164, size=44) + sticker("sparkle", 760, 330, size=40, rot=10)
    return svg_doc(W, H, b)


# ───────────────────────── 5 공지형 ─────────────────────────
def h5():
    b = f'<rect width="{W}" height="{H}" fill="{CREAM}"/>' + dotted_paper(W, H, base="none", dot="#F2DD9A", step=40, r=2.4)
    b += tape(-30, 46, 300, 52, rot=-8, color="#DCEBFA", mark="#6E92C6", pattern="stripes")
    b += text(446, 176, "베타 테스터 모집", size=68, weight=900, fill=NAVY)
    b += text(446, 252, "DIO를 먼저 써 보세요", size=40, weight=800, fill="#3B4A82")
    b += pill(448, 290, "신청은 고정 게시물에서", size=26, fill=NAVY, fg=WHITE, h=54)
    b += pair(dio_x=890, duri_x=1140, h_dio=300, h_duri=366)
    b += sticker("popper", 1090, 150, size=76, rot=-8) + sticker("star", 842, 300, size=56, rot=12)
    return svg_doc(W, H, b)


HEADERS = [("헤더 1 기본형", h1), ("헤더 2 콜라주형", h2), ("헤더 3 달력형", h3), ("헤더 4 겨울 시즌형", h4), ("헤더 5 공지형", h5)]


# ───────────────────────── 안전 영역 설명도 ─────────────────────────
def safe_zone():
    """헤더 1 위에 가려지는 자리를 표시. 2026-10-26 x.com 공개 프로필을 직접 관측한 값(1500×500 기준으로 환산).
    웹(열 600px): 헤더 3:1, 인장 지름 약 136px(왼쪽 16px), 헤더 아래 66px 겹침 → x 40~380 · y 332~500.
    모바일 웹(390px): 헤더 약 2.5:1 로 보여 좌우가 각 약 8.6%(129) 잘리고, 인장 약 109px → x 180~527 · y 328~500."""
    base = h1()
    inner = base[base.index("</defs>") + len("</defs>"): -len("</svg>")]
    deco = (
        # 모바일 좌우 잘림
        f'<rect x="0" y="0" width="129" height="500" fill="#6B7280" opacity=".35"/><rect x="1371" y="0" width="129" height="500" fill="#6B7280" opacity=".35"/>'
        # 모바일 웹 인장 자리(큰 쪽)
        f'<rect x="180" y="328" width="347" height="172" fill="#F59E0B" opacity=".30"/>'
        # 웹 인장 자리
        f'<rect x="40" y="332" width="340" height="168" fill="#E5484D" opacity=".28"/>'
        # 안전 영역(글자 · 핵심 그림): 인장 위쪽 전체 + 인장 오른쪽
        f'<rect x="140" y="92" width="1231" height="232" fill="none" stroke="#1E9E6A" stroke-width="5" stroke-dasharray="14 10"/>'
        f'<rect x="540" y="324" width="831" height="170" fill="none" stroke="#1E9E6A" stroke-width="5" stroke-dasharray="14 10"/>')
    labels = (text(8, 36, "모바일에서 잘림", size=18, weight=800, fill="#FFFFFF") + text(1379, 36, "모바일에서 잘림", size=18, weight=800, fill="#FFFFFF")
              + text(60, 392, "인장(웹) x 40~380", size=20, weight=800, fill="#B3262B") + text(200, 440, "인장(모바일) x 180~527", size=20, weight=800, fill="#9A5B00")
              + text(150, 84, "글자 · 핵심 그림은 초록 점선 안 — x 140~1371 · y 92~324 (인장 위) / x 540~1371 (인장 오른쪽)", size=22, weight=800, fill="#157A52"))
    return svg_doc(W, H, inner + deco + labels)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, fn in HEADERS:
        render(fn(), OUT / f"{name}.jpg", W, H, scale=2)
        print("ok", name)
    render(safe_zone(), OUT / "헤더 안전 영역.jpg", W, H, scale=1)
    print("ok 안전 영역")
