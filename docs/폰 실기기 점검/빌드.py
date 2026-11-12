"""폰 실기기 점검 — 고친 화면 비포/애프터 PDF 만들기.

쓰는 법: 점검 때 찍은 캡처 폴더를 환경 변수 SHOTS 로 꼭 지정하고 `PYTHONIOENCODING=utf-8 python 빌드.py`.
이미지는 이미지/ 로 줄여 복사하고, 같은 폴더의 HTML 을 크롬 헤드리스로 PDF 로 찍는다.
(크롬은 절대 경로 · --window-size 가 필요하다)
"""
import html
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SHOTS = Path(os.environ['SHOTS'])
IMG = HERE / '이미지'
CHROME = os.environ.get('CHROME', r'C:\Program Files\Google\Chrome\Application\chrome.exe')  # 다른 위치면 환경 변수 CHROME

# (제목, 증상, 원인 · 수정, [(이름표, 파일, 자르기(left, top, right, bottom) 또는 None), ...] 비포 → 애프터 순)
PAIRS = [
    ('새 다이어리 · 기본 탭 (폰)',
     ['미리보기 판이 높이 0으로 접혀 표지·속지가 보이지 않고, 탭 아래 점 두 개만 남는다.', '창 아래쪽 2/3가 빈 채로 남는다.'],
     ['기본 스타일 flex: 1 이 flexBasis · height 보다 앞서 판 높이가 0 (실측 355×0).', 'stageSheet 에 flex: 0 을 더해 height 240 이 먹히게 했다. (Workbench.js 한 줄)'],
     [('비포', 'before/1-4-new-sheet.png', None), ('애프터', 'after/1-4-fix1.png', None)]),
    ('새 다이어리 · 속지 탭 (폰)',
     ['속지 미리보기가 작은 알약으로 접히고, 속지 묶음이 있으면 썸네일 줄이 탭 위로 넘쳐 겹친다.'],
     ['같은 원인(판 높이 0). 판 높이가 240으로 서면서 큰 장 · 썸네일 줄 · 쪽수 알약이 판 안에 들어간다.'],
     [('비포', 'before/1-4b-paper-tab.png', None), ('애프터', 'after/1-4i4-mixed.png', None)]),
    ('속지 글꼴 고르기 — 칩에서 드롭다운으로',
     ['공방 기본 속지 설정만 드롭다운이고, 새 다이어리 · 다이어리 수정 · 편집기 속지 설정 창은 칩 여섯 개가 줄지어 있었다.'],
     ['PaperStyleOptions 의 fontDropdown 옵션이 기본 꺼짐이었다. 세 곳 모두 PaperFontDropdown 으로 통일하고 안 쓰는 칩 코드는 지웠다.', '편집기 쪽은 글꼴 칸이 있는 속지에서만 나와 폰에서는 새 다이어리만 확인했다.'],
     [('비포', 'after/1-4k2-paper-color.png', None), ('애프터', 'after/1-4k3-font-dropdown.png', None), ('목록 열림', 'after/1-4k4-font-dropdown-open.png', None)]),
    ('사진 자르기 창 (폰)',
     ['비율 칩이 두 줄이라 카드가 화면보다 커져 아래가 잘린다. 둥근 모서리 없이 끊기고 버튼 줄이 바닥에 붙는다.'],
     ['미리보기 판 높이를 창 높이 절반으로만 잡아 폰에서 카드가 넘쳤다. 폰(폭 600 미만)은 창 높이 − 470 까지로 줄였다(태블릿은 − 420).', 'PhotoCropper.js 두 줄.'],
     [('비포', 'before/2-11-photo-crop.png', None), ('애프터', 'after/2-11-photo-crop.png', None)]),
    ('내보내기 · 페이지 지정 + 키보드 (폰)',
     ['페이지 지정 칸을 누르면 키보드가 올라와 형식 · 만들기 버튼이 키보드 뒤로 가려지고 창은 움직이지 않는다.'],
     ['Android 모달은 창 크기가 줄지 않는다. 키보드 높이(Keyboard 이벤트)만큼 가운데 창의 아래 여백과 최대 높이를 줄여 창이 위로 비켜 서게 했다.', 'ExportMenu.js, 테스트가 보는 컨테이너 스타일 모양은 그대로 둔다.'],
     [('비포', 'before/2-13-export-keyboard.png', None), ('애프터', 'after/2-13-export-keyboard.png', None)]),
    ('편집기 상단 바 · ‹ 여백 (폰)',
     ['왼쪽 ‹ 가 화면 가장자리에 약 7dp로 붙어 있어 터치하기도 보기에도 답답하다.'],
     ['폰 상단 바 좌우 여백이 8로 같았다. 왼쪽만 본문 여백 14에 맞췄다(코덱스 제안 14dp). TopBar.js 한 줄.'],
     [('비포', 'after/2-12-paper-color-popup.png', (0, 80, 1080, 260)), ('애프터', 'after/2-1-topbar-after.png', (0, 80, 1080, 260))]),
    ('즐겨찾기 별 위치 (폰 · 사용자 결정: 표지 오른쪽 위)',
     ['별이 표지 왼쪽 위에서 제목표와 겹쳐 제목표 첫 글자를 가렸다.'],
     ['별을 표지 오른쪽 위 12dp로 옮겼다(크기 21 그대로). 고무줄 띠와는 일부 겹친다(시안 1 그대로). 스타일 left → right 한 줄.', '코덱스가 권한 28dp 확대 · 표지 밖 이동은 설계 결정에 어긋나 적용하지 않았다.'],
     [('비포', 'before/1-6-grid.png', (230, 440, 1020, 1010)), ('애프터', 'after/1-6-star-right.png', (230, 440, 1020, 1010))]),
    ('레이어 패널 · 도구 막대 (폰 세로 · 사용자 결정)',
     ['레이어 패널이 오른쪽 약 70%를 덮어 왼쪽 아래 되돌리기 · 다시 실행 · 저장됨 막대가 잘렸다.', '도구 막대는 둥근 카드로 떠 있어 상단 바와 따로 놀았다.'],
     ['패널 보이는 폭을 약 290 → 216dp로 줄여 막대가 옆에 온전히 들어오게 했다(폰 세로만).', '도구 막대를 상단 바처럼 화면 폭을 꽉 채운 한 영역으로 바꾸고, 상단 바와의 경계선은 한 줄만 둔다. LayerPanel · PhoneToolbar.'],
     [('비포', 'after/2-4-layers.png', None), ('애프터', 'after/2-4-layers-new.png', None)]),
    ('상태바 띠 · 전면 카메라 자리 (폰 · 사용자 결정)',
     ['맨 위 전면 카메라 자리 약 36dp 띠가 라벤더, 그 아래 본문이 흰색이라 띠가 보였다.'],
     ['글자 · 아이콘 위치는 그대로 두고, 사이드바(바탕 + 오른쪽 선)와 본문 바탕을 맨 위까지 이어서 칠했다(App.js 상단 안전 영역). 편집기 상단은 기존대로.'],
     [('비포', 'after/5-3-trash.png', (0, 0, 1080, 900)), ('애프터', 'after/5-3-trash-new.png', (0, 0, 1080, 900))]),
]

