# -*- coding: utf-8 -*-
"""'사진 한 장 책상' 디벨롭 3종 × (태블릿 · 폰) × (스와이프 · 한눈에) — 2D 그래픽, 모아 · 디오를 녹인다.

밑그림: 이미지/밑그림 U3.jpg · 밑그림 한눈에 U3.jpg · 밑그림 폰 U3.jpg · 밑그림 폰 한눈에 U3.jpg (스크립트/렌더.py "U3")
실행:   python "docs/다이어리 홈 햇살 책상/스크립트/코덱스 사진 한 장.py" <작업 폴더> [이름에 들어갈 글자]
        폴더마다 ref.jpg · char.png · prompt.txt 를 만든다. 각 폴더에서 codex exec -i ref.jpg -i char.png 로 out.png 를 받는다.
        병렬로 돌리면 다른 작업의 그림이 섞인 적이 있어 하나씩 돌린다.
"""
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
IMG = HERE / "이미지"
CHAR = HERE.parent / "캐릭터 디자인" / "지난 버전" / "2026-11-04 최종시안" / "최종시안.png"

SCREENS = {
    '태블릿 스와이프': ('밑그림 U3.jpg', '1536x1024 landscape, full bleed (no added margins or bands)',
        'the left menu bar, the title "모든 다이어리", the three filter chips ("모든 다이어리", "즐겨찾기", "공유 다이어리"), the view switch ("스와이프", "한눈에"), the search and more buttons, '
        'the two round arrow buttons, the three diary covers with their printed labels ("여름 방학", "새 다이어리", "테스트용 다이어리", "DIARY · 2026") and the edit and star buttons on the center cover, '
        'the text under the covers ("새 다이어리", "78페이지", "여름 방학", "24페이지", "테스트용 다이어리", "4페이지"), the red trash icon, the "2 / 3" counter and the blue "+" button',
        'the empty desk at the bottom-left (below the left diary text) and the empty desk at the bottom between the "2 / 3" counter and the "+" button'),
    '태블릿 한눈에': ('밑그림 한눈에 U3.jpg', '1536x1024 landscape, full bleed (no added margins or bands)',
        'the left menu bar, the title, the filter chips, the view switch ("스와이프", "한눈에"), the search and more buttons, the eight diary covers in two rows with their printed labels, '
        'their edit and star buttons, the titles and page counts under each cover, the red trash icons and the blue "+" button',
        'ONLY the large empty desk area to the right of the second row of diaries (left of and above the "+" button); nothing between or over the diaries'),
    '폰 스와이프': ('밑그림 폰 U3.jpg', 'portrait with the SAME aspect ratio as the attached screen (tall phone screen); keep the whole screen visible without stretching or cropping',
        'the status bar, the title "모든 다이어리", the view switch, the three filter chips, the search and more icons, the diary cover with its printed label ("새 다이어리", "DIARY · 2026") and its edit and star buttons, '
        'the text "새 다이어리" and "78페이지", the red trash icon, the "2 / 3" counter, the blue "+" button and the bottom tab bar with the bell and the tabs "다이어리", "즐겨찾기", "내 공간", "휴지통"',
        'the empty desk between the "2 / 3" counter and the bottom tab bar, left of the "+" button'),
    '폰 한눈에': ('밑그림 폰 한눈에 U3.jpg', 'portrait with the SAME aspect ratio as the attached screen (tall phone screen); keep the whole screen visible without stretching or cropping',
        'the status bar, the title, the view switch, the filter chips, the search and more icons, the four diary covers in two rows with their printed labels, edit and star buttons, titles, page counts and trash icons, '
        'the blue "+" button and the bottom tab bar with the bell and the tabs "다이어리", "즐겨찾기", "내 공간", "휴지통"',
        'ONLY the small empty desk strip below the second row of diaries and above the bottom tab bar, left of the "+" button; keep the objects small'),
}

STYLE = ('STYLE: flat 2D vector illustration in the same style as the SECOND attached image (our mascot sheet): clean simple shapes, flat color fills, uniform dark outlines (#1F1F1F) on every drawn object, '
         'no 3D rendering, no photographic textures, no realistic depth of field, no glossy highlights. '
         'The desk is a flat ivory plane (#FAF6EE) with only a very faint paper grain. Afternoon sunlight through a CROSS-SHAPED window is drawn as four flat, soft-edged cream panes (#FFF6DF) separated by a thin cross gap, '
         'slightly skewed, over the middle of the desk; a few flat pale lavender-grey (#E6E3EF) leaf-shadow silhouettes touch the upper-left pane. '
         'Every diary cover keeps its existing flat look; give each object and cover only a flat, soft offset shadow (#E8E1D5) toward the lower right. ')
