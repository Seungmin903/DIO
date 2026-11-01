# -*- coding: utf-8 -*-
"""소품 보드의 요소를 하나씩 투명 배경 PNG로.

1) 작업 만들기: python "스크립트/코덱스 요소.py" <작업 폴더> make <1안 보드.png> <2안 보드.png> <3안 보드.png>
   폴더마다 board.png · prompt.txt — 코덱스가 요소 하나를 1024x1024 가운데에 크게 다시 그린다(투명 배경, 안 되면 순수 마젠타 바탕).
2) 투명 처리:   python "스크립트/코덱스 요소.py" <작업 폴더> key <결과 폴더>
   out.png 가 이미 투명하면 그대로, 마젠타 바탕이면 테두리에서 이어진 마젠타만 지우고(물체 안의 분홍은 남김) 가장자리 색 번짐을 걷어 낸 뒤 여백을 잘라 저장한다.
"""
import shutil
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

# 이름: (보드 번호, 보드에서 고를 요소 설명)
ELEMENTS = {
    '네컷 사진 모아와 디오': (1, 'the vertical four-cut photo-booth strip with MOA and DIO posing in four frames'),
    '폴라로이드 눈 오는 디오': (1, 'the instant photo (polaroid) of DIO standing in falling snow at blue dusk'),
    '탑로더 모아 포토카드': (1, 'the clear rigid toploader holding the MOA photocard, with its heart, star and bow epoxy stickers'),
    '마스킹테이프 버터 깅엄': (1, 'the short torn piece of butter-yellow gingham washi tape'),
    '폴라로이드 하늘 모아 스티커': (2, 'the polaroid of a blue sky with clouds, with the MOA die-cut sticker on its lower-left corner'),
    '폴라로이드 데이지 디오 스티커': (2, 'the polaroid of a daisy field, with the DIO die-cut sticker and the lavender gingham washi tape across the top'),
    '스티커 시트 모아와 디오': (2, 'the kiss-cut sticker sheet of MOA and DIO emotion stickers, with two stickers peeled off leaving empty cut outlines'),
    '마스킹테이프 라벤더 도트': (2, 'the short torn piece of lavender washi tape with small white dots'),
    '마스킹테이프 라벤더 데이지': (2, 'the short torn piece of lavender washi tape with small white daisies'),
    '스티커 모아': (2, 'ONE single die-cut vinyl sticker of MOA smiling (white sticker border), taken from the sticker sheet'),
    '스티커 디오': (2, 'ONE single die-cut vinyl sticker of DIO smiling (white sticker border), taken from the sticker sheet'),
    '인형 모아 평면': (3, 'the flat-illustrated MOA doll (butter-yellow book doll with a lavender tab and two short legs)'),
    '인형 디오 평면': (3, 'the flat-illustrated DIO doll (white round-headed doll with a lavender knitted scarf, two buttons and short legs)'),
    '폴라로이드 하늘': (3, 'the plain polaroid of a blue sky with soft clouds'),
    '마스킹테이프 라벤더 결': (3, 'the short torn piece of pale lavender washi tape with a fine fiber texture'),
}
MAGENTA = np.array([255, 0, 255], dtype=np.float32)


def make(work: Path, boards: list) -> None:
    for name, (b, desc) in ELEMENTS.items():
        d = work / name
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(boards[b - 1], d / 'board.png')
        (d / 'imgs.txt').write_text('board.png', encoding='utf-8')
        (d / 'prompt.txt').write_text(
            'Use your built-in image generation tool with a TRANSPARENT background if it supports it. Use the attached image (board.png in the current directory) as the reference. '
            'Save the result as a PNG file named "out.png" in the current working directory. Output: 1024x1024. Do not write code and do not create any other files.\n\n'
            f'Draw ONLY this single object from the reference, alone: {desc}. Copy its design, artwork, colors, materials and rendering quality faithfully, seen strictly from directly above, lying flat, '
            'upright (not rotated), centered, filling about 80% of the canvas, with a little empty margin on every side. '
            'NO desk, NO shadow, NO other objects, NO text. '
            'Background: fully transparent (alpha). If a transparent background is not possible, use a perfectly flat, pure magenta background (#FF00FF) everywhere around the object, with no gradient, no shadow and no texture.\n',
            encoding='utf-8')
    print('elements', len(ELEMENTS))


def key(work: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in ELEMENTS:
        src = work / name / 'out.png'
        if not src.exists():
            print('missing', name); continue
        im = Image.open(src)
        if im.mode == 'RGBA' and np.asarray(im)[..., 3].min() < 250:
            rgba = np.asarray(im).copy()
        else:
            rgba = magenta_to_alpha(np.asarray(im.convert('RGB')).astype(np.float32))
        a = rgba[..., 3]
        ys, xs = np.where(a > 8)
        pad = 8
        box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(a.shape[1], xs.max() + pad + 1), min(a.shape[0], ys.max() + pad + 1))
        Image.fromarray(rgba).crop(box).save(out_dir / f'{name}.png', optimize=True)
        print('ok', name, box)


def magenta_to_alpha(rgb: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    dist = np.linalg.norm(rgb - MAGENTA, axis=2)
    bgish = dist < 120  # 마젠타 쪽 색 (가장자리 섞인 색 포함)
    seen = np.zeros((h, w), bool)
    q = deque((y, x) for y in (0, h - 1) for x in range(w) if bgish[y, x])
    q.extend((y, x) for x in (0, w - 1) for y in range(h) if bgish[y, x])
    for y, x in q:
        seen[y, x] = True
    while q:  # 테두리에서 이어진 마젠타만 배경 (물체 안의 분홍 하트는 남는다)
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and bgish[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    # 배경 안쪽은 완전 투명, 경계의 섞인 색은 마젠타 거리로 부분 투명 + 마젠타 성분을 빼 번짐 제거
    alpha = np.where(seen, np.clip((dist - 40) / 80, 0, 1), 1.0)
    keep = alpha[..., None]
    color = np.where(keep > 0, (rgb - (1 - keep) * MAGENTA) / np.maximum(keep, 1e-3), 0)
    rgba = np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)
    return rgba


if __name__ == '__main__':
    work, mode = Path(sys.argv[1]), sys.argv[2]
    if mode == 'make':
        make(work, [Path(p) for p in sys.argv[3:6]])
    else:
        key(work, Path(sys.argv[3]))
