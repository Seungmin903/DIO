"""폰 배치 시안 — 원안 ↔ 시안 비교 PNG 만들기 (실기기 캡처 위에 그린 목업).

쓰는 법: SHOTS 에 점검 때 찍은 캡처 폴더를 주고 `PYTHONIOENCODING=utf-8 python 시안만들기.py`.
시안은 위치 · 크기를 보여 주는 목업이다. 글자 · 그림자는 원본 캡처를 그대로 쓴다.
"""
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SHOTS = Path(os.environ['SHOTS'])
FONT = r'C:\Windows\Fonts\malgun.ttf'
FONT_B = r'C:\Windows\Fonts\malgunbd.ttf'
INK, SOFT, LINE, BG = (11, 23, 102), (83, 96, 166), (209, 212, 228), (247, 248, 253)


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size)


def shot(rel):
    return Image.open(SHOTS / rel).convert('RGB')


def star(draw, cx, cy, size, color=(255, 255, 255), width=5):
    """윤곽만 있는 둥근 별 (앱의 즐겨찾기 안 칠한 별 크기 ≈ 21dp = 55px)"""
    r_out, r_in = size / 2, size / 2 * 0.46
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    draw.line(pts + [pts[0]], fill=color, width=width, joint='curve')


def sheet(title, lines, panels, out, panel_scale=1.0, gap=36):
    """panels: [(라벨, 이미지, 강조색)] 를 가로로 나열하고 위에 제목 · 이유 줄을 쓴다."""
    ims = [(l, im.resize((round(im.width * panel_scale), round(im.height * panel_scale)), Image.LANCZOS), c) for l, im, c in panels]
    w = max(sum(im.width for _, im, _ in ims) + gap * (len(ims) + 1), 1900)
    top = 120 + 34 * len(lines)
    h = top + max(im.height for _, im, _ in ims) + gap + 70
    canvas = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    d.text((gap, 30), title, font=font(46, True), fill=INK)
    for i, line in enumerate(lines):
        d.text((gap, 100 + 34 * i), line, font=font(26), fill=SOFT)
    x = gap
    for label, im, color in ims:
        canvas.paste(im, (x, top + 56))
        d.rectangle((x - 1, top + 55, x + im.width, top + 56 + im.height), outline=color, width=4)
        d.text((x, top + 6), label, font=font(34, True), fill=color)
        x += im.width + gap
    canvas.save(out)
    print('저장', out.name, canvas.size)


ORIG, OPT_A, OPT_B, OPT_C = (150, 70, 70), (45, 100, 190), (30, 130, 90), (140, 90, 180)


def cover_star():
    base = shot('after/1-6-grid-after2.png')  # 별이 없는 캡처(왼쪽 Test-A · 오른쪽 새 다이어리)
    box = (230, 440, 1020, 1010)
    covers = [(258, 464), (696, 464)]  # 두 표지 왼쪽 위 (폭 294 · 높이 393)
    W, H = 294, 393
    pos = {  # 표지 안 중심 좌표(12dp = 32px 여백, 별 55px)
        '원안': (66, 59),
        '시안 1 · 오른쪽 위': (W - 32 - 27, 59),
        '시안 2 · 왼쪽 아래': (66, H - 32 - 27),
    }
    panels = []
    for (label, (px, py)), color in zip(pos.items(), (ORIG, OPT_A, OPT_B)):
        im = base.copy()
        d = ImageDraw.Draw(im)
        for cx0, cy0 in covers:
            star(d, cx0 + px, cy0 + py, 55)
        panels.append((label, im.crop(box), color))
    sheet('① 즐겨찾기 별 ↔ 제목표 겹침 (폰 150dp 카드)',
          ['별은 표지 위가 맞다(사용자 결정). 표지 위 안에서만 옮기는 시안입니다.',
           '시안 1: 오른쪽 위 — GoodNotes 도움말도 별을 썸네일 오른쪽 위로 안내. 단 고무줄(세로 띠)과 겹칩니다.',
           '시안 2: 왼쪽 아래 — 제목표와 멀고 고무줄과도 안 겹치나, 표지 아래 장식(요소)과 겹칠 수 있습니다.',
           '제목표 위치는 표지 디자인 요소라 표지마다 다릅니다(목업은 기본 위치).'],
          panels, HERE / '시안1 즐겨찾기 별 위치.png', 0.9)


