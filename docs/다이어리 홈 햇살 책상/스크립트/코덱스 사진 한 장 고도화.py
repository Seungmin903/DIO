# -*- coding: utf-8 -*-
"""'사진 한 장 책상' 고도화 2종 — 소품 디테일을 다이어리 표지 수준으로.

1단계 보드: 안마다 소품만 크게 그린 '소품 보드'(1536x1024)를 받는다.   python ... <작업 폴더> board
2단계 화면: 밑그림 + 캐릭터 + 소품 보드를 넣고 화면 4장을 그린다.        python ... <작업 폴더> screens
각 폴더에서 codex exec -i (imgs.txt 순서) 로 out.png 를 받는다. 병렬로 돌리면 그림이 섞인 적이 있어 하나씩 돌린다.
규칙: 2D 일러스트 · 위에서 본 시점 · 소품은 책상에 누워 붙음 · 화이트 · 아이보리 상판 · 십자 창틀 빛.
"""
import importlib.util
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
IMG = HERE / "이미지"
CHAR = HERE.parent / "캐릭터 디자인" / "최종시안.png"
_spec = importlib.util.spec_from_file_location("base", Path(__file__).with_name("코덱스 사진 한 장.py"))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

QUALITY = ('RENDERING QUALITY: refined, high-detail 2D illustration with the same finish as the diary covers in the app screen (fine woven fabric patterns, crisp edges, soft subtle shading). '
           'Objects are NOT cartoon doodles: no thick outlines on objects, crisp fine edges, believable materials drawn with care — glossy photo paper with a faint sheen and thin white border, '
           'instant film with a thicker matte bottom border, a clear rigid PVC toploader with thick rounded transparent edges and soft reflections, washi tape that is slightly translucent with a fine fiber texture and torn ends, '
           'vinyl die-cut stickers with a white border and a slight gloss, epoxy stickers with a domed shine. Soft, low contact shadows toward the lower right. '
           'Only the mascots themselves keep their own character style (black outline, flat fills), because they are printed artwork inside photos and stickers. ')
FLAT = base.FLAT
MASCOTS = base.MASCOTS
BOARDS = {
    '1안 사진 속 디오와 두리': ('Objects, arranged with generous space between them: '
        '(1) a vertical four-cut photo-booth strip on glossy photo paper: four frames showing DIO and DURI posing together in a photo booth with pastel backdrops and tiny booth props (peace sign, cheek to cheek, wink, surprised), each frame a carefully drawn little scene; '
        '(2) an instant photo (polaroid) showing DURI standing in gently falling snow at blue dusk, with soft snowy ground; '
        '(3) a clear rigid toploader holding a DIO photocard (soft pastel lavender background with a subtle holographic sheen), decorated on the plastic with three small glossy epoxy stickers (a heart, a star, a tiny bow); '
        '(4) a short torn piece of butter-yellow washi tape.'),
    '2안 디오와 두리 스티커 탑꾸': ('Objects, arranged with generous space between them: '
        '(1) a polaroid of a pale blue sky with soft clouds, decorated with a vinyl die-cut sticker of DIO in one corner; '
        '(2) a polaroid of a small field of white daisies, decorated with a vinyl die-cut sticker of DURI and a strip of lavender washi tape across the top; '
        '(3) a clear rigid toploader decorated with small glossy epoxy stickers of DIO and DURI emotions (smile, heart eyes, sleepy, wink) and two tiny hearts; '
        '(4) a half-used kiss-cut sticker sheet of DIO and DURI emotion stickers, with two stickers already peeled off leaving their empty cut outlines; '
        '(5) a few short torn pieces of butter-yellow and lavender washi tape with fine patterns.'),
    '3안 누운 디오와 두리 인형': ('Objects, arranged with generous space between them: '
        '(1) a soft plush doll of DIO lying flat on its back on the desk (seen from directly above): butter-yellow minky fabric with a fine soft pile texture and gentle stitched seams, embroidered black dot eyes and smile, a lavender felt bookmark tab, short stubby plush legs; '
        '(2) a soft plush doll of DURI lying on its side, curled a little: white fuzzy round head with embroidered dot eyes, a hand-knitted lavender scarf with visible knit stitches, pale lavender-white plush coat with two button details; '
        '(3) an instant photo (polaroid) of a pale blue sky with soft clouds, as the photo of the day, lying near the dolls; '
        '(4) a short torn piece of lavender washi tape. '
        'The plush dolls keep the exact shapes, proportions and colors of the mascots, translated into soft fabric; they are drawn as refined 2D illustration with soft shading, NOT a 3D render.'),
}
PICK = {  # 화면별로 쓸 소품 (보드 번호)
    '1안 사진 속 디오와 두리': {'태블릿 스와이프': '(1) at the bottom-left, and (2) and (3) at the bottom between the counter and the + button', '태블릿 한눈에': '(1) and (3)', '폰 스와이프': '(2) and (3)', '폰 한눈에': '(3) only'},
    '3안 누운 디오와 두리 인형': {'태블릿 스와이프': '(1) with (4) at the bottom-left, and (2) with (3) at the bottom between the counter and the + button', '태블릿 한눈에': '(1) and (2) lying side by side, with (3)', '폰 스와이프': '(1) and (2) lying side by side', '폰 한눈에': '(2) only'},
    '2안 디오와 두리 스티커 탑꾸': {'태블릿 스와이프': '(1) and (2) at the bottom-left, and (3) with a piece of (5) at the bottom between the counter and the + button', '태블릿 한눈에': '(2) and (3)', '폰 스와이프': '(1) and (3)', '폰 한눈에': '(3) only'},
}


