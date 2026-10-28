# -*- coding: utf-8 -*-
"""게시글에 붙일 이미지 템플릿 10종 — 같은 틀에 문구만 바꿔 계속 찍어 내는 용도

실행:  python "docs/트위터 마케팅/스크립트/게시물이미지.py"            (전부)
       python "docs/트위터 마케팅/스크립트/게시물이미지.py" 오늘의한장   (이름 포함하는 것만)
결과:  목업/게시물 NN 이름.jpg  (1:1 은 1200×1200, 16:9 는 1280×720, 3컷은 1200×620)
원칙:  캐릭터는 최종 시안 그대로, 스티커는 앱 스티커 그대로, 사진 자리는 일러스트 대체물(실제 서비스 화면 · 사진으로 교체 전제).
       글은 템플릿마다 큰 글 한 줄 + 보조 한 줄까지. 모바일 타임라인에서 폭 350px 안팎으로 줄어도 읽혀야 한다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from 목업_도형 import (CREAM, FONT, HAND, INK, LILAC, MUTED, NAVY, SOFT, WHITE, art, dotted_paper, photo_placeholder, polaroid, render,  # noqa: E402
                       sticker, svg_doc, tape, text)

OUT = Path(__file__).resolve().parent.parent / "목업"


def htext(x, y, s, size=64, fill=NAVY, anchor="start", rot=0):
    """손글씨(푸어스토리) 글."""
    t = f' transform="rotate({rot} {x} {y})"' if rot else ""
    return f'<text x="{x}" y="{y}" font-family="{HAND}" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{t}>{s}</text>'


def card(x, y, w, h, fill=WHITE, rx=28, shadow=True):
    sh = f'<rect x="{x + 6}" y="{y + 10}" width="{w}" height="{h}" rx="{rx}" fill="#0B1957" opacity=".13"/>' if shadow else ""
    return f'{sh}<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>'


def lined(x, y, w, h, rows, gap=64, color="#D5DEF1", first=0):
    return "".join(f'<line x1="{x}" y1="{y + first + i * gap}" x2="{x + w}" y2="{y + first + i * gap}" stroke="{color}" stroke-width="3"/>' for i in range(rows))


def bubble(x, y, w, h, s, size=44, tail="left", fill=WHITE):
    """디오의 말풍선 — 먹선 · 한 문장 · 해요체."""
    tx = x + 60 if tail == "left" else x + w - 60
    tail_pts = f"{tx - 20},{y + h - 3} {tx + (-34 if tail == 'left' else 34)},{y + h + 44} {tx + 16},{y + h - 3}"
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2.4:.0f}" fill="{fill}" stroke="{INK}" stroke-width="6"/>'
            f'<polygon points="{tail_pts}" fill="{fill}" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
            f'<rect x="{tx - 17}" y="{y + h - 7}" width="31" height="11" fill="{fill}"/>'
            + text(x + w / 2, y + h / 2 + size * 0.34, s, size=size, weight=800, fill=NAVY, anchor="middle"))


# ───────────────────────── 1 오늘의 한 장 (1200×1200) ─────────────────────────
def img_today(caption="오늘의 한 장", kind="sky"):
    b = dotted_paper(1200, 1200, base=SOFT, dot="#B7C6E4", step=46, r=3)
    b += polaroid(110, 150, 700, 860, rot=-3, kind=kind)
    b += tape(340, 112, 270, 66, rot=-4, color="#FAD3DC", mark="#F59AB2", pattern="dots")
    b += sticker("heart", 680, 700, size=170, rot=12) + sticker("star", 230, 330, size=130, rot=-14)
    b += sticker("sparkle", 610, 300, size=100, rot=8) + sticker("flower_pink", 250, 820, size=130, rot=-6)
    b += art("dio_all", 800, 700, h=430, rot=4)
    b += htext(150, 1092, caption, size=92, rot=-3)
    return svg_doc(1200, 1200, b), 1200, 1200


# ───────────────────────── 2 오늘의 질문 (1200×1200) ─────────────────────────
def img_question(no="12", lines=("오늘 하루를", "사진 한 장으로", "말한다면?"), hint="답글에 사진 한 장 ↓", reply="저는 햇빛이요"):
    b = dotted_paper(1200, 1200, base=CREAM, dot="#F2DD9A", step=46, r=3)
    b += card(120, 150, 960, 800, rx=34)
    b += lined(150, 150, 900, 800, 12, gap=62, first=120)
    b += f'<line x1="250" y1="150" x2="250" y2="950" stroke="#F4B6C2" stroke-width="4"/>'
    b += tape(150, 112, 340, 70, rot=-4, color="#DCEBFA", mark="#6E92C6", pattern="stripes")
    b += text(176, 160, f"오늘의 질문 #{no}", size=34, weight=900, fill=NAVY, extra='transform="rotate(-4 176 160)"')
    for i, s in enumerate(lines):
        b += text(300, 330 + i * 130, s, size=100, weight=900, fill=NAVY)
    b += htext(300, 790, hint, size=64, fill="#5A74B8")
    b += art("dio_all", 760, 780, h=400)
    b += bubble(430, 1000, 380, 96, reply, size=40, tail="right")
    return svg_doc(1200, 1200, b), 1200, 1200


# ───────────────────────── 3 꾸미기 4단계 (1200×1200) ─────────────────────────
def img_recipe(title="사진 한 장 꾸미기 4단계", last="오늘 좋았던 것"):
    b = dotted_paper(1200, 1200, base=SOFT, dot="#B7C6E4", step=46, r=3)
    b += text(560, 120, title, size=68, weight=900, fill=NAVY, anchor="middle")
    b += art("dio_all", 1030, 36, h=130)
    cells = [(60, 190, "1  사진 고르기", []),
             (610, 190, "2  테이프 붙이기", ["tape"]),
             (60, 690, "3  스티커 얹기", ["tape", "stk"]),
             (610, 690, "4  한 줄 쓰기", ["tape", "stk", "txt"])]
    for (x, y, label, ops) in cells:
        b += card(x, y, 530, 470, rx=26)
        b += text(x + 26, y + 58, label, size=36, weight=900, fill=NAVY)
        px, py, pw, ph = x + 120, y + 88, 290, 360
        b += polaroid(px, py, pw, ph, rot=-2, kind="dusk" if label.startswith("4") else "sky", caption=last if "txt" in ops else None, cap_size=34)
        if "tape" in ops:
            b += tape(px + 80, py - 18, 130, 40, rot=-5, color="#FFF1C2", mark="#EFC04F", pattern="stripes")
        if "stk" in ops:
            b += sticker("heart", px + 232, py + 196, size=84, rot=12) + sticker("star", px + 44, py + 86, size=70, rot=-12)
        if "txt" in ops:
            b += sticker("flower_pink", px + 250, py + 40, size=70, rot=8)
    return svg_doc(1200, 1200, b), 1200, 1200


# ───────────────────────── 4 스티커 팩 (1200×1200) ─────────────────────────
def img_stickers(title="새 스티커 팩", sub="하루의 모양 12종"):
    b = dotted_paper(1200, 1200, base=SOFT, dot="#B7C6E4", step=46, r=3)
    b += card(90, 210, 1020, 840, fill=MUTED, rx=40)   # 연한 판 위에 놓아야 스티커의 흰 테두리가 보인다
    kinds = ["heart", "star", "sparkle", "flower_pink", "moon", "wave", "rainbow", "popper", "bow", "bouquet", "check", "photo"]
    for i, k in enumerate(kinds):
        cx, cy = 90 + 255 * (i % 4 + 0.5), 210 + 280 * (i // 4 + 0.5)
        b += sticker(k, cx, cy, size=150, rot=(-8, 6, -4, 10)[i % 4])
    b += tape(110, 168, 400, 78, rot=-4, color="#FAD3DC", mark="#F59AB2", pattern="dots")
    b += text(150, 224, title, size=46, weight=900, fill=NAVY, extra='transform="rotate(-4 150 224)"')
    b += text(600, 1130, sub, size=54, weight=900, fill=NAVY, anchor="middle")
    return svg_doc(1200, 1200, b), 1200, 1200


# ───────────────────────── 5 D-day (1280×720) ─────────────────────────
def img_dday(top="수능까지", big="D-30", sub="오늘도 한 장, 천천히"):
    b = dotted_paper(1280, 720, base=SOFT, dot="#B7C6E4", step=40, r=2.6)
    b += text(110, 170, top, size=56, weight=800, fill="#3B4A82")
    b += f'<text x="100" y="440" font-family="{FONT}" font-size="270" font-weight="900" fill="{NAVY}">{big}</text>'
    b += f'<rect x="110" y="500" width="640" height="14" rx="7" fill="#FFFFFF" opacity=".8"/>'
    b += text(110, 600, sub, size=48, weight=800, fill=NAVY)
    b += art("duri_all", 820, 150, h=520)
    b += sticker("star", 800, 180, size=110, rot=-10) + sticker("check", 1100, 150, size=96, rot=8) + sticker("sparkle_pink", 770, 560, size=70)
    b += tape(-20, 40, 330, 56, rot=-6, color="#FFF1C2", mark="#EFC04F", pattern="stripes")
    return svg_doc(1280, 720, b), 1280, 720


# ───────────────────────── 6 업데이트 노트 (1280×720) ─────────────────────────
def img_notice(title="업데이트 노트", ver="v0.3", items=("사진 위에 스티커 · 테이프 · 글", "펜 · 형광펜 · 지우개", "PNG · PDF로 저장")):
    b = dotted_paper(1280, 720, base=CREAM, dot="#F2DD9A", step=40, r=2.6)
    b += card(80, 80, 800, 560, rx=30)
    b += lined(110, 80, 740, 560, 5, gap=96, first=216)
    b += tape(110, 52, 300, 62, rot=-3, color="#DCEBFA", mark="#6E92C6", pattern="stripes")
    b += text(130, 160, f"{title} {ver}", size=58, weight=900, fill=NAVY)
    for i, s in enumerate(items):
        b += sticker("check", 150, 258 + i * 96, size=64) + text(210, 276 + i * 96, s, size=42, weight=800, fill=NAVY)
    b += art("dio_all", 930, 250, h=420)
    b += sticker("sparkle", 920, 190, size=76, rot=-8) + sticker("heart", 1150, 300, size=84, rot=10)
    return svg_doc(1280, 720, b), 1280, 720


# ───────────────────────── 7 릴레이 낙서 (1200×1200) ─────────────────────────
def img_relay(prompt="한 줄 더 ↗"):
    b = dotted_paper(1200, 1200, base=SOFT, dot="#B7C6E4", step=46, r=3)
    b += polaroid(170, 130, 860, 940, rot=2, kind="dusk")
    b += tape(470, 98, 280, 66, rot=3, color="#E3F4EC", mark="#8FD3B6", pattern="check")
    b += f'<rect x="560" y="640" width="400" height="230" rx="36" fill="#FFFFFF" opacity=".9" stroke="#6E92C6" stroke-width="6" stroke-dasharray="16 14" transform="rotate(2 760 755)"/>'
    b += htext(760, 775, prompt, size=84, fill="#5A74B8", anchor="middle", rot=2)
    b += sticker("heart", 310, 300, size=120, rot=-10) + sticker("star", 840, 300, size=104, rot=12) + sticker("sparkle", 330, 760, size=90)
    b += art("duri_head", 24, 960, h=250, rot=-6)
    return svg_doc(1200, 1200, b), 1200, 1200


# ───────────────────────── 8 디오의 하루 3컷 (1200×620) ─────────────────────────
def img_comic3(lines=("시작해 볼까요?", "", "고마워요")):
    W, H = 1200, 620
    b = f'<rect width="{W}" height="{H}" fill="#EEF2F9"/>'
    for i in range(3):
        x = 30 + i * 390
        b += f'<rect x="{x}" y="30" width="360" height="560" rx="24" fill="#FFFFFF" stroke="{INK}" stroke-width="6"/>'
    # 1컷 — 아침, 빈 표지
    b += f'<rect x="36" y="36" width="348" height="140" rx="20" fill="#DCEBFA"/>'
    b += art("dio_all", 108, 190, h=330) + bubble(46, 44, 328, 92, lines[0], size=34)
    # 2컷 — 두리가 사진을 들고 옴 (두리는 말이 없다)
    b += f'<rect x="426" y="36" width="348" height="140" rx="20" fill="#FFF1C2"/>' + sticker("photo", 600, 104, size=84, rot=-8) + sticker("sparkle", 700, 80, size=50)
    b += art("duri_all", 440, 170, h=330) + polaroid(600, 270, 150, 190, rot=8, kind="sky") + art("dio_all", 650, 330, h=190)
    # 3컷 — 스티커가 붙고 행복
    b += f'<rect x="816" y="36" width="348" height="140" rx="20" fill="#FAD3DC"/>'
    b += art("dio_all", 890, 190, h=330)
    b += sticker("heart", 1098, 252, size=80, rot=12) + sticker("star", 912, 246, size=66, rot=-12) + sticker("sparkle_pink", 1104, 430, size=56)
    b += bubble(836, 44, 308, 92, lines[2], size=38)
    b += text(210, 575, "아침", size=26, weight=800, fill="#3B4A82", anchor="middle") + text(600, 575, "낮", size=26, weight=800, fill="#3B4A82", anchor="middle") + text(990, 575, "저녁", size=26, weight=800, fill="#3B4A82", anchor="middle")
    return svg_doc(W, H, b), W, H


# ───────────────────────── 9 결산 9칸 (1200×1200) ─────────────────────────
def img_recap(title="2026 한 장 결산"):
    b = dotted_paper(1200, 1200, base=CREAM, dot="#F2DD9A", step=46, r=3)
    b += htext(600, 150, title, size=120, anchor="middle", rot=-2)
    kinds = ["sky", "dusk", "cafe", "snow", "mint", "sky", "cafe", "dusk", "snow"]
    stk = ["heart", "star", "flower_pink", "sparkle", "check", "moon", "heart", "bow", "star"]
    for i in range(9):
        x, y = 70 + (i % 3) * 360, 215 + (i // 3) * 325
        b += polaroid(x, y, 260, 280, rot=(-4, 3, -2, 4, -3, 2, -3, 4, -4)[i], kind=kinds[i], pad=16, bottom=48)
        b += sticker(stk[i], x + 214, y + 206, size=70, rot=(10, -8, 12, -10, 8, -12, 10, -8, 12)[i])
    return svg_doc(1200, 1200, b), 1200, 1200


# ───────────────────────── 10 DIO 설명 3단계 (1280×720) ─────────────────────────
def img_explain(title="하루 한 장, 같이 꾸며요"):
    W, H = 1280, 720
    b = dotted_paper(W, H, base=SOFT, dot="#B7C6E4", step=40, r=2.6)
    b += text(W / 2, 110, title, size=64, weight=900, fill=NAVY, anchor="middle")
    steps = [("1", "사진 한 장 올려요"), ("2", "친구를 초대해요"), ("3", "같이 꾸며요")]
    for i, (n, label) in enumerate(steps):
        x = 70 + i * 410
        b += card(x, 170, 370, 440, rx=30)
        b += f'<circle cx="{x + 56}" cy="226" r="30" fill="{NAVY}"/>' + text(x + 56, 238, n, size=34, weight=900, fill=WHITE, anchor="middle")
        b += text(x + 104, 238, label, size=36, weight=900, fill=NAVY)
        if i == 0:
            b += polaroid(x + 70, 280, 230, 290, rot=-3, kind="sky")
        elif i == 1:
            b += art("duri_body", x + 196, 300, h=270) + art("dio_all", x + 20, 300, h=270)
        else:
            b += polaroid(x + 70, 280, 230, 290, rot=2, kind="dusk", caption="같이 가자", cap_size=30) + sticker("heart", x + 262, 440, size=84, rot=12) + sticker("star", x + 90, 340, size=70, rot=-12)
        if i < 2:
            b += text(x + 392, 400, "›", size=90, weight=900, fill="#3B4A82", anchor="middle")
    return svg_doc(W, H, b), W, H


ALL = [("01 오늘의한장", img_today), ("02 오늘의질문", img_question), ("03 꾸미기4단계", img_recipe), ("04 스티커팩", img_stickers), ("05 디데이", img_dday),
       ("06 업데이트노트", img_notice), ("07 릴레이낙서", img_relay), ("08 디오의하루3컷", img_comic3), ("09 결산9칸", img_recap), ("10 설명3단계", img_explain)]


if __name__ == "__main__":
    only = sys.argv[1:]
    OUT.mkdir(exist_ok=True)
    for name, fn in ALL:
        if only and not any(o in name for o in only):
            continue
        svg, w, h = fn()
        render(svg, OUT / f"게시물 {name}.jpg", w, h, scale=1, quality=88)
        print("ok", name)