def layers():
    orig = shot('after/2-4-layers.png')
    closed = shot('before/cur2.png')
    panel_bg = orig.getpixel((700, 1500))
    box = (0, 80, 1080, 2400)

    # 시안 1: 패널 아래를 비워 되돌리기 막대를 온전히 보인다
    a = orig.copy()
    d = ImageDraw.Draw(a)
    d.rectangle((316, 2170, 1080, 2400), fill=BG)
    d.line((316, 2170, 1080, 2170), fill=LINE, width=3)
    a.paste(closed.crop((56, 2215, 500, 2350)), (56, 2215))

    # 시안 2: 패널 폭을 줄여 막대가 옆에 들어오게 한다(패널 왼쪽 316 → 520)
    b = orig.copy()
    b.paste(closed.crop((316, 430, 540, 2400)), (316, 430))
    d = ImageDraw.Draw(b)
    d.rectangle((520, 430, 1080, 2400), fill=panel_bg)
    d.line((520, 430, 520, 2400), fill=LINE, width=3)
    b.paste(orig.crop((362, 480, 520, 560)), (566, 480))  # 제목
    b.paste(orig.crop((1000, 480, 1050, 545)), (1000, 480))  # 닫기
    for y0, y1 in ((600, 720), (740, 860)):
        b.paste(orig.crop((362, y0, 640, y1)), (566, y0))
        b.paste(orig.crop((1000, y0 + 40, 1040, y1 - 40)), (1000, y0 + 40))
    b.paste(closed.crop((56, 2215, 500, 2350)), (56, 2215))

    panels = [('원안', orig.crop(box), ORIG), ('시안 1 · 패널 아래를 비움', a.crop(box), OPT_A), ('시안 2 · 패널 폭 줄임', b.crop(box), OPT_B)]
    sheet('② 레이어 패널 ↔ 되돌리기 · 다시 실행 · 저장됨 막대 (폰 세로)',
          ['설계: 되돌리기 · 다시 실행 · 자동 저장은 한 묶음으로 왼쪽 아래(왼쪽 패널이 열리면 오른쪽 아래).',
           '원안은 레이어 패널이 오른쪽 약 70%를 덮어 막대 오른쪽이 잘립니다.',
           '시안 1: 패널 높이를 줄여 막대를 패널 아래 자리에 둠(막대 구성 그대로). 시안 2: 패널 폭을 줄여 막대를 옆에 둠.'],
          panels, HERE / '시안2 레이어 패널과 되돌리기 막대.png', 0.55)