def boards(work: Path) -> None:
    for name, objects in BOARDS.items():
        d = work / f'{name} 소품 보드'
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(CHAR, d / 'char.png')
        prompt = ('Use your built-in image generation tool to create ONE image, using the attached image (char.png) as the mascot reference. '
                  'Save it as a PNG file named "out.png" in the current working directory. Output: 1536x1024 landscape. Do not write code and do not create any other files.\n\n'
                  'A product flat-lay board: a few stationery objects lying flat on a plain ivory desk (#FAF6EE), seen strictly from directly above. '
                  f'{FLAT}{QUALITY}\n\n{MASCOTS}\n\n{objects}\nNo text, letters or logos anywhere.\n')
        (d / 'prompt.txt').write_text(prompt, encoding='utf-8')
        (d / 'imgs.txt').write_text('char.png', encoding='utf-8')
    print('boards', len(BOARDS))


def screens(work: Path) -> None:
    n = 0
    for name in BOARDS:
        board = work / f'{name} 소품 보드' / 'out.png'
        for sname, (ref, size, keep, where) in base.SCREENS.items():
            d = work / f'{name} {sname}'
            d.mkdir(parents=True, exist_ok=True)
            shutil.copy(IMG / ref, d / 'ref.jpg')
            shutil.copy(CHAR, d / 'char.png')
            shutil.copy(board, d / 'board.png')
            prompt = ('Use your built-in image generation tool to EDIT the FIRST attached image (ref.jpg in the current directory). '
                      'The SECOND attached image (char.png) is the mascot reference. The THIRD attached image (board.png) shows the exact objects to use: copy their designs, artwork and rendering quality faithfully, only scaled down. '
                      f'Save the result as a PNG file named "out.png" in the current working directory. Output: {size}. Do not write code and do not create any other files.\n\n'
                      f'The first image is our app screen (a diary library). KEEP EVERY UI ELEMENT EXACTLY AS IT IS: {keep}. Same positions, sizes, colors, shapes and Korean text; '
                      'the filter chips, view switch, search and more buttons, arrows, the floating left menu panel and the bottom tab bar stay translucent white like frosted glass. '
                      'Do not add, remove, restyle, translate or move any UI element. Copy every Korean label character by character exactly as in the first image (for example "여름 방학").\n\n'
                      'Replace ONLY the plain ivory background with an illustrated desk: a flat ivory desk top (#FAF6EE) with only a very faint paper grain; afternoon sunlight through a CROSS-SHAPED window drawn as four soft-edged cream panes (#FFF6DF) '
                      'separated by a thin cross gap, slightly skewed, over the middle of the desk; a few soft pale lavender-grey (#E6E3EF) leaf-shadow silhouettes touch the upper-left pane. '
                      f'{FLAT}{QUALITY}\n\nObjects from the board to use on this screen: {PICK[name][sname]}. Place them only in {where}. '
                      'Each object at most about half the height of the center diary cover; leave clear desk space around every UI element; objects never overlap or touch any UI element, text or diary cover. '
                      'No extra text, letters or logos anywhere except the existing UI.\n')
            (d / 'prompt.txt').write_text(prompt, encoding='utf-8')
            (d / 'imgs.txt').write_text('ref.jpg char.png board.png', encoding='utf-8')
            n += 1
    print('screens', n)