# 다이어리가 책상에 붙어 누워 있으므로 소품도 모두 누워 붙는다 (2026-10-29 요청)
FLAT = ('VIEW: strictly top-down, looking straight down at the desk, exactly like the diary covers. EVERYTHING LIES FLAT ON THE DESK: '
        'no standing objects, no standees, no figures standing up, no side views, no perspective, no tilted 3D objects. Each object is a flat thing lying on the desk surface '
        '(photos, paper, stickers, tape, a flat toploader), with only a thin flat contact shadow. ')
MASCOTS = ('The mascots are exactly the two characters in the SECOND attached image: MOA, a butter-yellow (#FEF0BF) book with a lavender bookmark tab, dot eyes, a small smile and two short legs; '
           'and DIO, a white round-headed snowman-like friend with dot eyes, a lavender (#DBDCF9) scarf, a pale lavender-white coat with two round buttons and short legs. '
           'Keep their proportions, black outlines and flat colors exactly; only small changes in pose or expression (smile, wink, heart eyes) are allowed. ')
VARIANTS = {
    '1안 사진 속 모아와 디오': ('Theme: today\'s photos on the desk, and the mascots appear INSIDE the photos. '
        'Objects: a vertical four-cut photo-booth strip whose frames show MOA and DIO posing together on pastel booth backgrounds (peace sign, cheek to cheek, wink, surprised); '
        'an instant photo (polaroid) of DIO in gently falling snow; a clear photocard toploader holding a MOA photocard decorated with tiny heart and star stickers. '
        'Photos are drawn flat, not photographic.'),
    '2안 사진을 꾸미는 모아와 디오': ('Theme: the mascots decorate today\'s photo together (like friends decorating one photo in our app), shown as flat PAPER CUT-OUTS of MOA and DIO lying on the desk. '
        'Objects: a polaroid with a flat illustrated pale-blue sky; a paper cut-out of DIO lies right next to it, its little hand under a short strip of lavender washi tape that also holds down the polaroid corner; '
        'a paper cut-out of MOA lies beside a four-cut photo strip of simple flat flower and sky pictures, with a small heart sticker just placed on the strip near MOA\'s hand. '
        'The cut-outs are flat paper with a thin white paper edge, lying flat, seen from above, small (about one third of the center diary height).'),
    '3안 모아와 디오 스티커 탑꾸': ('Theme: scrapbook / toploader decorating (탑꾸) with mascot stickers, no standing characters. '
        'Objects: two polaroids with flat illustrated sky and flower pictures, decorated with die-cut STICKERS of MOA and DIO (white sticker border around each character); '
        'a clear photocard toploader decorated with small MOA and DIO emotion stickers (smile, heart eyes, sleepy, wink) and two tiny heart stickers; a few short pieces of butter-yellow and lavender washi tape.'),
}
SMALL = {'태블릿 한눈에': 'Use only two of the objects so the area does not get crowded. ', '폰 스와이프': 'Use only two small objects. ', '폰 한눈에': 'Use only ONE small object. '}


def main(work: Path, only: str = '') -> None:
    n = 0
    for vname, theme in VARIANTS.items():
        for sname, (ref, size, keep, where) in SCREENS.items():
            name = f'{vname} {sname}'
            if only and only not in name:
                continue
            d = work / name
            d.mkdir(parents=True, exist_ok=True)
            shutil.copy(IMG / ref, d / 'ref.jpg')
            shutil.copy(CHAR, d / 'char.png')
            prompt = ('Use your built-in image generation tool to EDIT the FIRST attached image (ref.jpg in the current directory), using the SECOND attached image (char.png) as the style and mascot reference. '
                      f'Save the result as a PNG file named "out.png" in the current working directory. Output: {size}. Do not write code and do not create any other files.\n\n'
                      f'The first image is our app screen (a diary library). KEEP EVERY UI ELEMENT EXACTLY AS IT IS: {keep}. Same positions, sizes, colors, shapes and Korean text; '
                      'the filter chips, view switch, search and more buttons, arrows, the floating left menu panel and the bottom tab bar stay translucent white like frosted glass. '
                      'Do not add, remove, restyle, translate or move any UI element. Copy every Korean label character by character exactly as in the first image (for example "여름 방학").\n\n'
                      f'Replace ONLY the plain ivory background with an illustrated desk. {STYLE}{FLAT}\n\n{MASCOTS}\n\n{theme} {SMALL.get(sname, "")}'
                      f'Place the objects only in {where}. Keep objects modest: each object at most about half the height of the center diary cover, and leave clear desk space around every UI element; objects never overlap or touch any UI element, text or diary cover. No extra text, letters or logos anywhere except the existing UI.\n')
            (d / 'prompt.txt').write_text(prompt, encoding='utf-8')
            (d / 'imgs.txt').write_text('ref.jpg char.png', encoding='utf-8')
            n += 1
    print('jobs', n)


if __name__ == '__main__':
    main(Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else '')