def statusband():
    rows = []
    for name in ('after/5-3-trash.png', 'after/5-5-settings.png'):
        orig = shot(name)
        a = orig.copy()
        ImageDraw.Draw(a).rectangle((169, 0, 1080, 91), fill=(255, 255, 255))  # 시안 A: 본문(흰)이 상태바 뒤까지
        b = orig.copy()
        px = b.load()
        for y in range(92, b.height):
            for x in range(169, b.width):
                if px[x, y] == (255, 255, 255):
                    px[x, y] = BG  # 시안 B: 본문 바탕을 앱 바탕(상태바 색)으로
        rows.append([orig.crop((0, 0, 1080, 900)), a.crop((0, 0, 1080, 900)), b.crop((0, 0, 1080, 900))])
    labels = ['원안 · 상태바 라벤더 / 본문 흰색', '시안 A · 본문 흰색을 상태바 뒤까지', '시안 B · 본문 바탕을 라벤더로']
    colors = [ORIG, OPT_A, OPT_B]
    panels = [(labels[i], stack(rows[0][i], rows[1][i]), colors[i]) for i in range(3)]
    sheet('③ 상태바 띠 색 ↔ 본문 흰색 (휴지통 · 설정 · 공방)',
          ['원안은 맨 위 약 36dp 띠가 라벤더, 그 아래 본문이 흰색이라 띠가 보입니다. 왼쪽 바(라벤더)와 이어지는 건 의도로 보임.',
           'Android 공식 edge-to-edge 안내: 시스템 바 뒤까지 배경을 그리고 안전 영역만 패딩으로 비움(바 색을 따로 맞추지 않음).',
           '시안 A: 흰 본문을 위로 확장(왼쪽 바는 그대로). 시안 B: 본문을 라벤더로 통일(카드 대비는 별도 확인 필요).'],
          panels, HERE / '시안3 상태바 띠 색.png', 0.7)


def stack(a, b):
    im = Image.new('RGB', (a.width, a.height + b.height + 20), (255, 255, 255))
    im.paste(a, (0, 0))
    im.paste(b, (0, a.height + 20))
    return im


def tape_row():
    """④ 테이프 색 줄: 폰에서 7번째 칸이 잘리고 내 색상 · + 가 안 보이는 문제 (원안 ↔ 시안 A · B)"""
    orig = shot('after/2-9-tape.png')
    centers = [180, 302, 426, 550, 674, 797, 922]
    box = (100, 790, 1010, 1260)
    cell = 112  # 40dp 칸
    left, right = 140, 942

    def swatch(c):
        return orig.crop((c - 44, 972 - 44, c + 44, 972 + 44))

    # 시안 A: 기본 7색 한 줄(칸 44→40dp) + 아래 줄에 '내 색상' 라벨 · 내 색 · +
    a = orig.copy()
    d = ImageDraw.Draw(a)
    lower = orig.crop((100, 1030, 1010, 1790))  # '무늬' 제목부터 아래 전부
    d.rectangle((100, 905, 1010, 1790), fill=(255, 255, 255))
    step = (right - left - cell) / 6
    for k, c in enumerate(centers):
        s = swatch(c)
        a.paste(s, (round(left + cell / 2 + step * k - 44), 972 - 44))
    ry = 972 + 128
    d.text((left, ry - 18), '내 색상', font=font(30, True), fill=SOFT)
    for k, col in enumerate([(236, 214, 226), (205, 226, 214)]):
        cx = left + 250 + k * 118
        d.ellipse((cx - 40, ry - 40, cx + 40, ry + 40), fill=col, outline=LINE, width=3)
    cx = left + 250 + 2 * 118
    for t in range(0, 360, 24):  # 점선 원
        d.arc((cx - 40, ry - 40, cx + 40, ry + 40), t, t + 12, fill=SOFT, width=4)
    d.line((cx - 15, ry, cx + 15, ry), fill=SOFT, width=5)
    d.line((cx, ry - 15, cx, ry + 15), fill=SOFT, width=5)
    a.paste(lower, (100, 1030 + 128))

    # 시안 B: 한 줄 스크롤 유지 + 칩 줄과 같은 ‹ › 버튼 · 오른쪽 가림
    b = orig.copy()
    d = ImageDraw.Draw(b)
    for k in range(40):  # 오른쪽 흰 그라데이션
        x = 790 + k * 3
        d.line((x, 920, x, 1030), fill=(255, 255, 255), width=3)
    d.rectangle((910, 920, 1010, 1030), fill=(255, 255, 255))
    arrows = orig.crop((860, 800, 945, 885))  # 칩 줄의 › 버튼
    b.paste(arrows, (880, 930))  # 맨 앞에서는 › 만 (‹ 는 흐리게 막힘 · 목업은 생략)

    panels = [
        ('원안 · 7번째 칸이 안쪽 여백을 넘음 · 내 색상 + 안 보임', orig.crop(box), ORIG),
        ('시안 A · 기본 한 줄 + 내 색상 줄', a.crop((100, 790, 1010, 1260 + 128)), OPT_A),
        ('시안 B · 한 줄 스크롤 + ‹ › 버튼', b.crop(box), OPT_B),
    ]
    sheet('④ 마스킹테이프 색 줄 — 폰에서 끝이 보이지 않음 (설계 변경 · 폰/태블릿 공통안)',
          ['원안: 폰에서 기본 7색 중 7번째가 안쪽 여백(오른쪽)을 넘어 가장자리에 걸려 있고, 구분선 · 내 색상 · + 는 오른쪽 화면 밖이라 있는 줄도 알 수 없음(칩 줄은 ‹ › 버튼이 있음).',
           '시안 A: 기본 7색은 항상 한 줄(칸 40dp), 내 색상과 +는 아래 줄에 라벨과 함께. 내 색이 많으면 아래 줄만 스크롤 · 태블릿도 같은 구조.',
           '시안 B: 줄은 그대로 두고 칩 줄과 같은 ‹ › 버튼 · 끝 흰 그라데이션으로 이어짐을 알림. 폰 구성 변경은 최소.',
           '목업은 실기기 캡처 위에 그린 것이라 내 색 · 아이콘은 대략입니다.'],
          panels, HERE / '시안4 테이프 색 줄.png', 0.8)


