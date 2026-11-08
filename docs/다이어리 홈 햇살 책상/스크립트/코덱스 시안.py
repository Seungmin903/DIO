# -*- coding: utf-8 -*-
"""코덱스 시안 8종 × 태블릿 · 폰 — 밑그림(지금 앱 화면 + 버튼 처리) 위에 코덱스가 책상 장면을 그린다.

밑그림: 이미지/밑그림 <U0~U3>.jpg · 밑그림 폰 <U0~U3>.jpg (스크립트/렌더.py "밑그림")
실행:   python "docs/다이어리 홈 햇살 책상/스크립트/코덱스 시안.py" [작업 폴더]   ← 작업 폴더에 장면마다 ref.jpg · prompt.txt 를 만든다
        각 폴더에서 codex exec -i ref.jpg (+ char.png) 로 out.png 를 받아 '코덱스 시안/<번호 이름> <기기>.png' 로 옮긴다.
UI 처리: U0 지금 그대로 · U1 떠 있는 레일(폰은 떠 있는 아래 탭) · U2 + 오른쪽 위 버튼을 한 막대로 · U3 + 반투명 유리 버튼
"""
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
IMG = HERE / "이미지"
CHAR = HERE.parent / "캐릭터 디자인" / "지난 버전" / "2026-11-04 최종시안" / "최종시안.png"

KEEP_T = ('KEEP EVERY UI ELEMENT EXACTLY AS IT IS: the left menu bar and its icons, the title "모든 다이어리", the three filter chips ("모든 다이어리", "즐겨찾기", "공유 다이어리"), '
          'the view switch ("스와이프", "한눈에"), the search and more buttons, the two round arrow buttons, the three diary covers with their printed labels ("여름 방학", "새 다이어리", "테스트용 다이어리", "DIARY · 2026"), '
          'the edit and star buttons on the center cover, the text under the covers ("새 다이어리", "78페이지", "여름 방학", "24페이지", "테스트용 다이어리", "4페이지"), the red trash icon, the "2 / 3" counter and the blue "+" button. '
          'Same positions, sizes, colors, shapes and Korean text. Do not add, remove, restyle, translate or move any UI element.')
KEEP_P = ('KEEP EVERY UI ELEMENT EXACTLY AS IT IS: the status bar, the title "모든 다이어리", the view switch, the three filter chips ("모든 다이어리", "즐겨찾기", "공유 다이어리"), the search and more icons, '
          'the diary cover with its printed label ("새 다이어리", "DIARY · 2026") and its edit and star buttons, the text "새 다이어리" and "78페이지", the red trash icon, the "2 / 3" counter, the blue "+" button, '
          'and the white bottom tab bar with the bell and the tabs "다이어리", "즐겨찾기", "내 공간", "휴지통". Same positions, sizes, colors, shapes and Korean text. Do not add, remove, restyle, translate or move any UI element.')
DESK = ('Replace ONLY the plain ivory background with a desk scene: top-down view of a clean WHITE-IVORY desk top (#FAF6EE to #F4EEE3), matte, with an extremely subtle pale wood grain; '
        'modern, calm, minimal Korean stationery mood. ')
WINDOW = ('Warm afternoon sunlight comes through a window with a clearly visible CROSS-SHAPED frame: four soft bright cream panes separated by a thin cross-shaped shadow, slightly skewed, '
          'falling on the middle of the desk and passing softly over the center diary cover. Soft plant-leaf shadows overlap the upper-left pane. ')
END = ('Objects are small, sit only in empty desk areas and never under or over any UI element. The diary covers rest on the desk with soft natural contact shadows toward the lower right. '
       'Clean, soft, slightly illustrative realism that matches the flat UI; not a busy photo; no vignette; no extra text, letters or logos anywhere except the existing UI.')
FLOAT = {'태블릿': 'The left menu bar is a floating white rounded panel; the desk continues behind and around it (no solid strip behind it). ',
         '폰': 'The bottom tab bar floats; the desk continues behind and around it (no solid strip behind it). '}
CHARS = ('the two characters from the SECOND attached image (a butter-yellow book character with small legs and a white snowman-like character with a lavender scarf; '
         'thick black outlines, flat colors; copy them faithfully, do not redesign them)')