# ---------- 2차 (2026-10-29): 2안 탑로더 → 1안 눈 오는 두리 폴라로이드, 3안 인형 → 평면 일러스트, 쿨톤 상판 ----------
# 보드는 앞 보드를 코덱스로 고쳐 만든다(2안: 탑로더 지우고 1안 폴라로이드 넣기, 3안: 인형만 평면으로). 화면은 screens2, 쿨톤은 cool.
BOARDS_V2 = {
    '2안 스티커 탑꾸 폴라로이드': 'objects: (1) the sky polaroid with the DIO sticker, (2) the daisy polaroid with the DURI sticker and lavender tape, (3) the polaroid of DURI in falling snow, (4) the sticker sheet, (5) the washi tape pieces',
    '3안 누운 인형 평면': 'objects: (1) the flat-illustrated DIO doll, (2) the flat-illustrated DURI doll, (3) the sky polaroid, (4) the lavender washi tape',
}
PICK_V2 = {
    '2안 스티커 탑꾸 폴라로이드': {'태블릿 스와이프': '(1) and (2) at the bottom-left, and (3) with a piece of (5) at the bottom between the counter and the + button', '태블릿 한눈에': '(2) and (3)', '폰 스와이프': '(1) and (3)', '폰 한눈에': '(3) only'},
    '3안 누운 인형 평면': {'태블릿 스와이프': '(1) with (4) at the bottom-left, and (2) with (3) at the bottom between the counter and the + button', '태블릿 한눈에': '(1) and (2) lying side by side, with (3)', '폰 스와이프': '(1) and (2) lying side by side', '폰 한눈에': '(2) only'},
}
COOL = ('Use your built-in image generation tool to EDIT the attached image (src.png in the current directory). Save the result as a PNG file named "out.png" in the current working directory. '
        'Output: the SAME size and aspect ratio as the attached image. Do not write code and do not create any other files.\n\n'
        'Edit ONLY the desk top color: make it slightly whiter and cooler — a clean cool white (#F8F9FB to #F2F4F7, close to the app background #F1F3F7) instead of warm ivory. '
        'The window light panes become a soft neutral white with only a faint hint of warmth; the cross gap and leaf shadows become a soft cool grey-lavender (#E3E4EE). Keep the change subtle.\n'
        'Keep EVERYTHING else exactly identical: every UI element and its Korean text, every diary cover, every object, its artwork, position, size and quality. No new objects, no text changes.\n')


def screens2(work: Path, boards_dir: Path) -> None:
    n = 0
    for name, objs in BOARDS_V2.items():
        for sname, (ref, size, keep, where) in base.SCREENS.items():
            d = work / f'{name} 웜톤 {sname}'
            d.mkdir(parents=True, exist_ok=True)
            shutil.copy(IMG / ref, d / 'ref.jpg')
            shutil.copy(CHAR, d / 'char.png')
            shutil.copy(boards_dir / f'{name} 소품 보드.png', d / 'board.png')
            flat_doll = (' The two dolls lie DIRECTLY on the desk, flat, seen from above, drawn as flat 2D illustration exactly like the THIRD image (not inside a photo, case or tray; not realistic plush).'
                         if '인형' in name else '')
            prompt = ('Use your built-in image generation tool to EDIT the FIRST attached image (ref.jpg in the current directory). '
                      'The SECOND attached image (char.png) is the mascot reference. The THIRD attached image (board.png) shows the exact objects to use: copy their designs, artwork and rendering quality faithfully, only scaled down. '
                      f'Save the result as a PNG file named "out.png" in the current working directory. Output: {size}. Do not write code and do not create any other files.\n\n'
                      f'The first image is our app screen (a diary library). KEEP EVERY UI ELEMENT EXACTLY AS IT IS: {keep}. Same positions, sizes, colors, shapes and Korean text; '
                      'the filter chips, view switch, search and more buttons, arrows, the floating left menu panel and the bottom tab bar stay translucent white like frosted glass. '
                      'Do not add, remove, restyle, translate or move any UI element. Copy every Korean label character by character exactly as in the first image (for example "여름 방학").\n\n'
                      'Replace ONLY the plain ivory background with an illustrated desk: a flat ivory desk top (#FAF6EE) with only a very faint paper grain; afternoon sunlight through a CROSS-SHAPED window drawn as four soft-edged cream panes (#FFF6DF) '
                      'separated by a thin cross gap, slightly skewed, over the middle of the desk; a few soft pale lavender-grey (#E6E3EF) leaf-shadow silhouettes touch the upper-left pane. '
                      f'{FLAT}{QUALITY}\n\nThe board shows these {objs}. Use on this screen: {PICK_V2[name][sname]}.{flat_doll} Place them only in {where}. '
                      'Each object at most about half the height of the center diary cover; leave clear desk space around every UI element; objects never overlap or touch any UI element, text or diary cover. '
                      'No extra text, letters or logos anywhere except the existing UI.\n')
            (d / 'prompt.txt').write_text(prompt, encoding='utf-8')
            (d / 'imgs.txt').write_text('ref.jpg char.png board.png', encoding='utf-8')
            n += 1
    print('screens2', n)


def cool(work: Path, sources: list) -> None:
    """웜톤 완성본 → 상판만 쿨톤으로 고친 판. sources: 웜톤 png 경로 목록"""
    for src in sources:
        src = Path(src)
        d = work / src.stem.replace('웜톤', '쿨톤')
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, d / 'src.png')
        (d / 'prompt.txt').write_text(COOL, encoding='utf-8')
        (d / 'imgs.txt').write_text('src.png', encoding='utf-8')
    print('cool', len(sources))


if __name__ == '__main__':
    mode = sys.argv[2]
    if mode == 'board': boards(Path(sys.argv[1]))
    elif mode == 'screens': screens(Path(sys.argv[1]))
    elif mode == 'screens2': screens2(Path(sys.argv[1]), Path(sys.argv[3]))
    elif mode == 'cool': cool(Path(sys.argv[1]), sys.argv[3:])