def bottom_sheet():
    """⑤ 도구 옵션 창 → 하단 시트 (폰 세로). 원안(떠 있는 카드) ↔ 시안(아래에서 올라오는 시트)"""
    orig = shot('after/2-9-tape-A2.png')
    page = shot('after/cur-now.png')  # 패널이 없는 편집기
    sheet_top = 1010
    new = page.copy()
    d = ImageDraw.Draw(new)
    r = 80  # 윗모서리 28dp
    d.rounded_rectangle((0, sheet_top, 1079, 2500), radius=r, fill=(255, 255, 255), outline=LINE, width=3)
    d.rectangle((0, sheet_top + r, 1079, 2400), fill=(255, 255, 255))
    d.rounded_rectangle((460, sheet_top + 20, 620, sheet_top + 30), radius=5, fill=(200, 204, 224))  # 손잡이 줄
    new.paste(orig.crop((0, 270, 1080, 415)), (0, 270))  # 도구 줄: 테이프가 선택된 모습
    title = orig.crop((100, 520, 960, 610))
    new.paste(title, (100, sheet_top + 50))
    body = orig.crop((100, 628, 960, 628 + 2400 - (sheet_top + 150)))
    new.paste(body, (100, sheet_top + 150))
    undo = page.crop((56, 2215, 500, 2350))
    new.paste(undo, (56, sheet_top - 160))  # 되돌리기 막대는 시트 위로
    box = (0, 80, 1080, 2400)
    sheet('⑤ 도구 옵션 창 → 하단 시트 (폰 세로 · 설계 변경)',
          ['원안: 떠 있는 카드(좌우 여백 약 90px). 시안: 윗모서리만 둥글고 아래는 평평하게 화면 폭을 꽉 채우는 시트(좌우 여백 16dp).',
           '아래에서 200ms 올라옴 · 손잡이 줄/제목 줄을 아래로 끌거나 X · 시트 밖을 눌러 닫음 · 닫으면 선택 도구로 돌아감.',
           '높이 화면의 약 58%, 되돌리기 막대는 시트 위, 뒤 페이지는 어둡게 하지 않음.',
           '목업은 시트 안 내용을 원안 캡처 그대로 붙인 것이라 칸 폭이 같게 보임. 실제로는 시트가 넓어져 칸 · 입력창이 더 넓어짐.'],
          [('원안 · 떠 있는 카드', orig.crop(box), ORIG), ('시안 · 하단 시트', new.crop(box), OPT_A)], HERE / '시안5 하단 시트.png', 0.55)