# 번호 이름: (UI 처리, 빛, 태블릿 소품, 폰 소품)
CONCEPTS = {
    '01 아이보리 햇살': ('U0', WINDOW,
        'Objects: a small clear glass vase with two butter-yellow tulips near the bottom-left, and a white ceramic mug near the bottom between the counter and the + button.',
        'Objects: a small clear glass vase with two butter-yellow tulips at the bottom-left above the tab bar.'),
    '02 떠 있는 레일': ('U1', WINDOW,
        'Objects: a small clear glass vase with two butter-yellow tulips near the bottom-left, and a white ceramic mug near the bottom between the counter and the + button.',
        'Objects: a small clear glass vase with two butter-yellow tulips at the bottom-left; their soft shadow passes under the floating tab bar.'),
    '03 기록하는 책상': ('U2', WINDOW,
        'Objects (reading and writing): a closed paperback book wrapped in an oatmeal linen book cover with a thin ribbon bookmark at the bottom-left, a slim fountain pen and a roll of cream washi tape near the bottom between the counter and the + button.',
        'Objects: a paperback book in an oatmeal linen book cover with a ribbon bookmark at the bottom-left, and a slim fountain pen beside it.'),
    '04 사진 한 장 책상': ('U3', WINDOW,
        'Objects (photos): a vertical four-cut photo-booth strip with soft pastel blurred photos (no recognizable faces) at the bottom-left, an instant photo of a pale blue sky, and a clear photocard toploader decorated with a few tiny stickers near the bottom between the counter and the + button. '
        'The filter chips, view switch, search, more and arrow buttons and the left menu panel look like frosted white glass: the desk light softly shows through them.',
        'Objects: a four-cut photo-booth strip with soft pastel blurred photos (no faces) and an instant sky photo at the bottom-left. The bottom tab bar, filter chips and view switch look like frosted white glass.'),
    '05 모아와 디오': ('U1', WINDOW,
        f'Objects: a clear acrylic standee printed with {CHARS}, standing in the empty area at the bottom-right left of the + button; a small plush keyring of the yellow book character and a small die-cut sticker sheet near the bottom-left.',
        f'Objects: a clear acrylic standee printed with {CHARS}, at the bottom-left above the tab bar.'),
    '06 리본 레이스': ('U1', WINDOW,
        'Objects (soft romantic accent, very restrained): a round white lace doily under a white cup of tea near the bottom between the counter and the + button, a loose cream satin ribbon and a small pearl hair clip near the bottom-left. One soft butter-yellow accent only.',
        'Objects: a round white lace doily under a white teacup and a loose cream satin ribbon at the bottom-left above the tab bar.'),
    '07 말차 오후': ('U1', WINDOW.replace('Soft plant-leaf shadows', 'Soft, slightly green-tinted plant-leaf shadows'),
        'Objects: a glass of iced matcha latte with visible green and milk layers near the bottom between the counter and the + button, a tiny potted green plant and a roll of sage-green washi tape near the bottom-left. Sage green is the only accent color.',
        'Objects: a glass of iced matcha latte and a tiny potted green plant at the bottom-left above the tab bar.'),
    '08 저녁 무드등': ('U1',
        'It is evening: no window light. A small cream mushroom-shaped table lamp casts a warm amber glow that pools softly over the middle of the desk and the center diary; the rest of the ivory desk is in gentle dusk shade (still light, not dark). ',
        'Objects: the small cream mushroom-shaped lamp near the bottom-left, and a small white mug near the bottom between the counter and the + button.',
        'Objects: only a small cream mushroom-shaped lamp at the bottom-left above the tab bar, glowing warmly.'),
}
SIZE = {'태블릿': '1536x1024 landscape',
        '폰': 'portrait, the SAME aspect ratio as the attached screen (a tall phone screen); if you must pick a fixed size use 1024x1536, but keep the whole screen visible without stretching or cropping the UI'}


def main(work: Path) -> None:
    for name, (ui, light, obj_t, obj_p) in CONCEPTS.items():
        for dev, obj, keep in (('태블릿', obj_t, KEEP_T), ('폰', obj_p, KEEP_P)):
            d = work / f'{name} {dev}'
            d.mkdir(parents=True, exist_ok=True)
            shutil.copy(IMG / (f'밑그림 {ui}.jpg' if dev == '태블릿' else f'밑그림 폰 {ui}.jpg'), d / 'ref.jpg')
            imgs = ['ref.jpg']
            if '모아' in name:
                shutil.copy(CHAR, d / 'char.png')
                imgs.append('char.png')
            ref_note = ' using the SECOND attached image (char.png) only as the character reference' if len(imgs) > 1 else ''
            prompt = (f'Use your built-in image generation tool to EDIT the FIRST attached image (ref.jpg in the current directory){ref_note}. '
                      f'Save the result as a PNG file named "out.png" in the current working directory. Output: {SIZE[dev]}. Do not write code and do not create any other files.\n\n'
                      f'The attached image is an app screen (a diary library). {keep}\n\n{DESK}{FLOAT[dev] if ui != "U0" else ""}{light}{obj} {END}\n')
            (d / 'prompt.txt').write_text(prompt, encoding='utf-8')
            (d / 'imgs.txt').write_text(' '.join(imgs), encoding='utf-8')
    print('jobs', len(CONCEPTS) * 2)


if __name__ == '__main__':
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / '스크립트' / '코덱스 작업')
