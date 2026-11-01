# -*- coding: utf-8 -*-
"""책상 시안 3차 — 태블릿 가로 스와이프 4안. 코덱스가 상판과 소품을 그리고, 화면은 실제 앱 UI 층을 얹어 합친다.

1) 작업 만들기: python "코덱스 책상 3차.py" make <작업 폴더> <참고 표지.png>
   안마다 '<안> 상판'(소품 없는 빈 책상 + 오후 3시 창빛)과 '<안> 소품'(소품 보드, 마젠타 바탕) 폴더. 각 폴더에서 codex exec 로 out.png 를 받는다(하나씩).
2) 소품 나누기: python "코덱스 책상 3차.py" split <작업 폴더> <결과 폴더>
   소품 보드의 마젠타 바탕을 지우고 덩어리마다 투명 PNG 로 자른다 → <결과>/소품/<안>/<이름>.png
규칙: 위에서 내려다본 2D 일러스트 · 소품은 누워 붙음 · 화이트/아이보리 상판 · 십자 창틀 빛 · 시간은 오후 3시 하나로 고정.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent.parent
CHAR = HERE.parent / '캐릭터 디자인' / '최종시안.png'

MASCOTS = ('MASCOTS — copy them EXACTLY from the attached character sheet (char.png), never redesign them: '
           'MOA is a butter-yellow (#FEF0BF) rectangular book with rounded corners, a thin page block on its right side, a small lavender (#DBDCF9) bookmark tab sticking out at the upper right, '
           'two black dot eyes and a tiny smile in the middle, and two short stubby legs; DIO is a snowman-like friend with a big round white head, two black dot eyes and no mouth, '
           'a lavender (#DBDCF9) scarf whose end hangs down to the right, a pale lavender-white bell-shaped coat with two round outlined buttons, and two short lavender legs. '
           'NEITHER MOA NOR DIO HAS ARMS OR HANDS — never add arms, hands, fingers or peace signs; they pose only by leaning, tilting, winking or standing close. '
           'Both have clean black outlines of even weight and flat fills. Same proportions as the sheet: MOA\'s book body is almost square, about 0.9 times as wide as it is tall (never tall and slim), with legs about one fifth of the body height; DIO\'s head is about one third of his height. '
           'Only tiny pose or expression changes are allowed (wink, closed happy eyes). When a mascot is printed on an object, it is a small faithful print of this artwork. ')

VIEW = ('VIEW: a pure top-down (orthographic) view, looking straight down at a desk, like a flat-lay photo turned into illustration. Every object lies flat on the desk. '
        'Objects with real thickness (a tape roll, a keycap, an acrylic block, a binder clip) show ONLY their top face plus a thin rim; thickness is suggested by gentle inner shading on the rim, '
        'never by side views or tilted perspective. Light comes from the upper left. ')

QUALITY = ('RENDERING: refined 2D illustration with the same finish as the attached diary cover (cover.png): crisp fine edges, soft subtle shading, delicate fabric and paper textures, muted pastel colors. '
           'No thick outlines on objects (only the mascot artwork keeps its black outlines). Believable materials: glossy instant film with a thicker matte bottom border, '
           'slightly translucent washi tape with a fine fiber texture and softly torn ends, vinyl die-cut stickers with a white border and a faint gloss, '
           'thick acrylic with frosted milky edges and a soft highlight, a matte plastic keycap with a slightly concave top, painted metal binder clips with silver wire handles folded flat. ')

PALETTE = 'PALETTE: butter yellow, lavender, soft sky blue, cream, warm white, a touch of sage. Avoid pink, magenta and red so the props match the app. '

DESK = ('Use your built-in image generation tool to create ONE image. Save it as a PNG file named "out.png" in the current working directory. Output: 1536x1024 landscape. '
        'Do not write code and do not create any other files.\n\n'
        'An EMPTY desk top seen strictly from directly above, filling the whole frame edge to edge (no desk edges, no walls, no objects, no text). '
        '{surface}\n'
        'LIGHT (fixed time: 3 PM): warm afternoon sunlight comes through a CROSS-SHAPED window from the upper left and falls on the desk as four large soft-edged cream-gold panes (#FFF3D6) '
        'separated by a thin cross-shaped window-frame shadow, slightly skewed and elongated toward the lower right, covering the middle and left-middle of the frame. '
        'A few soft, out-of-focus leaf-shadow silhouettes in pale lavender-grey (#E4E1EC) touch the upper-left pane. Everything outside the light is the plain desk color in soft shade. '
        'The light is gentle and airy, not high contrast: the desk must stay light enough for white UI panels and a pastel diary to sit on it. '
        'Refined 2D illustration, not a photo, with a delicate visible material texture.\n')

BOARD = ('Use your built-in image generation tool to create ONE image. The FIRST attached image (char.png) is the mascot character sheet; the SECOND (cover.png) is a diary cover from our app that sets the rendering quality. '
         'Save the result as a PNG file named "out.png" in the current working directory. Output: 1536x1024 landscape. Do not write code and do not create any other files.\n\n'
         'A product sheet of separate desk-decor props for a Korean teen/twenties desk-terior (데스크테리어) mood, laid out in a loose grid with WIDE empty gaps between them (no prop touches another, '
         'every prop fully inside the frame with a margin). Each prop is drawn upright (not rotated), large and detailed.\n'
         'BACKGROUND: a perfectly flat pure magenta (#FF00FF) everywhere around the props, with no gradient, no texture, no shadows and no reflections. '
         'No part of any prop is see-through: clear plastic or acrylic is drawn as frosted milky white so the magenta never shows through. No shadows under the props.\n\n'
         f'{VIEW}{QUALITY}{PALETTE}\n{MASCOTS}\n\nPROPS:\n{{props}}\nNo text, letters, numbers or logos anywhere.\n')

VARIANTS = {
    '1안 버터 오후 원목': {
        'surface': ('SURFACE: a very pale white-washed oak desk top (#F6EFE2 to #F2EADB) with a fine, straight, soft wood grain running left to right and a few faint growth rings; '
                    'satin finish, warm ivory, calm and clean.'),
        'props': ['(1) an instant photo (polaroid) whose picture shows MOA and DIO sitting side by side on a butter-yellow gingham picnic blanket under a pale sky',
                  '(2) a flat roll of butter-yellow gingham washi tape seen from above (a ring with a kraft-paper core)',
                  '(3) a short softly torn strip of the same butter gingham washi tape',
                  '(4) a butter-yellow painted metal binder clip seen from above, silver wire handles folded flat',
                  '(5) a keycap keyring: a white keycap whose top shows a small print of DIO\'s face, with a small silver split ring and a short ball chain lying in a gentle curve',
                  '(6) a die-cut vinyl sticker of the full MOA character with a white border'],
    },
    '2안 아이보리 리넨 매트': {
        'surface': ('SURFACE: a warm white desk top (#F8F5EF) mostly covered by a large ivory linen desk mat (#F3EDE1) with a visible fine woven linen texture and a neat stitched edge; '
                    'the mat\'s left and bottom edges run just inside the frame so a little white desk shows around it.'),
        'props': ['(1) an acrylic korotto (thick clear acrylic block figure) of MOA lying flat on its back, full-body MOA print, frosted milky edges with a soft highlight',
                  '(2) a small kiss-cut sticker sheet of tiny MOA and DIO stickers (smiling, winking, sleepy) on a pale lavender backing, two stickers already peeled off leaving empty cut outlines',
                  '(3) a flat roll of lavender washi tape with tiny white dots seen from above (a ring with a kraft-paper core)',
                  '(4) a short softly torn strip of the same lavender dot washi tape',
                  '(5) two gold paper clips: one classic, one heart-shaped',
                  '(6) an instant photo (polaroid) of a soft blue sky with small clouds, with a die-cut DIO sticker on its lower-right corner'],
    },
    '3안 화이트 종이결': {
        'surface': ('SURFACE: a clean cool-white painted desk top (#F5F6F8 to #EFF1F5) with a fine, soft cotton-paper grain texture and very faint brush marks; '
                    'quiet and modern, cool white with just a hint of warmth inside the sunlight.'),
        'props': ['(1) two keycap keyrings on one silver ring with a tiny star charm: a butter-yellow keycap with a small print of MOA\'s face and a white keycap with a small print of DIO\'s face',
                  '(2) a sky-blue painted metal binder clip seen from above, silver handles folded flat, clipping the top edge of two slightly offset stacked instant photos: one of a snowy evergreen forest at blue dusk, one of soft clouds',
                  '(3) a die-cut vinyl sticker of the full DIO character with a white border',
                  '(4) a short softly torn strip of sage-and-cream check washi tape',
                  '(5) a small acrylic korotto of DIO lying flat on its back, frosted milky edges with a soft highlight'],
    },
    '4안 크림 가죽 데스크패드': {
        'surface': ('SURFACE: a soft ivory desk top (#F7F2E8) mostly covered by a large cream vegan-leather desk pad (#EFE6D6) with a fine pebbled leather texture, slightly rounded corners and a tone-on-tone stitched border; '
                    'the pad\'s left and bottom edges run just inside the frame so a little ivory desk shows around it.'),
        'props': ['(1) a vertical four-cut photo-booth strip: four frames of MOA and DIO together on pastel backgrounds (leaning cheek to cheek, both winking, DIO peeking from behind MOA, both with happy closed eyes), drawn flat in the mascot style, no arms',
                  '(2) a pair of acrylic korotto lying flat side by side: MOA and DIO, full-body prints copied exactly from the character sheet (no arms), frosted milky edges with a soft highlight',
                  '(3) a small butter-yellow painted metal binder clip seen from above, silver handles folded flat',
                  '(4) two short softly torn strips of washi tape: butter gingham and lavender',
                  '(5) a gold heart-shaped paper clip',
                  '(6) two tiny die-cut vinyl stickers: a lavender heart and a MOA face'],
    },
}
# 소품 보드에서 잘린 순서(위 줄 왼쪽부터)대로 붙이는 이름. 결과를 보고 적는다. 개수가 다르면 번호로 남긴다.
NAMES = {
    '1안 버터 오후 원목': ['폴라로이드 모아와 디오 소풍', '마스킹테이프 롤 버터 깅엄', '마스킹테이프 조각 버터 깅엄', '스티커 모아', '바인더 클립 버터', '키캡 키링 디오'],
    '2안 아이보리 리넨 매트': ['스티커 시트 모아와 디오', '마스킹테이프 롤 라벤더 도트', '스티커 모아', '폴라로이드 하늘 디오 스티커', '종이 클립 골드', '하트 클립 골드', '마스킹테이프 조각 라벤더 도트'],
    '4안 크림 가죽 데스크패드': ['네컷 사진 모아와 디오', '아크릴 코롯토 디오', '바인더 클립 버터', '아크릴 코롯토 모아', '스티커 하트 라벤더', '마스킹테이프 조각 버터 깅엄', '하트 클립 골드', '스티커 모아 얼굴', '마스킹테이프 조각 라벤더'],
    '3안 화이트 종이결': ['폴라로이드 두 장 하늘색 바인더 클립', '키캡 키링 모아와 디오', '스티커 디오', '아크릴 코롯토 디오', '마스킹테이프 조각 세이지 체크'],
}
MAGENTA = np.array([255, 0, 255], dtype=np.float32)


def make(work: Path, cover: Path) -> None:
    for name, v in VARIANTS.items():
        d = work / f'{name} 상판'
        d.mkdir(parents=True, exist_ok=True)
        (d / 'prompt.txt').write_text(DESK.format(surface=v['surface']), encoding='utf-8')
        (d / 'imgs.txt').write_text('', encoding='utf-8')
        d = work / f'{name} 소품'
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(CHAR, d / 'char.png')
        shutil.copy(cover, d / 'cover.png')
        (d / 'prompt.txt').write_text(BOARD.format(props='\n'.join(v['props'])), encoding='utf-8')
        (d / 'imgs.txt').write_text('char.png cover.png', encoding='utf-8')
    print('jobs', len(VARIANTS) * 2)


def magenta_alpha(rgb: np.ndarray) -> np.ndarray:
    """마젠타를 모두 지운다(테이프 심 · 클립 고리 안쪽 구멍까지). 소품에는 분홍을 쓰지 않게 했다.
    경계의 섞인 색은 마젠타 거리로 부분 투명 + 마젠타 번짐 제거."""
    dist = np.linalg.norm(rgb - MAGENTA, axis=2)
    alpha = np.clip((dist - 50) / 100, 0, 1)
    keep = alpha[..., None]
    color = np.where(keep > 0, (rgb - (1 - keep) * MAGENTA) / np.maximum(keep, 1e-3), 0)
    # 가장자리 몇 px 의 분홍 기 걷어 내기: R · B 가 G 보다 높은 만큼 빼 준다 (금속 · 흰 테두리에 남는 마젠타)
    from scipy import ndimage
    edge = ndimage.binary_dilation(alpha < 0.99, iterations=3)
    spill = np.clip(np.minimum(color[..., 0], color[..., 2]) - color[..., 1], 0, None) * edge
    # 반투명 아크릴 테두리처럼 바탕이 비친 분홍(R · B 가 G 보다 확실히 높음)은 안쪽에서도 걷는다. 라벤더는 R - G 가 작아 남는다
    pink = (color[..., 0] - color[..., 1] > 12) & (color[..., 2] - color[..., 1] > 12)
    spill = np.where(pink, np.clip(np.minimum(color[..., 0], color[..., 2]) - color[..., 1], 0, None), spill)
    color[..., 0] -= spill
    color[..., 2] -= spill
    return np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)


def split(work: Path, out: Path) -> None:
    from scipy import ndimage
    for name in VARIANTS:
        src = work / f'{name} 소품' / 'out.png'
        if not src.exists():
            print('missing', name); continue
        rgba = magenta_alpha(np.asarray(Image.open(src).convert('RGB')).astype(np.float32))
        solid = ndimage.binary_dilation(rgba[..., 3] > 24, iterations=6)  # 끈 · 고리처럼 가는 부분도 한 덩어리로
        labels, n = ndimage.label(solid)
        dest = out / name
        dest.mkdir(parents=True, exist_ok=True)
        pieces = []
        for i, sl in enumerate(ndimage.find_objects(labels), 1):
            ys, xs = sl
            if (ys.stop - ys.start) * (xs.stop - xs.start) < 40 * 40:
                continue  # 부스러기
            piece = rgba[ys, xs].copy()
            piece[..., 3] = np.where(labels[ys, xs] == i, piece[..., 3], 0)
            pad = 6
            canvas = np.zeros((piece.shape[0] + pad * 2, piece.shape[1] + pad * 2, 4), np.uint8)
            canvas[pad:-pad, pad:-pad] = piece
            pieces.append(canvas)
        names = NAMES.get(name)
        if not names or len(names) != len(pieces):
            names = [f'{k:02d}' for k in range(1, len(pieces) + 1)]
        for label, canvas in zip(names, pieces):
            Image.fromarray(canvas).save(dest / f'{label}.png', optimize=True)
        print(name, len(pieces), names)


if __name__ == '__main__':
    mode, work = sys.argv[1], Path(sys.argv[2])
    if mode == 'make':
        make(work, Path(sys.argv[3]))
    elif mode == 'split':
        split(work, Path(sys.argv[3]))