def corner_buttons():
    """⑥ 상단 바의 페이지 · 레이어 버튼을 도구 줄 아래 좌우 끝으로 (동그라미 ↔ 둥근 네모)"""
    orig = shot('after/s5-topbar.png')
    page_icon = orig.crop((244 - 40, 178 - 40, 244 + 40, 178 + 40))
    layer_icon = orig.crop((865 - 40, 178 - 40, 865 + 40, 178 + 40))

    def make(kind):
        im = orig.copy()
        d = ImageDraw.Draw(im)
        d.rectangle((200, 100, 330, 260), fill=(255, 255, 255))  # 상단 바: 페이지 버튼 자리 비움
        d.rectangle((820, 100, 910, 260), fill=(255, 255, 255))  # 레이어 버튼 자리 비움
        for cx, icon in ((72, page_icon), (1008, layer_icon)):
            cy, r = 482, 56
            box = (cx - r, cy - r, cx + r, cy + r)
            d.ellipse((cx - r + 2, cy - r + 8, cx + r + 2, cy + r + 8), fill=(228, 231, 244)) if kind == 'round' else d.rounded_rectangle((cx - r + 2, cy - r + 8, cx + r + 2, cy + r + 8), radius=34, fill=(228, 231, 244))
            if kind == 'round':
                d.ellipse(box, fill=(255, 255, 255), outline=LINE, width=3)
            else:
                d.rounded_rectangle(box, radius=34, fill=(255, 255, 255), outline=LINE, width=3)
            im.paste(icon, (cx - 40, cy - 40))
        return im
    box = (0, 80, 1080, 900)
    panels = [('원안 · 상단 바에 페이지 · 레이어', orig.crop(box), ORIG),
              ('시안 A · 동그란 버튼', make('round').crop(box), OPT_A),
              ('시안 B · 둥근 네모 버튼', make('square').crop(box), OPT_B)]
    sheet('⑥ 페이지 · 레이어 버튼을 도구 줄 아래 좌우 끝으로 (폰 세로 · 설계 변경)',
          ['시안: 상단 바에는 ‹ 로고 · 제목 · 공유 · 내보내기만 남고, 페이지 목록(왼쪽 끝) · 레이어(오른쪽 끝)는 도구 줄 아래 둥둥 뜬 버튼.',
           '버튼 크기 40dp, 도구 줄과 8dp 간격, 좌우 여백 16dp. 모양은 동그라미와 둥근 네모(모서리 12dp) 두 가지. 목업이라 아이콘은 원안을 그대로 붙였습니다.'],
          panels, HERE / '시안6 페이지 레이어 버튼 위치.png', 0.8)