# 가로 편집 오른쪽 도구 막대(그림은 가로 캡처라 따로 둔다)
LANDSCAPE = (
    '가로 편집 · 오른쪽 도구 막대 (폰)',
    ['막대가 지우개에서 끝나 보이지만 아래에 텍스트 · 스티커 · 위젯 · 테이프 · 사진 · 격자가 스크롤 안에 있어, 처음에는 더 있다는 단서가 전혀 없다.'],
    ['스크롤 막대(persistentScrollbar)는 효과가 없어 되돌리고, 더 스크롤할 수 있는 쪽 끝에 옅은 흰 그라데이션을 얹었다(사용자 제안).',
     '라이브러리 없이 8개의 얇은 흰 띠를 겹쳐 만들고 터치는 통과시킨다. 위 · 아래 끝은 스크롤 위치에 따라 따로 나타나고 사라진다. PhoneToolbar.js.'],
    [('비포', 'after/3-1-landscape2.png', None), ('애프터', 'after/3-2-fade-strips.png', None)],
    [('비포 확대', 'after/3-1-landscape2.png', (2000, 380, 2400, 1080)), ('애프터 확대', 'after/3-2-fade-strips.png', (2000, 380, 2400, 1080)),
     ('맨 아래로 스크롤', 'after/3-2-fade-bottom.png', (2000, 0, 2400, 1080))],
)


