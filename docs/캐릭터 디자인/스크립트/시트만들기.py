# -*- coding: utf-8 -*-
"""컨셉 시트 생성 — 시안/벡터원본/*.svg (→ 렌더.py 로 jpg)
실행: python 시트만들기.py  (이 폴더 또는 어디서나)
시트: 모아-1~6 · 디오-1~5 · 둘이-1~4(함께 · 비율 · 그림체 · 활용) · 아이콘-1~3.
고르기: python 시트만들기.py 모아   (파일 이름 접두어, 아이콘이면 아이콘 단품 5종도 함께)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from 캐릭터_도형 import *  # noqa: F401,F403

OUT = Path(__file__).resolve().parent.parent / "시안" / "벡터원본"
ICON_OUT = Path(__file__).resolve().parent.parent / "아이콘" / "벡터원본"
W, H = 1600, 1000
MUTED_T = "rgba(11,25,87,0.68)"
LINE = "rgba(11,25,87,0.16)"


def save(name, body, w=W, h=H, bg=WHITE, icon=False):
    (ICON_OUT if icon else OUT).mkdir(parents=True, exist_ok=True)
    p = (ICON_OUT if icon else OUT) / f"{name}.svg"
    p.write_text(svg_doc(w, h, body, bg), encoding="utf-8")
    print("wrote", p.name)


def legend(x, y, items, w=520, size=12.5, gap=34):
    s = ""
    for i, (t, d) in enumerate(items):
        yy = y + i * gap
        s += badge(x + 11, yy - 5, i + 1)
        s += text(x + 32, yy, t, size=size, weight=800)
        s += text(x + 32, yy + 15, d, size=size - 1.5, weight=600, fill=MUTED_T)
    return s


def para(x, y, lines, size=12.5, lh=19, fill=NAVY, weight=600):
    return "".join(text(x, y + i * lh, ln, size=size, weight=weight, fill=fill) for i, ln in enumerate(lines))


def ground(x1, x2, y):
    return f'<path d="M{x1},{y} L{x2},{y}" stroke="{LINE}" stroke-width="2" stroke-dasharray="6 6"/>'


def ruler(x, y1, y2, label_txt, side=1):
    s = f'<path d="M{x},{y1} L{x},{y2}" stroke="{PRIMARY}" stroke-width="1.6"/>'
    s += f'<path d="M{x - 6},{y1} L{x + 6},{y1} M{x - 6},{y2} L{x + 6},{y2}" stroke="{PRIMARY}" stroke-width="1.6"/>'
    s += text(x + 10 * side, (y1 + y2) / 2 + 4, label_txt, size=11.5, weight=800, fill=PRIMARY, anchor="start" if side > 0 else "end")
    return s


def hruler(x1, x2, y, label_txt):
    s = f'<path d="M{x1},{y} L{x2},{y}" stroke="{PRIMARY}" stroke-width="1.6"/>'
    s += f'<path d="M{x1},{y - 6} L{x1},{y + 6} M{x2},{y - 6} L{x2},{y + 6}" stroke="{PRIMARY}" stroke-width="1.6"/>'
    s += text((x1 + x2) / 2, y + 16, label_txt, size=11.5, weight=800, fill=PRIMARY, anchor="middle")
    return s


# ═══════════════════════════════ A. 모아 ═══════════════════════════════

def a1_anatomy():
    b = title_bar(W, "A-1 · 모아(다이어리 친구) 해부도 — 부위별 규칙", "상자 100 × 122 단위 기준 · 먹선 #242424")
    # 큰 모아 (h=760) at x=120,y=110 → k=6.23
    X, Y, h = 150, 120, 760
    k = h / 122
    b += moa(X, Y, h, "default", stickers=[("heart", "tl", 1.0), ("star", "br", 0.9)])
    P = lambda lx, ly: (X + lx * k, Y + ly * k)
    pts = [P(78, 18), P(88, 60), P(36, 46), P(47, 56), P(4, 44), P(30, 110), P(27, 27), P(10, 80), P(60, 56)]
    tgt = [(X + 700, 180), (X + 700, 420), (X - 70, 330), (X - 70, 470), (X - 70, 620), (X - 70, 800), (X - 70, 180), (X - 70, 720), (X + 700, 560)]
    for i, ((px, py), (tx, ty)) in enumerate(zip(pts, tgt)):
        b += callout(px, py, tx, ty, i + 1)
    b += legend(900, 110, [
        ("표지 (몸)", "세로 90 : 가로 74 (≈ 5:4). 모서리 반지름 = 너비의 13.5%. 단색 한 면, 그라데이션 · 그림자 없음"),
        ("속지 묶음", "표지 뒤 오른쪽 아래로 (6, 4) 어긋난 흰 블록(#FFFCF6). '책'임을 말하는 유일한 장치"),
        ("눈", "세로 타원 rx 2.9 · ry 3.4 (= 너비의 4%). 간격 22 (너비의 30%), 높이 46 (상자 높이의 38%)"),
        ("입", "폭 12 의 작은 곡선. 입은 늘 작게 — 감정은 스티커가 말한다"),
        ("팔", "굵기 9 + 먹선. 둥근 끝이 그대로 손(벙어리장갑). 손가락 · 관절 없음"),
        ("다리 · 발", "굵기 9, 길이 11, 발은 바깥으로 꺾은 'ㄴ'. 둘 사이 26"),
        ("스티커 자리", "표지 네 모서리(TL · TR · BL · BR) + 양 옆(ML · MR) + 가운데 아래(C). 얼굴 둘레 반지름 16 은 비워 둔다"),
        ("먹선", "#242424 (로고 D 와 같은 색). 굵기 = 상자 높이의 3.3% (4px @122). 끝 · 이음 모두 둥글게"),
        ("볼", "로즈 #F0B0AA 타원. 부끄럼 · 고마움 · 신남 때만 나타난다"),
    ], gap=58)
    b += f'<rect x="900" y="660" width="640" height="300" rx="16" fill="{MUTED}"/>'
    b += text(924, 690, "치수 (상자 100 × 122 기준)", size=14, weight=900)
    rows = [("표지", "x 10 · y 10 · w 74 · h 90 · r 10"), ("속지 묶음", "x 16 · y 14 · w 74 · h 90 · r 10"), ("눈", "(36, 46) · (58, 46)  rx 2.9  ry 3.4"),
            ("입", "M41,55 Q47,60 53,55"), ("팔 시작점", "(12, 56) · (82, 56~60)"), ("다리", "(34, 100) · (60, 100) ↓ 11, 발 8"),
            ("스티커 지름", "14~16 (표지 너비의 20%)"), ("선 굵기", "4 / 122 = 3.3%  (팔다리 안쪽 띠 9)")]
    for i, (a, c) in enumerate(rows):
        yy = 718 + i * 29
        b += text(924, yy, a, size=12, weight=800) + text(1050, yy, c, size=12, weight=600, fill=MUTED_T, family="Consolas,'Malgun Gothic',monospace")
    return b


def a2_turnaround():
    b = title_bar(W, "A-2 · 모아 턴어라운드 — 정면 · 3/4 · 옆 · 뒤", "같은 높이 · 같은 선 굵기 · 바닥선 공유")
    h = 560
    y = 200
    b += ground(60, W - 60, y + h * 116 / 122 + 6)
    views = [("front", "정면", "기본형. 얼굴 · 스티커 모두 보인다"), ("three", "3/4", "속지 묶음이 더 보이고 표지 왼쪽에 책등 선"),
             ("side", "옆", "표지 · 속지 · 뒤표지 세 겹. 얼굴 없음, 팔 하나"), ("back", "뒤", "뒤표지에 책등 그늘 + 작은 라벨(이름표 자리)")]
    for i, (v, t, d) in enumerate(views):
        x = 90 + i * 380
        b += moa(x, y, h, "default", view=v, pose="blank")
        b += text(x + 230, y + h + 50, t, size=16, weight=900, anchor="middle")
        b += text(x + 230, y + h + 72, d, size=11.5, weight=600, fill=MUTED_T, anchor="middle")
    b += ruler(70, y + 10 * h / 122, y + 116 * h / 122, "116", side=-1)
    b += text(W - 30, 84, "옆 · 뒤에서도 '노란 책 + 흰 속지' 가 보여야 모아다. 얼굴이 안 보여도 알아보는 것이 목표.", size=12.5, weight=600, fill=MUTED_T, anchor="end")
    return b


MOODS = [("default", "기본", "손 흔들기 · 스티커 없음", "아직 아무도 안 붙였을 때"),
         ("celebrate", "신남", "무지개 · 별 · 폭죽 · 색종이 · 반짝", "친구들이 많이 붙인 날"),
         ("happy", "행복", "하트 · 꽃 · 반짝 · 달 · 물결", "좋은 하루"),
         ("sad", "슬픔", "바람 빠진 풍선 · 깨진 별 · 시든 꽃", "힘든 하루"),
         ("tired", "지침", "방전 배터리 · 한숨 구름 · 졸린 별", "피곤한 하루"),
         ("shy", "부끄럼", "꽃 · 작은 하트 · 볼 홍조", "칭찬받았을 때"),
         ("anxious", "불안", "낙서 뭉치 · 땀방울 · 먹구름", "걱정되는 일"),
         ("grateful", "고마움", "리본 · 하트 · 꽃다발", "선물 · 답장을 받았을 때")]


def a3_emotions():
    b = title_bar(W, "A-3 · 모아 감정 8종 — 얼굴은 조금, 스티커가 말한다", "원본 시안 8장을 통일 그림체로 다시 그림")
    for i, (m, name, st, when) in enumerate(MOODS):
        r, c = divmod(i, 4)
        x, y = 50 + c * 385, 80 + r * 460
        b += f'<rect x="{x}" y="{y}" width="360" height="430" rx="18" fill="{SOFT if m != "default" else MUTED}"/>'
        b += moa(x + 80, y + 40, 300, m)
        b += text(x + 20, y + 370, name, size=17, weight=900)
        b += text(x + 20, y + 392, "스티커: " + st, size=11.5, weight=600, fill=MUTED_T)
        b += text(x + 20, y + 410, "언제: " + when, size=11.5, weight=600, fill=MUTED_T)
    return b


def a4_poses():
    b = title_bar(W, "A-4 · 모아 포즈 — 앱 안에서 쓰는 자세", "눈 · 입 · 팔 · 다리 조합")
    poses = [("walk", "걷기", "로딩 · 페이지 넘김", {}), ("wave", "손 흔들기", "홈 빈 화면 · 인사", {}), ("pen", "펜 들기", "편집 시작 · 튜토리얼", {}),
             ("hold", "사진 들기", "오늘의 사진 올리기", {"stickers": [("photo", (47, 76), 1.9)]}),
             ("sleep", "자기", "밤 · 알림 없음", {"stickers": [("zzz", (84, 20), 1.2)]}),
             ("surprised", "깜짝", "새 알림 · 친구 참여", {}), ("wink", "윙크", "저장 완료 · 내보내기 완료", {}),
             ("tired", "축 처짐", "오류 · 실패", {"stickers": [("sigh", "tr", 0.9)]})]
    for i, (p, name, use, kw) in enumerate(poses):
        r, c = divmod(i, 4)
        x, y = 50 + c * 385, 80 + r * 460
        b += f'<rect x="{x}" y="{y}" width="360" height="430" rx="18" fill="{MUTED}"/>'
        b += moa(x + 80, y + 40, 300, p, **kw)
        b += text(x + 20, y + 380, name, size=17, weight=900)
        b += text(x + 20, y + 404, "쓰는 곳: " + use, size=11.5, weight=600, fill=MUTED_T)
    return b


def a5_colors():
    b = title_bar(W, "A-5 · 모아 색 제안 4안 — 앱 배경(#CED9EE) 위에서 본다", "추천: 2안 머스터드 (표지 팔레트에 이미 있는 색)")
    opts = [("1안 · 원본 노랑", SOURCE_YELLOW, PAPER, "#F8D860 (시안 그대로)", "가장 밝고 잘 띈다. 단, 가이드 팔레트 밖의 새 색이라 토큰 추가 필요. 형광펜 #FFE066 과 가까워 캔버스 위에서 섞일 수 있다"),
            ("2안 · 머스터드 ★", MUSTARD, PAPER, "#EBC56F (표지 팔레트)", "표지 색 8종 중 하나라 새 토큰 없이 쓴다. 앱의 차분한 파랑과 보색이면서 한 톤 가라앉아 '조용한 화면' 원칙에 맞는다"),
            ("3안 · 크림 + 하늘", CREAM, ACCENT, "#EAE3D4 + 속지 #9FB6D9", "로고 색 체계 안에 들어온다. 대신 노랑의 '즐거움' 이 줄고 디오와 구분이 약해진다"),
            ("4안 · 페리윙클", PERI, PAPER, "#9DABD8 (기본 표지 색)", "앱의 기본 다이어리 색과 같아 '그 다이어리' 가 맞다. 그러나 배경 · 디오와 모두 파랑이라 가라앉는다")]
    for i, (name, col, pg, hexs, note) in enumerate(opts):
        x = 50 + i * 385
        b += f'<rect x="{x}" y="80" width="360" height="400" rx="18" fill="{SOFT}"/>'
        b += moa(x + 70, 100, 290, "happy", color=col, page=pg)
        b += f'<rect x="{x}" y="490" width="360" height="430" rx="18" fill="{WHITE}" stroke="{LINE}"/>'
        b += moa(x + 110, 500, 180, "default", color=col, page=pg)
        b += text(x + 20, 720, name, size=17, weight=900)
        b += text(x + 20, 742, hexs, size=12, weight=700, fill=MUTED_T, family="Consolas,'Malgun Gothic',monospace")
        # note wrap (rough)
        words, lines, cur = note.split(" "), [], ""
        for w_ in words:
            if len(cur + " " + w_) > 26:
                lines.append(cur); cur = w_
            else:
                cur = (cur + " " + w_).strip()
        lines.append(cur)
        b += para(x + 20, 770, lines[:7], size=11.5, lh=18, fill=NAVY, weight=600)
        b += f'<rect x="{x + 300}" y="700" width="40" height="40" rx="8" fill="{col}" stroke="{LINE}"/><rect x="{x + 300}" y="748" width="40" height="18" rx="4" fill="{pg}" stroke="{LINE}"/>'
    b += text(30, 960, "화면 위(파란 배경) 와 흰 카드 위 두 곳에서 같이 본다. 어느 안이든 먹선 · 속지 · 스티커 규칙은 같다.", size=12.5, weight=600, fill=MUTED_T)
    return b


STICKER_SET = [("star", "별"), ("star_orange", "주황 별"), ("sparkle", "반짝"), ("sparkle_pink", "분홍 반짝"), ("heart", "하트"), ("heart_orange", "주황 하트"), ("heart_pink", "분홍 하트"),
               ("flower", "꽃"), ("flower_pink", "분홍 꽃"), ("moon", "달"), ("wave", "물결"), ("rainbow", "무지개"), ("confetti", "색종이"), ("popper", "폭죽"),
               ("balloon_sad", "바람 빠진 풍선"), ("star_broken", "깨진 별"), ("flower_wilted", "시든 꽃"), ("battery_low", "방전"), ("sigh", "한숨"), ("star_sleepy", "졸린 별"), ("blush", "홍조"),
               ("scribble", "낙서 뭉치"), ("storm", "먹구름"), ("drops", "땀방울"), ("bow", "리본"), ("bouquet", "꽃다발"), ("photo", "오늘의 사진"), ("tape", "마테 조각"),
               ("dot", "도트"), ("check", "체크"), ("zzz", "zzz"), ("exclaim", "느낌표"), ("question", "물음표")]


def a6_stickers():
    b = title_bar(W, "A-6 · 감정 스티커 세트 33종 — 모아 표지용 = 앱 스티커 에셋", "흰 테두리 die-cut · 먹선 없음 · 꾸미기 팔레트 색만 사용")
    for i, (k_, name) in enumerate(STICKER_SET):
        r, c = divmod(i, 9)
        x, y = 110 + c * 165, 150 + r * 215
        b += f'<rect x="{x - 60}" y="{y - 60}" width="130" height="150" rx="14" fill="{MUTED}"/>'
        b += sticker(k_, x + 5, y + 5, 2.6)
        b += text(x + 5, y + 76, name, size=11.5, weight=800, anchor="middle")
        b += text(x + 5, y + 72 + 14, k_, size=9.5, weight=600, fill=MUTED_T, anchor="middle", family="Consolas,monospace")
    b += para(60, 955, ["규칙: ① 흰 테두리 3.2 (die-cut)  ② 안쪽은 단색 1~2개 + 흰 하이라이트 하나  ③ 먹선 금지 — 몸(먹선) 과 구별되는 '붙인 것'  ④ 지름 20 기준, 모아 표지 위에서는 0.72 배  ⑤ 색은 펜 · 형광펜 · 테이프 팔레트(디자인 가이드 2.4) 에서만"], size=12, fill=MUTED_T)
    return b


# ═══════════════════════════════ B. 디오 ═══════════════════════════════

def b1_anatomy():
    b = title_bar(W, "B-1 · 디오(목도리 친구) 해부도 — 부위별 규칙", "상자 100 × 150 단위 기준 · 브랜드 색")
    X, Y, h = 180, 90, 840
    k = h / 150
    b += dio(X, Y, h, "default")
    P = lambda lx, ly: (X + lx * k, Y + ly * k)
    pts = [P(50, 16), P(40, 44), P(50, 60), P(14, 100), P(70, 115), P(50, 94), P(36, 142), P(50, 70), P(74, 125)]
    tgt = [(X - 90, 140), (X - 90, 300), (X - 90, 430), (X - 90, 640), (X + 720, 760), (X + 720, 620), (X - 90, 860), (X + 720, 480), (X + 720, 880)]
    for i, ((px, py), (tx, ty)) in enumerate(zip(pts, tgt)):
        b += callout(px, py, tx, ty, i + 1)
    b += legend(940, 110, [
        ("머리", "돔. 너비 72 : 높이 54. 위는 둥글고 아래는 목도리 속으로. 흰색(#FFFFFF) — 종이와 같은 색"),
        ("눈", "세로 타원 rx 2.6 · ry 3.6, 간격 19, 높이 44. 모아보다 조금 길쭉해 '조용한' 인상"),
        ("입", "없다. 목도리 속. 감정은 눈 · 눈썹 · 목도리 높이 · 볼로만 말한다"),
        ("목도리 꼬리", "왼쪽으로 늘어진다(기본). 바람(fly) · 뒤로(back) 변형. 꼬리 끝은 둥글게"),
        ("코트", "사다리꼴 38 → 56. 색 primary #6E92C6. 팔은 평소 코트 속 (포즈 때만 나온다)"),
        ("단추", "지름 6.4 흰 원 둘, 세로 16 간격. 디오를 알아보게 하는 두 점"),
        ("다리 · 발", "모아와 같은 'ㄴ' 발. 굵기 7(모아 9 보다 가늘게 — 키 차이 보정)"),
        ("목도리 띠", "accent #9FB6D9 + 빗금 surfaceSoft #CED9EE, 굵기 2.6 · 간격 8.5 · -55°. 로고 테마 원 색"),
        ("먹선", "#242424, 모아와 같은 절대 굵기. 둘이 함께 설 때 선이 같아야 한 세계로 보인다"),
    ], gap=62)
    return b


def b2_turnaround():
    b = title_bar(W, "B-2 · 디오 턴어라운드 — 정면 · 3/4 · 옆 · 뒤", "같은 높이 · 같은 선 굵기 · 바닥선 공유")
    h, y = 640, 150
    b += ground(60, W - 60, y + h * 146 / 150 + 6)
    views = [("front", "정면", "down"), ("three", "3/4", "down"), ("side", "옆", "down"), ("back", "뒤", "back")]
    for i, (v, t, tail) in enumerate(views):
        x = 90 + i * 380
        b += dio(x, y, h, "default", view=v, tail=tail)
        b += text(x + 215, y + h + 60, t, size=16, weight=900, anchor="middle")
    b += ruler(70, y + 12 * h / 150, y + 146 * h / 150, "134", side=-1)
    b += text(W - 30, 84, "뒤에서는 목도리 꼬리가 등 뒤로 넘어간다. 옆에서는 눈 하나 · 단추 없음.", size=12.5, weight=600, fill=MUTED_T, anchor="end")
    return b


DIO_MOODS = [("default", "기본", {}), ("happy", "기쁨", {"tail": "fly"}), ("sleepy", "졸림", {}), ("surprised", "깜짝", {"tail": "fly"}),
              ("shy", "부끄럼", {"scarf_up": True}), ("sad", "슬픔", {}), ("look", "곁눈질", {}), ("wink", "윙크", {})]


def b3_emotions():
    b = title_bar(W, "B-3 · 디오 감정 8종 — 눈과 목도리로만", "입이 없어서 보는 사람이 감정을 얹는다 (헬로키티 · 라이언 방식)")
    notes = {"default": "말없이 지켜본다", "happy": "목도리가 바람에 날린다", "sleepy": "밤 · 알림 없음", "surprised": "새 다이어리 · 친구 참여",
             "shy": "목도리 속으로 쏙 (눈만)", "sad": "친구가 나갔을 때", "look": "모아 쪽을 본다", "wink": "공유 완료"}
    for i, (m, name, kw) in enumerate(DIO_MOODS):
        r, c = divmod(i, 4)
        x, y = 50 + c * 385, 80 + r * 460
        b += f'<rect x="{x}" y="{y}" width="360" height="430" rx="18" fill="{SOFT if m != "default" else MUTED}"/>'
        b += dio(x + 70, y + 20, 340, m, **kw)
        b += text(x + 20, y + 385, name, size=17, weight=900)
        b += text(x + 20, y + 408, notes[m], size=11.5, weight=600, fill=MUTED_T)
    return b


def b4_colors():
    b = title_bar(W, "B-4 · 디오 색 제안 4안 — 브랜드 색 안에서", "추천: 1안 (코트 primary · 목도리 accent = 로고 색 그대로)")
    opts = [("1안 · 로고 색 ★", WHITE, PRIMARY, ACCENT, SOFT, "코트 #6E92C6 · 목도리 #9FB6D9 / #CED9EE", "로고(먹 + 하늘) 와 같은 체계. 버튼 색 코트, 테마 원 색 목도리. 모아(노랑) 와 보색이라 둘이 서면 선명"),
            ("2안 · 목도리가 주인공", WHITE, SOFT, PRIMARY, WHITE, "코트 #CED9EE · 목도리 #6E92C6 / 흰 빗금", "배경색 코트라 화면에 녹고 목도리만 튄다. 아이콘 · 작은 크기에서 유리. 단 흰 머리와 연한 코트가 붙어 윤곽이 약함"),
            ("3안 · 네이비 코트", WHITE, NAVY, ACCENT, SOFT, "코트 #0B1957 · 목도리 #9FB6D9", "글자색 네이비라 무게감. 밤 · 겨울 느낌. 모아 옆에서는 너무 어두워 '어른' 처럼 보일 수 있다"),
            ("4안 · 크림 코트", CREAM, CAMEL, PRIMARY, SOFT, "머리 #EAE3D4 · 코트 #D9A87F · 목도리 #6E92C6", "따뜻한 종이 느낌. 그러나 브랜드 파랑이 목도리에만 남아 디오가 DIO 의 친구로 안 읽힐 수 있다")]
    for i, (name, hd, ct, sc, stp, hexs, note) in enumerate(opts):
        x = 50 + i * 385
        b += f'<rect x="{x}" y="80" width="360" height="400" rx="18" fill="{SOFT}"/>'
        b += dio(x + 70, 92, 380, "happy", head=hd, coat=ct, scarf=sc, stripe=stp, tail="fly")
        b += f'<rect x="{x}" y="490" width="360" height="430" rx="18" fill="{WHITE}" stroke="{LINE}"/>'
        b += dio(x + 100, 500, 210, "default", head=hd, coat=ct, scarf=sc, stripe=stp)
        b += text(x + 20, 735, name, size=17, weight=900)
        b += text(x + 20, 756, hexs, size=11, weight=700, fill=MUTED_T, family="Consolas,'Malgun Gothic',monospace")
        words, lines, cur = note.split(" "), [], ""
        for w_ in words:
            if len(cur + " " + w_) > 26:
                lines.append(cur); cur = w_
            else:
                cur = (cur + " " + w_).strip()
        lines.append(cur)
        b += para(x + 20, 784, lines[:7], size=11.5, lh=18, weight=600)
        for j, c_ in enumerate([hd, ct, sc, stp]):
            b += f'<rect x="{x + 240 + j * 28}" y="716" width="24" height="24" rx="6" fill="{c_}" stroke="{LINE}"/>'
    return b


def b5_poses():
    b = title_bar(W, "B-5 · 디오 포즈 — 조용한 친구의 네 가지 움직임", "팔은 필요할 때만 코트 밖으로")
    poses = [("walk", "걷기", "페이지 넘김 · 이동", {}), ("wave", "손 흔들기", "친구 초대 · 알림", {}),
             ("happy", "양팔 들기", "공유 성공 · 축하", {"tail": "fly"}), ("shy", "목도리 올리기", "비공개 · 잠금", {"scarf_up": True})]
    for i, (p, name, use, kw) in enumerate(poses):
        x = 50 + i * 385
        b += f'<rect x="{x}" y="80" width="360" height="560" rx="18" fill="{MUTED}"/>'
        b += dio(x + 60, 90, 470, p, **kw)
        b += text(x + 20, 590, name, size=17, weight=900)
        b += text(x + 20, 614, "쓰는 곳: " + use, size=11.5, weight=600, fill=MUTED_T)
    b += f'<rect x="50" y="660" width="1500" height="300" rx="18" fill="{SOFT}"/>'
    b += text(80, 700, "안아 주기 — 디오의 대표 포즈 (원본 스케치 1)", size=15, weight=900)
    b += pair_scene(140, 700, 0.62)
    b += para(900, 760, ["디오 팔이 모아 어깨 위로 넘어간다. 팔은 코트 색, 굵기 8.", "모아는 디오 왼쪽, 발 높이를 맞춘다(바닥선 공유).", "디오 눈은 '곁눈질(look)' 로 모아를 본다. 모아는 '기본'.", "두 캐릭터의 먹선 굵기는 같다(절대 4px). 크기만 다르다."], size=12.5, lh=24, weight=600)
    return b


# ═══════════════════════════════ C. 둘 · 그림체 · 활용 ═══════════════════════════════

def pair_scene(x, y, k=1.0, moa_mood="default", dio_mood="look", moa_color=SOURCE_YELLOW):
    """디오(오른쪽, h 420) 가 모아(왼쪽, h 275) 어깨에 팔. 바닥 y+400 기준. 반환 svg (k 배)."""
    s = ""
    hD, hd = 420, 275
    dx, dy = 0, 400 - hd * 116 / 122
    Dx, Dy = 250, 400 - hD * 146 / 150
    s += ground(-40, 560, 402)
    s += dio(Dx, Dy, hD, dio_mood, pose="blank")
    s += moa(dx, dy, hd, moa_mood, color=moa_color, pose="default" if moa_mood == "default" else None)
    # 디오 왼팔 → 모아 어깨 (코트 왼쪽 y≈ Dy + 86*k)
    kD = hD / 150
    ax, ay = Dx + 31 * kD, Dy + 86 * kD
    ex, ey = dx + 30 * hd / 122, dy + 22 * hd / 122
    path = f"M{ax:.1f},{ay:.1f} C{ax - 30:.1f},{ay - 90:.1f} {ex + 40:.1f},{ey - 90:.1f} {ex:.1f},{ey:.1f}"
    s += limb(path, 8 * kD, PRIMARY, 4)
    return g(s, x, y, k)


def c1_pair():
    b = title_bar(W, "C-1 · 둘이 함께 — 원본 스케치 1 재구성", "디오가 모아 어깨에 팔을 두른다")
    b += f'<rect x="60" y="80" width="1480" height="860" rx="24" fill="{SOFT}"/>'
    b += pair_scene(430, 220, 1.5)
    b += text(100, 920, "디오(꾸미는 친구) 와 모아(꾸며지는 다이어리). 키 10 : 6.5. 같은 먹선, 같은 발.", size=13, weight=700, fill=MUTED_T)
    return b


def c2_lineup():
    b = title_bar(W, "C-2 · 라인업 · 비율 — 키 · 머리 · 손 · 선 굵기", "디오 150 : 모아 122 단위 → 실제 키 10 : 6.5")
    y0, floor = 120, 760
    hD = 640
    hd = hD * 6.5 / 10 * (122 / 116) * (146 / 150)
    hd = 640 * 0.65
    b += ground(60, 1100, floor)
    Dy = floor - hD * 146 / 150
    dy = floor - hd * 116 / 122
    b += dio(120, Dy, hD, "default")
    b += moa(560, dy, hd, "default", pose="blank")
    b += ruler(90, Dy + 12 * hD / 150, floor, "디오 10", side=-1)
    b += ruler(1010, dy + 10 * hd / 122, floor, "모아 6.5", side=1)
    # 머리 비율
    b += hruler(120 + 14 * hD / 150, 120 + 86 * hD / 150, Dy + 8 * hD / 150, "머리 너비 = 키의 48%")
    b += hruler(560 + 10 * hd / 122, 560 + 84 * hd / 122, dy + 4 * hd / 122, "표지 너비 = 키의 61%")
    b += f'<rect x="1120" y="110" width="430" height="820" rx="18" fill="{MUTED}"/>'
    b += text(1144, 142, "같게 두는 것", size=15, weight=900)
    b += para(1144, 172, ["먹선 색 · 굵기 (절대 4px @ 디오 150)", "눈: 세로 타원, 먹색, 흰자 없음", "발: 바깥으로 꺾은 'ㄴ'", "면: 단색, 그라데이션 · 질감 없음", "둥근 끝 · 둥근 이음", "볼: 로즈 #F0B0AA 타원"], size=12.5, lh=24, weight=600)
    b += text(1144, 352, "다르게 두는 것", size=15, weight=900)
    b += para(1144, 382, ["키 10 : 6.5 (모아는 디오 가슴 높이)", "모아 = 각진 사각 + 노랑, 디오 = 둥근 돔 + 파랑", "모아는 입이 있고 디오는 없다", "모아는 스티커, 디오는 목도리로 감정", "팔다리 굵기 9 : 7"], size=12.5, lh=24, weight=600)
    b += text(1144, 560, "작게 쓸 때 (24~48px)", size=15, weight=900)
    b += para(1144, 590, ["먹선을 6% 로 올리고 스티커는 1~2개만", "눈 · 입 · 단추 · 속지 묶음은 끝까지 남긴다", "팔은 생략해도 된다 (아이콘 규칙 i-2)"], size=12.5, lh=24, weight=600)
    # 작은 크기 예
    for i, hh in enumerate([120, 72, 48, 32]):
        x = 1144 + i * 100
        b += moa(x, 860 - hh, hh, "default", pose="blank", lw_abs=max(2.2, hh * 0.04), stickers=[("heart", "tl", 1.2)] if hh >= 48 else [])
        b += text(x + hh * 0.4, 885, f"{hh}px", size=10.5, weight=700, fill=MUTED_T, anchor="middle")
    b += text(80, 820, "둘이 나란히 설 때 모아를 왼쪽 · 앞에, 디오를 오른쪽 · 뒤에 둔다 (스케치 1 과 같다). 모아 혼자 쓸 때는 가운데.", size=12.5, weight=600, fill=MUTED_T)
    b += text(80, 846, "글자와 같이 쓸 때 캐릭터 높이 = 제목 글자 크기의 4배 (예: 홈 제목 29 → 모아 116).", size=12.5, weight=600, fill=MUTED_T)
    return b


def c3_style():
    b = title_bar(W, "C-3 · 그림체 규칙 — 누가 그려도 같게 (O / X)", "DIO 라인: 먹선 · 단색 · 점 눈 · 둥근 끝")
    rules = [
        ("선은 하나의 굵기", "굵기가 들쭉날쭉하거나 선이 없는 그림", lambda x, y: moa(x, y, 200, "default", pose="blank"), lambda x, y: moa(x, y, 200, "default", pose="blank", lw_abs=1.2, stickers=[]) + f'<path d="M{x + 20},{y + 20} Q{x + 100},{y + 4} {x + 165},{y + 22}" fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round"/>'),
        ("면은 단색", "그라데이션 · 그림자 · 질감", lambda x, y: moa(x, y, 200, "default", pose="blank"), lambda x, y: f'<defs><linearGradient id="gx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0A0"/><stop offset="1" stop-color="#D9A020"/></linearGradient></defs>' + moa(x, y, 200, "default", pose="blank", color="url(#gx)") + f'<ellipse cx="{x + 95}" cy="{y + 196}" rx="70" ry="10" fill="rgba(0,0,0,.25)"/>'),
        ("눈은 먹색 점", "흰자 · 눈동자 · 속눈썹", lambda x, y: moa(x, y, 200, "default", pose="blank"), lambda x, y: moa(x, y, 200, "blank", pose="blank") + f'<circle cx="{x + 59}" cy="{y + 75}" r="12" fill="#fff" stroke="{INK}" stroke-width="3"/><circle cx="{x + 61}" cy="{y + 77}" r="6" fill="{INK}"/><circle cx="{x + 95}" cy="{y + 75}" r="12" fill="#fff" stroke="{INK}" stroke-width="3"/><circle cx="{x + 97}" cy="{y + 77}" r="6" fill="{INK}"/><path d="M{x + 47},{y + 60} l-6,-6 M{x + 52},{y + 56} l-3,-8" stroke="{INK}" stroke-width="2.5"/><path d="M{x + 68},{y + 92} q9,8 18,0" fill="none" stroke="{INK}" stroke-width="3"/>'),
        ("입은 작게, 감정은 스티커로", "큰 입 · 이빨 · 혀", lambda x, y: moa(x, y, 200, "happy"), lambda x, y: moa(x, y, 200, "blank", pose="blank") + f'<ellipse cx="{x + 59}" cy="{y + 75}" rx="5" ry="6" fill="{INK}"/><ellipse cx="{x + 95}" cy="{y + 75}" rx="5" ry="6" fill="{INK}"/><path d="M{x + 45},{y + 92} Q{x + 77},{y + 150} {x + 110},{y + 92} Z" fill="{INK}"/><path d="M{x + 52},{y + 95} L{x + 103},{y + 95} L{x + 100},{y + 106} L{x + 55},{y + 106} Z" fill="#fff"/><path d="M{x + 62},{y + 128} Q{x + 77},{y + 112} {x + 92},{y + 128} Z" fill="{ST["red"]}"/>'),
        ("스티커는 흰 테두리, 먹선 없음", "먹선을 두른 스티커 (몸과 안 구별됨)", lambda x, y: moa(x, y, 200, "default", pose="blank", stickers=[("heart", "tl", 1.0), ("star", "br", 1.0)]), lambda x, y: moa(x, y, 200, "default", pose="blank") + f'<path d="{HEART}" transform="translate({x + 44},{y + 44}) scale(1.6)" fill="{ST["red"]}" stroke="{INK}" stroke-width="2.4"/><path d="{star_path(10)}" transform="translate({x + 110},{y + 136}) scale(1.6)" fill="{ST["yellow"]}" stroke="{INK}" stroke-width="2.4"/>'),
        ("손 · 발은 둥근 끝 그대로", "손가락 · 신발 · 관절", lambda x, y: moa(x, y, 200, "wave"), lambda x, y: moa(x, y, 200, "default", pose="blank") + f'<path d="M{x + 20},{y + 92} l-14,-26 M{x + 6},{y + 66} l-8,-6 M{x + 6},{y + 66} l2,-10 M{x + 6},{y + 66} l9,-6" stroke="{INK}" stroke-width="5" stroke-linecap="round"/><path d="M{x + 40},{y + 182} l-14,0 l0,12 l30,0 Z M{x + 112},{y + 182} l-14,0 l0,12 l30,0 Z" fill="{CHARCOAL}" stroke="{INK}" stroke-width="3"/>'),
    ]
    for i, (ok, no, fo, fx) in enumerate(rules):
        r, c = divmod(i, 3)
        x, y = 50 + c * 510, 80 + r * 450
        b += f'<rect x="{x}" y="{y}" width="480" height="420" rx="18" fill="{MUTED}"/>'
        b += f'<rect x="{x + 16}" y="{y + 16}" width="220" height="280" rx="14" fill="{WHITE}"/>'
        b += f'<rect x="{x + 244}" y="{y + 16}" width="220" height="280" rx="14" fill="{WHITE}"/>'
        b += fo(x + 40, y + 50) + fx(x + 268, y + 50)
        b += f'<circle cx="{x + 40}" cy="{y + 40}" r="13" fill="{ST["green"]}"/>' + text(x + 40, y + 45, "O", size=14, weight=900, fill=WHITE, anchor="middle")
        b += f'<circle cx="{x + 268}" cy="{y + 40}" r="13" fill="{ST["red"]}"/>' + text(x + 268, y + 45, "X", size=14, weight=900, fill=WHITE, anchor="middle")
        b += text(x + 16, y + 330, ok, size=15, weight=900)
        b += text(x + 16, y + 356, "X: " + no, size=12, weight=600, fill=MUTED_T)
    return b


def phone_frame(x, y, w, h, body, bg=SOFT):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="28" fill="{bg}" stroke="{NAVY}" stroke-width="4"/>'
            f'<clipPath id="pf{x}{y}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="28"/></clipPath><g clip-path="url(#pf{x}{y})">{body}</g>')


def c4_usage():
    b = title_bar(W, "C-4 · 앱 안에서 — 어디에 어떻게 쓰나 (디자인 가이드 토큰 적용)", "빈 화면 · 시작 화면 · 토스트 · 알림 · 온보딩")
    # 1 빈 화면
    x, y, w, h = 50, 80, 300, 560
    inner = f'<rect x="{x + 20}" y="{y + 70}" width="{w - 40}" height="{h - 110}" rx="20" fill="{WHITE}"/>'
    inner += moa(x + 95, y + 170, 120, "wave")
    inner += text(x + w / 2, y + 340, "다이어리가 없어요", size=17, weight=800, anchor="middle")
    inner += text(x + w / 2, y + 364, "오늘 사진 한 장으로 시작해 볼까요?", size=11.5, weight=600, fill=MUTED_T, anchor="middle")
    inner += f'<rect x="{x + 60}" y="{y + 400}" width="{w - 120}" height="48" rx="14" fill="{PRIMARY}"/>' + text(x + w / 2, y + 430, "만들기", size=14, weight=800, fill=WHITE, anchor="middle")
    b += phone_frame(x, y, w, h, inner)
    b += text(x, y + h + 30, "빈 화면 (홈)", size=14, weight=900) + text(x, y + h + 50, "제목 19/800 위에 모아 손 흔들기 116px", size=11, weight=600, fill=MUTED_T)
    # 2 스플래시
    x = 390
    inner = ""
    inner += moa(x + 100, y + 150, 150, "default", pose="blank")
    inner += f'<g transform="translate({x + 118},{y + 340}) scale(.09)"><path d="M431 106C408 96 383 94 350 94H72V754H350C534 754 686 622 686 424C686 357 664 297 624 251" stroke="{INK}" stroke-width="132" stroke-linecap="round" stroke-linejoin="round" fill="none"/><rect x="218" y="356" width="277" height="44" rx="22" fill="{INK}"/><rect x="218" y="452" width="195" height="44" rx="22" fill="{INK}"/><circle cx="607" cy="74" r="90" fill="{ACCENT}"/></g>'
    b += phone_frame(x, y, w, h, inner)
    b += text(x, y + h + 30, "시작 화면", size=14, weight=900) + text(x, y + h + 50, "배경 #CED9EE · 모아 위, 로고 아래 (로고 규칙 유지)", size=11, weight=600, fill=MUTED_T)
    # 3 토스트 · 진행
    x = 730
    inner = f'<rect x="{x + 20}" y="{y + 70}" width="{w - 40}" height="{h - 110}" rx="20" fill="{WHITE}"/>'
    inner += f'<rect x="{x + 40}" y="{y + 100}" width="{w - 80}" height="200" rx="8" fill="{PAPER}" stroke="{LINE}"/>'
    inner += f'<rect x="{x + 50}" y="{y + h - 120}" width="{w - 100}" height="36" rx="999" fill="{NAVY}"/>'
    inner += moa(x + 58, y + h - 116, 28, "wink", pose="blank", lw_abs=2.2, stickers=[])
    inner += text(x + 100, y + h - 97, "PNG를 사진첩에 저장했어요.", size=11, weight=700, fill=WHITE)
    inner += f'<rect x="{x + 50}" y="{y + h - 70}" width="{w - 100}" height="36" rx="999" fill="{NAVY}"/>'
    inner += moa(x + 58, y + h - 66, 28, "walk", pose="walk", lw_abs=2.2, stickers=[])
    inner += text(x + 100, y + h - 47, "PNG 만드는 중 42%", size=11, weight=700, fill=WHITE)
    b += phone_frame(x, y, w, h, inner)
    b += text(x, y + h + 30, "토스트 · 진행 알약", size=14, weight=900) + text(x, y + h + 50, "알약 왼쪽에 28px 모아 (윙크 = 완료, 걷기 = 진행)", size=11, weight=600, fill=MUTED_T)
    # 4 알림
    x = 1070
    inner = f'<rect x="{x + 20}" y="{y + 70}" width="{w - 40}" height="{h - 110}" rx="20" fill="{WHITE}"/>'
    inner += text(x + 40, y + 108, "알림", size=15, weight=800)
    rows = [("디오", "하루님이 다이어리에 초대했어요", "wave"), ("모아", "친구가 스티커 3개를 붙였어요", "happy"), ("디오", "민희님이 참여했어요", "surprised"), ("모아", "오늘 사진이 아직 없어요", "sad")]
    for i, (who, msg, m) in enumerate(rows):
        yy = y + 130 + i * 86
        inner += f'<rect x="{x + 36}" y="{yy}" width="{w - 72}" height="72" rx="14" fill="{MUTED if i % 2 else WHITE}"/>'
        if who == "디오":
            inner += dio(x + 46, yy + 8, 56, m, lw_abs=2.2, tail="none")
        else:
            inner += moa(x + 48, yy + 12, 48, m, lw_abs=2.2, stickers=MOA_STICKERS[m][:2])
        inner += text(x + 100, yy + 32, msg, size=10.5, weight=700)
        inner += text(x + 100, yy + 50, "방금 전", size=9.5, weight=600, fill=MUTED_T)
    b += phone_frame(x, y, w, h, inner)
    b += text(x, y + h + 30, "알림", size=14, weight=900) + text(x, y + h + 50, "공유 · 초대 = 디오, 다이어리 상태 = 모아 (누가 말하는지 역할 분리)", size=11, weight=600, fill=MUTED_T)
    # 5 온보딩 띠
    yb = 740
    b += f'<rect x="50" y="{yb}" width="1500" height="210" rx="18" fill="{SOFT}"/>'
    steps = [("사진 한 장을 올려요", "hold", [("photo", (47, 76), 1.9)]), ("친구를 초대해요", None, None), ("같이 꾸며요", "pen", None), ("하루가 완성돼요", "celebrate", None)]
    for i, (t, m, stk) in enumerate(steps):
        x = 90 + i * 370
        if m is None:
            b += dio(x + 20, yb + 20, 150, "wave", lw_abs=2.6, tail="fly")
        else:
            b += moa(x + 20, yb + 36, 120, m, lw_abs=2.6, stickers=stk)
        b += text(x + 150, yb + 100, f"{i + 1}. {t}", size=15, weight=900)
        b += text(x + 150, yb + 124, "온보딩 카드 — 캐릭터 120px + 제목 15/800", size=10.5, weight=600, fill=MUTED_T)
    return b


# ═══════════════════════════════ I. 아이콘 ═══════════════════════════════

def squircle(x, y, s, fill, r=None):
    r = r if r is not None else s * 0.225
    return f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{r}" fill="{fill}"/>'


def logo_d(x, y, hpx, ink=INK, dot=ACCENT):
    k = hpx / 836
    return (f'<g transform="translate({x},{y}) scale({k})"><path d="M425 122C402 112 377 110 344 110H66V770H344C528 770 680 638 680 440C680 373 658 313 618 267" stroke="{ink}" stroke-width="132" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
            f'<rect x="212" y="372" width="277" height="44" rx="22" fill="{ink}"/><rect x="212" y="468" width="195" height="44" rx="22" fill="{ink}"/>'
            + (f'<circle cx="601" cy="90" r="90" fill="{dot}"/>' if dot else "") + '</g>')


def moa_silhouette(x, y, s, fill=WHITE, hole=PRIMARY, arms=True, pages=True, face=True):
    """아이콘용 모아 흰 실루엣 (크레페식: 단색 바탕 + 흰 형체, 눈 · 입은 바탕색 구멍). s = 상자 폭."""
    k = s / 100
    b = ""
    if arms:
        b += f'<path d="M12,58 C4,54 0,44 3,36" fill="none" stroke="{fill}" stroke-width="14" stroke-linecap="round"/>'
        b += f'<path d="M82,62 C90,66 92,74 88,82" fill="none" stroke="{fill}" stroke-width="14" stroke-linecap="round"/>'
    b += f'<path d="M34,100 V110 H26 M60,100 V110 H68" fill="none" stroke="{fill}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>'
    if pages:
        b += f'<rect x="17" y="15" width="74" height="90" rx="11" fill="{fill}"/>'
        b += f'<rect x="12" y="12" width="74" height="90" rx="11" fill="{hole}"/>'
        b += f'<rect x="8" y="8" width="74" height="90" rx="11" fill="{fill}"/>'
    else:
        b += f'<rect x="10" y="10" width="76" height="92" rx="11" fill="{fill}"/>'
    if face:
        b += f'<ellipse cx="35" cy="46" rx="4.2" ry="5" fill="{hole}"/><ellipse cx="59" cy="46" rx="4.2" ry="5" fill="{hole}"/>'
        b += f'<path d="M40,58 Q47,65 54,58" fill="none" stroke="{hole}" stroke-width="4.5" stroke-linecap="round"/>'
    return g(b, x, y, k)


def dio_silhouette(x, y, s, fill=WHITE, hole=PRIMARY):
    k = s / 100
    b = f'<path d="{HEAD_PATH}" fill="{fill}"/>'
    b += f'<ellipse cx="40.5" cy="42" rx="3.6" ry="5" fill="{hole}"/><ellipse cx="59.5" cy="42" rx="3.6" ry="5" fill="{hole}"/>'
    b += f'<path d="M18,58 L82,58 Q92,58 92,67 Q92,77 82,77 L18,77 Q8,77 8,67 Q8,58 18,58 Z" fill="{fill}" stroke="{hole}" stroke-width="3"/>'
    b += f'<path d="M24,74 C12,86 4,100 10,114 C13,121 24,119 26,111 C28,100 32,88 40,78 Z" fill="{fill}" stroke="{hole}" stroke-width="3"/>'
    b += f'<path d="M31,77 L69,77 L78,128 Q79,132 74,132 L26,132 Q21,132 22,128 Z" fill="{fill}" stroke="{hole}" stroke-width="3"/>'
    b += f'<circle cx="50" cy="96" r="4" fill="{hole}"/><circle cx="50" cy="112" r="4" fill="{hole}"/>'
    return g(b, x, y, k)


ICON_OPTS = [
    ("A · 지금", "흰 바탕 + 로고 (높이 50%)", lambda x, y, s: squircle(x, y, s, WHITE) + f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s * .225}" fill="none" stroke="{LINE}"/>' + logo_d(x + s * 0.28, y + s * 0.25, s * 0.5)),
    ("B · D 흰 심볼", "primary 바탕 + 흰 D (글줄 포함)", lambda x, y, s: squircle(x, y, s, PRIMARY) + logo_d(x + s * 0.27, y + s * 0.22, s * 0.56, ink=WHITE, dot=None)),
    ("C · 모아 실루엣 ★", "primary 바탕 + 흰 모아, 눈 · 입은 구멍", lambda x, y, s: squircle(x, y, s, PRIMARY) + moa_silhouette(x + s * 0.12, y + s * 0.12, s * 0.76, hole=PRIMARY)),
    ("D · 모아 네이비", "text(네이비) 바탕 + 흰 모아", lambda x, y, s: squircle(x, y, s, NAVY) + moa_silhouette(x + s * 0.12, y + s * 0.12, s * 0.76, hole=NAVY)),
    ("E · D + 테마 원", "primary 바탕 + 흰 D + 하늘 원 (로고 2색)", lambda x, y, s: squircle(x, y, s, PRIMARY) + logo_d(x + s * 0.27, y + s * 0.22, s * 0.56, ink=WHITE, dot=SOFT)),
    ("F · 모아 얼굴만", "primary 바탕 + 표지 윗부분 확대 (얼굴 중심)", lambda x, y, s: squircle(x, y, s, PRIMARY) + f'<clipPath id="fc{x}"><rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s * .225}"/></clipPath><g clip-path="url(#fc{x})">' + moa_silhouette(x - s * 0.02, y + s * 0.2, s * 1.04, hole=PRIMARY, arms=False) + '</g>'),
    ("G · 둘이", "primary 바탕 + 모아 · 디오 흰 실루엣", lambda x, y, s: squircle(x, y, s, PRIMARY) + dio_silhouette(x + s * 0.42, y + s * 0.06, s * 0.62, hole=PRIMARY) + moa_silhouette(x + s * 0.02, y + s * 0.3, s * 0.56, hole=PRIMARY)),
    ("H · 풀컬러 모아", "하늘(#CED9EE) 바탕 + 원색 모아 (대조군)", lambda x, y, s: squircle(x, y, s, SOFT) + moa(x + s * 0.12, y + s * 0.1, s * 0.86, "default", pose="blank", lw_abs=s * 0.035, stickers=[("heart", "tl", 1.0)])),
]


def i1_options():
    b = title_bar(W, "I-1 · 앱 아이콘 8안 — 크레페식 '단색 바탕 + 흰 형체' 검토", "iOS 둥근 네모(반지름 22.5%) · 180px")
    for i, (name, desc, fn) in enumerate(ICON_OPTS):
        r, c = divmod(i, 4)
        x, y = 70 + c * 385, 90 + r * 450
        b += f'<rect x="{x - 20}" y="{y - 20}" width="360" height="420" rx="18" fill="{MUTED}"/>'
        b += fn(x + 60, y + 10, 200)
        b += text(x, y + 260, name, size=16, weight=900)
        b += text(x, y + 284, desc, size="11.5", weight=600, fill=MUTED_T)
        # 작은 크기 줄
        for j, ss in enumerate([60, 40, 29]):
            b += fn(x + j * 80, y + 310, ss)
            b += text(x + j * 80 + ss / 2, y + 390, f"{ss}", size=10, weight=700, fill=MUTED_T, anchor="middle")
    return b


def i2_sizes():
    b = title_bar(W, "I-2 · 추천안 C 를 자리별로 — iOS · Android · 작은 크기 · 홈 화면", "눈 · 입 구멍이 29px 에서도 남는지 본다")
    fn = ICON_OPTS[2][2]
    # iOS 크기
    b += text(60, 100, "iOS (둥근 네모 22.5%)", size=14, weight=900)
    for j, ss in enumerate([180, 120, 87, 60, 40, 29]):
        x = 60 + sum([180, 120, 87, 60, 40, 29][:j]) + j * 34
        b += fn(x, 300 - ss, ss)
        b += text(x + ss / 2, 324, f"{ss}", size=10.5, weight=700, fill=MUTED_T, anchor="middle")
    # Android 적응형 (원 · 둥근 네모 · 사각)
    b += text(60, 400, "Android 적응형 (안전 영역 66%)", size=14, weight=900)
    masks = [("원", lambda x, y, s: f'<clipPath id="m1"><circle cx="{x + s / 2}" cy="{y + s / 2}" r="{s / 2}"/></clipPath><g clip-path="url(#m1)">'),
             ("둥근 네모", lambda x, y, s: f'<clipPath id="m2"><rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s * .18}"/></clipPath><g clip-path="url(#m2)">'),
             ("스퀴클", lambda x, y, s: f'<clipPath id="m3"><rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s * .32}"/></clipPath><g clip-path="url(#m3)">')]
    for j, (nm, mk) in enumerate(masks):
        x, y, s = 60 + j * 230, 430, 160
        b += mk(x, y, s) + f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{PRIMARY}"/>' + moa_silhouette(x + s * 0.19, y + s * 0.19, s * 0.62, hole=PRIMARY) + '</g>'
        b += f'<circle cx="{x + s / 2}" cy="{y + s / 2}" r="{s * 0.33}" fill="none" stroke="{WHITE}" stroke-dasharray="4 4" opacity=".6"/>'
        b += text(x + s / 2, y + s + 24, nm, size=11.5, weight=700, fill=MUTED_T, anchor="middle")
    # iOS 26 클리어 · 다크
    b += text(800, 400, "iOS 26 변형 (단색 형체라 그대로 된다)", size=14, weight=900)
    x, y, s = 800, 430, 160
    b += squircle(x, y, s, "#1C1C1E") + moa_silhouette(x + s * 0.12, y + s * 0.12, s * 0.76, fill="#8FA8D6", hole="#1C1C1E")
    b += text(x + s / 2, y + s + 24, "다크", size=11.5, weight=700, fill=MUTED_T, anchor="middle")
    x = 1030
    b += f'<rect x="{x - 20}" y="{y - 20}" width="{s + 40}" height="{s + 40}" rx="20" fill="#7E95BC"/>'
    b += squircle(x, y, s, "rgba(255,255,255,0.35)") + f'<rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{s * .225}" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="2"/>' + moa_silhouette(x + s * 0.12, y + s * 0.12, s * 0.76, fill="rgba(255,255,255,.92)", hole="rgba(120,140,180,.6)")
    b += text(x + s / 2, y + s + 24, "클리어", size=11.5, weight=700, fill=MUTED_T, anchor="middle")
    x = 1260
    b += squircle(x, y, s, "#E8EDF6") + moa_silhouette(x + s * 0.12, y + s * 0.12, s * 0.76, fill="#5B6FA0", hole="#E8EDF6")
    b += text(x + s / 2, y + s + 24, "틴트(연함)", size=11.5, weight=700, fill=MUTED_T, anchor="middle")
    # 홈 화면 시뮬
    b += text(60, 700, "홈 화면에서 (주변 앱 사이)", size=14, weight=900)
    b += f'<rect x="60" y="720" width="1480" height="230" rx="18" fill="#2B3448"/>'
    others = ["#34C759", "#FF9500", "#FFCC00", "#FF2D55", "#5856D6", "#000000", "#FFFFFF", "#1DA1F2", "#F7CB4D", "#FF5A36"]
    for j, c_ in enumerate(others[:5]):
        b += squircle(100 + j * 96, 760, 64, c_)
    b += fn(100 + 5 * 96, 760, 64)
    for j, c_ in enumerate(others[5:]):
        b += squircle(100 + (6 + j) * 96, 760, 64, c_)
    b += text(100 + 5 * 96 + 32, 850, "DIO", size=11, weight=700, fill=WHITE, anchor="middle")
    b += text(100, 900, "단색 파랑 바탕은 흔하다(파랑 아이콘 많음). 대신 '얼굴 있는 사각 책' 형체는 드물어 형태로 구분된다. 바탕을 네이비(D안) 로 하면 더 구분되지만 iOS 다크 모드에서 가라앉는다.", size=11.5, weight=600, fill=WHITE)
    return b


def i3_logo_vs():
    b = title_bar(W, "I-3 · 로고와 캐릭터 — 함께 쓰는 법", "로고(D) 는 그대로, 캐릭터는 그 옆 · 아래")
    # 로고 + 모아
    b += f'<rect x="60" y="90" width="700" height="400" rx="18" fill="{MUTED}"/>'
    b += logo_d(120, 170, 220)
    b += moa(400, 150, 260, "wave", stickers=[("heart", "tl", 1.0)])
    b += text(80, 530, "로고 옆 (가로형): 로고 높이 = 모아 높이의 85%. 간격 = 로고 높이의 25% (로고 여백 규칙)", size=12.5, weight=600, fill=MUTED_T)
    b += f'<rect x="820" y="90" width="720" height="400" rx="18" fill="{SOFT}"/>'
    b += moa(1060, 110, 230, "default", pose="blank")
    b += logo_d(1120, 370, 90)
    b += text(840, 530, "세로형(시작 화면): 모아 위, 로고 아래. 로고 색 #242424 · #9FB6D9 그대로", size=12.5, weight=600, fill=MUTED_T)
    # 워드마크 제안
    b += f'<rect x="60" y="580" width="1480" height="370" rx="18" fill="{MUTED}"/>'
    b += text(90, 620, "캐릭터 + 서비스명 조합 예 (워드마크는 시스템 서체 900, 자간 -1)", size=14, weight=900)
    b += moa(110, 660, 180, "default", pose="blank", stickers=[("star", "tr", 0.9)])
    b += text(300, 790, "DIO", size=96, weight=900, fill=NAVY, extra='letter-spacing="-3"')
    b += dio(560, 650, 220, "look", tail="fly")
    b += text(760, 760, "하루 한 장, 같이 꾸미는 다이어리", size=22, weight=800, fill=NAVY)
    b += text(760, 800, "모아 · 디오는 워드마크를 대신하지 않는다. 로고 D 와 글자가 주인이고 캐릭터는 곁에 선다.", size=12.5, weight=600, fill=MUTED_T)
    b += text(760, 826, "캐릭터는 앱 아이콘 · 빈 화면 · 토스트 · 알림 · 온보딩 · 스티커 팩에서만 쓴다(C-4).", size=12.5, weight=600, fill=MUTED_T)
    return b


def icon_files():
    """추천안 C 등 아이콘 단품 1024 (아이콘/svg → png)."""
    s = 1024
    for key, fn in [("아이콘 C 모아실루엣", ICON_OPTS[2][2]), ("아이콘 B 흰D", ICON_OPTS[1][2]), ("아이콘 D 모아네이비", ICON_OPTS[3][2]), ("아이콘 G 둘이", ICON_OPTS[6][2]), ("아이콘 E D와 테마원", ICON_OPTS[4][2])]:
        body = fn(0, 0, s).replace(f'rx="{s * .225}"', 'rx="0"', 1)  # 플랫폼이 마스크를 씌우므로 모서리 없이
        save(key, body, s, s, bg=WHITE, icon=True)
    # 투명 배경 캐릭터 단품 (앱 에셋용)
    save("모아 기본", moa(20, 10, 1000, "default"), 1040, 1040, bg="none", icon=True)
    save("모아 행복", moa(20, 10, 1000, "happy"), 1040, 1040, bg="none", icon=True)
    save("디오 기본", dio(20, 10, 1000, "default"), 1040, 1040, bg="none", icon=True)
    save("둘이 함께", pair_scene(60, 40, 1.8), 1100, 800, bg="none", icon=True)


if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    sheets = {"모아 1 해부도": a1_anatomy, "모아 2 턴어라운드": a2_turnaround, "모아 3 감정": a3_emotions, "모아 4 포즈": a4_poses, "모아 5 색": a5_colors, "모아 6 스티커": a6_stickers,
              "디오 1 해부도": b1_anatomy, "디오 2 턴어라운드": b2_turnaround, "디오 3 감정": b3_emotions, "디오 4 색": b4_colors, "디오 5 포즈": b5_poses,
              "둘이 1 함께": c1_pair, "둘이 2 라인업 비율": c2_lineup, "둘이 3 그림체 규칙": c3_style, "둘이 4 앱 활용": c4_usage,
              "아이콘 1 8안 비교": i1_options, "아이콘 2 크기별": i2_sizes, "아이콘 3 로고와 캐릭터": i3_logo_vs}
    for name, fn in sheets.items():
        if only and not name.startswith(only):
            continue
        save(name, fn())
    if not only or only.startswith("아이콘"):
        icon_files()