def mypage():
    """⑦ 마이페이지(폰): 닉네임 · 이메일이 "QA11…"로 잘리는 문제와 구성 — 원안 ↔ 시안 A · B · C"""
    orig = shot('after/mypage.png')
    avatar = orig.crop((252 - 68, 463 - 68, 252 + 68 + 136 - 136, 463 + 68)).copy()
    av = orig.crop((252, 395, 388, 531))  # 원안 프로필 동그라미(136px)
    L, R = 208, 1040  # 본문 좌우 끝(원안과 같다)
    MUTED = (240, 241, 248)
    NAME, MAIL = 'QA11011', 'QA11011@dubai.test'

    def base():
        im = orig.copy()
        d = ImageDraw.Draw(im)
        d.rectangle((169, 290, 1080, 2400), fill=(255, 255, 255))
        return im, d

    def chevron(d, x, y, color=SOFT):
        d.line([(x - 9, y - 18), (x + 9, y), (x - 9, y + 18)], fill=color, width=5, joint='curve')

    def row(d, y, label, last=False):
        d.text((L, y), label, font=font(34), fill=INK)
        chevron(d, R - 20, y + 24)
        if not last:
            d.line((L, y + 78, R, y + 78), fill=LINE, width=2)

    def a():  # 프로필 줄 전체가 편집 진입
        im, d = base()
        d.rounded_rectangle((L, 306, R, 620), radius=34, fill=MUTED)
        im.paste(av, (L + 40, 395))
        d.text((L + 216, 380), NAME, font=font(50, True), fill=INK)
        d.text((L + 216, 452), MAIL, font=font(32), fill=SOFT)
        d.text((L + 216, 508), '프로필 수정', font=font(28), fill=SOFT)
        chevron(d, R - 44, 463)
        d.text((L, 690), '계정', font=font(32, True), fill=INK)
        d.rounded_rectangle((L, 760, R, 880), radius=26, outline=SOFT, width=3)
        d.text(((L + R) // 2 - 62, 798), '로그아웃', font=font(36), fill=SOFT)
        return im

    def b():  # 이름 아래 전폭 수정 버튼
        im, d = base()
        d.rounded_rectangle((L, 306, R, 700), radius=34, fill=MUTED)
        im.paste(av, (L + 40, 350))
        d.text((L + 216, 372), NAME, font=font(50, True), fill=INK)
        d.text((L + 216, 446), MAIL, font=font(32), fill=SOFT)
        d.rounded_rectangle((L + 40, 560, R - 40, 650), radius=24, fill=(255, 255, 255), outline=SOFT, width=3)
        d.text(((L + R) // 2 - 80, 580), '프로필 수정', font=font(34), fill=SOFT)
        d.text((L, 770), '계정', font=font(32, True), fill=INK)
        d.rounded_rectangle((L, 840, R, 960), radius=26, outline=SOFT, width=3)
        d.text(((L + R) // 2 - 62, 878), '로그아웃', font=font(36), fill=SOFT)
        return im

    def c():  # A + 설정 행을 마이페이지로 모으고 로그아웃은 맨 아래 글자 버튼
        im, d = base()
        d.rounded_rectangle((L, 306, R, 620), radius=34, fill=MUTED)
        im.paste(av, (L + 40, 395))
        d.text((L + 216, 380), NAME, font=font(50, True), fill=INK)
        d.text((L + 216, 452), MAIL, font=font(32), fill=SOFT)
        d.text((L + 216, 508), '프로필 수정', font=font(28), fill=SOFT)
        chevron(d, R - 44, 463)
        d.text((L, 690), '설정', font=font(32, True), fill=INK)
        for i, label in enumerate(['알림 설정', '앱 잠금', '편집 설정', '앱 정보']):
            row(d, 760 + i * 100, label, i == 3)
        d.text(((L + R) // 2 - 62, 1320), '로그아웃', font=font(34), fill=SOFT)
        return im

    box = (0, 0, 1080, 1500)
    panels = [('원안', orig.crop(box), ORIG), ('시안 A · 프로필 줄 전체가 편집', a().crop(box), OPT_A),
              ('시안 B · 수정 버튼을 아래 전폭으로', b().crop(box), OPT_B), ('시안 C · A + 설정 행 모으기', c().crop(box), OPT_C)]
    sheet('⑦ 마이페이지 (폰 세로 · 구성 변경)',
          ['원안은 사진 · 이름 · 수정 버튼이 한 줄이라 닉네임과 이메일이 "QA11…"로 잘립니다.',
           '시안은 이름 · 이메일을 줄임 없이 보이게 하고, 수정 진입과 설정 위치를 바꿔 본 세 가지입니다. 목업이라 글자는 임의로 그렸습니다.'],
          panels, HERE / '시안7 마이페이지.png', 0.62)


if __name__ == '__main__':
    cover_star()
    layers()
    statusband()
    tape_row()
    mypage()