def prepare(rel, crop, max_h):
    src = SHOTS / rel
    name = rel.replace('/', '-').replace('.png', '') + ('-crop' if crop else '') + '.jpg'
    dst = IMG / name
    with Image.open(src) as im:
        im = im.convert('RGB')
        if crop:
            im = im.crop(crop)
        if im.height > max_h:
            im = im.resize((round(im.width * max_h / im.height), max_h), Image.LANCZOS)
        im.save(dst, 'JPEG', quality=86)
    return f'이미지/{name}'


def fig(label, rel, crop, max_h, css=''):
    path = prepare(rel, crop, max_h)
    return f'<figure class="{css}"><img src="{path}"><figcaption>{html.escape(label)}</figcaption></figure>'


def block(title, symptoms, fixes, figs, landscape=None):
    li = lambda items: ''.join(f'<li>{html.escape(t)}</li>' for t in items)
    out = [f'<section class="page"><h2>{html.escape(title)}</h2>']
    out.append('<div class="text"><h3>증상</h3><ul>' + li(symptoms) + '</ul><h3>원인 · 수정</h3><ul>' + li(fixes) + '</ul></div>')
    out.append('<div class="row">' + ''.join(fig(l, r, c, 1300) for l, r, c in figs) + '</div>')
    if landscape:
        out.append('<div class="row small">' + ''.join(fig(l, r, c, 700) for l, r, c in landscape) + '</div>')
    out.append('</section>')
    return '\n'.join(out)


def main():
    IMG.mkdir(exist_ok=True)
    parts = ['''<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>폰 실기기 점검 — 고친 화면 비포/애프터</title><style>
@page { size: A4 landscape; margin: 10mm; }
body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #0B1766; margin: 0; }
.cover { height: 185mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
.cover h1 { font-size: 30pt; margin: 0 0 6mm; } .cover p { font-size: 13pt; margin: 2mm 0; color: #5360A6; }
.page { page-break-after: always; height: 188mm; display: flex; flex-direction: column; }
h2 { font-size: 16pt; margin: 0 0 3mm; } h3 { font-size: 10pt; margin: 2mm 0 1mm; color: #5360A6; }
.text { font-size: 9.5pt; line-height: 1.45; } .text ul { margin: 0; padding-left: 5mm; }
.row { display: flex; gap: 8mm; justify-content: center; align-items: flex-start; margin-top: 3mm; flex: 1; min-height: 0; }
.row.small { flex: 0 0 auto; margin-top: 2mm; }
figure { margin: 0; text-align: center; height: 100%; display: flex; flex-direction: column; align-items: center; min-height: 0; }
figure img { max-height: 135mm; max-width: 100%; border: 1px solid #D5D9EE; border-radius: 3mm; object-fit: contain; min-height: 0; }
.row.small figure img { max-height: 55mm; }
figcaption { font-size: 9pt; color: #5360A6; margin-top: 1.5mm; }
</style></head><body>
<section class="cover"><h1>폰 실기기 점검<br>고친 화면 비포 · 애프터</h1>
<p>2026-11-03 · 갤럭시 S20 (SM-N981N, 411×914dp) · 개발 빌드 handwritingdev</p>
<p>고친 화면 10곳. 점검 과정과 남은 이상은 01 점검표.md 에 있다.</p></section>''']
    for title, sym, fixes, figs in PAIRS:
        parts.append(block(title, sym, fixes, figs))
    t, sym, fixes, figs, land = LANDSCAPE
    parts.append(block(t, sym, fixes, figs, land))
    parts.append('</body></html>')
    out = HERE / '폰 실기기 점검 비포 애프터.html'
    out.write_text('\n'.join(parts), encoding='utf-8')
    pdf = HERE / '폰 실기기 점검 비포 애프터.pdf'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--window-size=1600,1000', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', out.as_uri()], check=True)
    print('PDF', pdf, pdf.stat().st_size)


if __name__ == '__main__':
    sys.exit(main())
