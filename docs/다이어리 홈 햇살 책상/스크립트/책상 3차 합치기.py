# -*- coding: utf-8 -*-
"""책상 시안 3차 — 상판(코덱스) + 소품(투명 PNG) + 실제 앱 UI 층을 합쳐 태블릿 가로 스와이프 화면을 만든다.

python "책상 3차 합치기.py" <상판 폴더> <소품 폴더> <ui.png> <결과 폴더>
  상판 폴더: <안>.png (코덱스 1536x1024), 소품 폴더: <안>/<이름>.png, ui.png: 바탕만 투명한 앱 화면 (2560x1600, 1280x800 의 2배)
배치(LAYOUT)는 앱 화면 좌표(1280x800)로 적는다. 소품이 버튼 · 글자 · 표지에 닿으면 경고를 낸다.
빛은 왼쪽 위(오후 3시)에서 오므로 그림자는 모두 오른쪽 아래로 진다.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageFilter

W, H, SCALE = 1280, 800, 2
SHADOW = (92, 78, 70)  # 따뜻한 회갈색 그림자
CENTER_COVER = (554, 192, 804, 528)  # 가운데 표지 (앱 좌표)
SIDE_COVERS = [(220, 230, 418, 495), (940, 230, 1138, 495)]

# 안 → [(소품 파일 이름, 가운데 x, 가운데 y, 폭, 회전(도), 두께)] — 두께가 클수록 그림자가 길고 흐리다
LAYOUT = {
    '1안 버터 오후 원목': [
        ('폴라로이드 모아와 디오 소풍', 178, 668, 120, -7, 0.4),
        ('마스킹테이프 조각 버터 깅엄', 168, 604, 84, 11, 0.1),
        ('스티커 모아', 336, 742, 56, 9, 0.2),
        ('바인더 클립 버터', 258, 694, 46, 83, 2.0),  # 폴라로이드 오른쪽 가장자리를 집는다
        ('마스킹테이프 롤 버터 깅엄', 962, 694, 92, 0, 3.0),
        ('키캡 키링 디오', 1078, 642, 86, -14, 2.5),
    ],
    '2안 아이보리 리넨 매트': [
        ('스티커 시트 모아와 디오', 172, 690, 106, -6, 0.2),
        ('마스킹테이프 조각 라벤더 도트', 300, 622, 92, -11, 0.1),
        ('스티커 모아', 308, 738, 58, 12, 0.2),
        ('하트 클립 골드', 204, 640, 32, -8, 0.4),  # 스티커 시트 윗변을 집는다
        ('폴라로이드 하늘 디오 스티커', 1000, 684, 112, 6, 0.4),
        ('마스킹테이프 롤 라벤더 도트', 1112, 608, 76, 0, 3.0),
    ],
    '3안 화이트 종이결': [
        ('폴라로이드 두 장 하늘색 바인더 클립', 196, 676, 132, -6, 0.8),
        ('스티커 디오', 342, 640, 56, 10, 0.2),
        ('마스킹테이프 조각 세이지 체크', 338, 760, 80, 8, 0.1),
        ('키캡 키링 모아와 디오', 1004, 676, 120, -10, 2.5),
        ('아크릴 코롯토 디오', 1118, 612, 56, 12, 2.0),
    ],
    '4안 크림 가죽 데스크패드': [
        ('네컷 사진 모아와 디오', 150, 676, 56, -6, 0.3),
        ('마스킹테이프 조각 버터 깅엄', 152, 590, 74, 5, 0.1),  # 네컷 위쪽을 붙인다
        ('아크릴 코롯토 모아', 250, 712, 70, 8, 2.0),
        ('바인더 클립 버터', 338, 636, 42, 22, 2.0),
        ('스티커 하트 라벤더', 352, 752, 30, -10, 0.2),
        ('아크릴 코롯토 디오', 1000, 690, 78, -6, 2.0),
        ('하트 클립 골드', 1106, 628, 34, 14, 0.4),
        ('스티커 모아 얼굴', 1112, 736, 40, 10, 0.2),
    ],
    # 최종: 사용자가 직접 놓아 본 배치를 따른다. 다른 안의 소품은 '<안>/<이름>', 공용 = 실물 구조대로 다시 그린 클립(클립.html)
    '최종 원목 라벤더': [
        ('1안 버터 오후 원목/폴라로이드 모아와 디오 소풍', 184, 685, 147, 6, 0.4),
        ('1안 버터 오후 원목/마스킹테이프 조각 버터 깅엄', 212, 600, 80, 6, 0.1),  # 폴라로이드 윗변을 붙인다
        ('공용/하트 클립 골드', 328, 698, 42, -20, 0.3),
        ('공용/바인더 클립 버터', 404, 740, 58, 8, 2.0),
        ('2안 아이보리 리넨 매트/폴라로이드 하늘 디오 스티커', 1029, 697, 165, 9, 0.4),
        ('2안 아이보리 리넨 매트/마스킹테이프 조각 라벤더 도트', 956, 634, 100, 33, 0.1),  # 폴라로이드 왼쪽 위 모서리를 붙인다
        ('4안 크림 가죽 데스크패드/스티커 하트 라벤더', 885, 753, 32, -15, 0.2),
        ('공용/종이 클립 골드', 1154, 652, 25, -57, 0.3),
    ],
}

# 상판만 바꾼 판: 소품 · 배치는 원래 안을 그대로 쓴다
SAME_AS = {'1안 원목 밝은 쿨톤': '1안 버터 오후 원목'}
# 쿨톤 · 라벤더 상판에 놓을 때 소품 화이트 밸런스를 상판에 맞추고, 그림자도 차가운 회보라로
COOL = {'최종 원목 라벤더'}
SHADOW_OF = {'최종 원목 라벤더': (72, 70, 98)}


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def white_balance(prop: Image.Image) -> Image.Image:
    """코덱스 소품은 따뜻한 크림빛으로 그려졌다. 밝고 채도 낮은 곳(폴라로이드 틀 · 스티커 흰 테두리 · 종이)의 노란 기를 빼고
    전체를 상판과 같은 쪽으로 살짝 차갑게 옮긴다. 그림 속 색(버터 · 라벤더 · 하늘)은 채도가 있어 거의 그대로 남는다."""
    arr = np.asarray(prop, np.float32)
    rgb, a = arr[..., :3], arr[..., 3:]
    lum = rgb @ np.array([.2126, .7152, .0722], np.float32)
    chroma = rgb.max(-1) - rgb.min(-1)
    w = (smooth(lum, 150, 215) * (1 - smooth(chroma, 40, 90)))[..., None]
    m = rgb.mean(-1, keepdims=True)
    rgb = rgb + w * ((m + (rgb - m) * 0.3) - rgb) + w * np.array([-1, -2, 4], np.float32)
    rgb = rgb * np.array([0.985, 0.99, 1.02], np.float32)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8), 'RGBA')


def desk_layer(path: Path) -> Image.Image:
    im = Image.open(path).convert('RGB')
    w, h = im.size
    ch = round(w / (W / H))
    top = (h - ch) // 2
    return im.crop((0, top, w, top + ch)).resize((W * SCALE, H * SCALE), Image.LANCZOS).convert('RGBA')


def cast(base: Image.Image, alpha: Image.Image, offset, blur, strength, tint=SHADOW) -> None:
    """alpha 모양의 그림자를 base 에 곱하기로 드리운다."""
    sh = Image.new('L', base.size, 0)
    sh.paste(alpha, (int(offset[0]), int(offset[1])))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(sh, np.float32) / 255 * strength
    b = np.asarray(base, np.float32)
    tint = np.array(tuple(tint) + (255,), np.float32)
    out = b * (1 - a[..., None]) + (b * tint / 255) * a[..., None]
    out[..., 3] = b[..., 3]
    base.paste(Image.fromarray(out.astype(np.uint8)))


def cover_shadows(base: Image.Image, ui: Image.Image, tint=SHADOW) -> None:
    ua = ui.getchannel('A')
    for box, strength, reach in [(CENTER_COVER, 0.42, 1.0)] + [(b, 0.22, 0.7) for b in SIDE_COVERS]:
        x0, y0, x1, y1 = (v * SCALE for v in box)
        m = Image.new('L', base.size, 0)
        m.paste(ua.crop((x0, y0, x1, y1)).point(lambda v: 255 if v > 200 else 0), (x0, y0))
        cast(base, m, (6 * SCALE * reach, 10 * SCALE * reach), 9 * SCALE * reach, strength * 0.55, tint)  # 넓고 옅은 그림자
        cast(base, m, (1.5 * SCALE, 2.5 * SCALE), 2 * SCALE, strength * 0.5, tint)  # 바닥에 닿은 짙은 그림자


def place(base: Image.Image, prop: Image.Image, cx, cy, width, rot, thick, ui_alpha: np.ndarray, name: str, tint=SHADOW) -> None:
    w = round(width * SCALE)
    h = round(prop.height * w / prop.width)
    p = prop.resize((w, h), Image.LANCZOS).rotate(rot, resample=Image.BICUBIC, expand=True)
    x, y = round(cx * SCALE - p.width / 2), round(cy * SCALE - p.height / 2)
    a = p.getchannel('A')
    full = Image.new('L', base.size, 0)
    full.paste(a, (x, y))
    hit = (np.asarray(full) > 40) & (ui_alpha > 100)
    if hit.any():
        print(f'  ! {name}: UI 와 {hit.sum()} px 겹침')
    cast(base, full, ((1 + thick) * SCALE, (1.5 + thick * 1.4) * SCALE), (1.5 + thick * 1.6) * SCALE, 0.30 + 0.04 * thick, tint)
    cast(base, full, (0.6 * SCALE, 0.9 * SCALE), 0.8 * SCALE, 0.25, tint)  # 붙은 자리
    base.alpha_composite(p, (x, y))


def compose(desk: Path, props: Path, ui_path: Path, out: Path, name: str) -> Path:
    base = desk_layer(desk)
    ui = Image.open(ui_path).convert('RGBA')
    ui_alpha = np.asarray(ui.getchannel('A'))
    tint = SHADOW_OF.get(name, SHADOW)
    cover_shadows(base, ui, tint)
    source = SAME_AS.get(name, name)
    for item in LAYOUT.get(source, []):
        file, cx, cy, width, rot, thick = item
        rel = file if '/' in file else f'{source}/{file}'
        prop = Image.open(props / f'{rel}.png').convert('RGBA')
        if name in COOL and not file.startswith('공용/'):  # 공용 클립은 처음부터 중립 색으로 그렸다
            prop = white_balance(prop)
        place(base, prop, cx, cy, width, rot, thick, ui_alpha, file, tint)
    base.alpha_composite(ui)
    out.mkdir(parents=True, exist_ok=True)
    dest = out / f'{name}.png'
    base.convert('RGB').save(dest, optimize=True)
    return dest


if __name__ == '__main__':
    desks, props, ui_path, out = (Path(p) for p in sys.argv[1:5])
    names = sys.argv[5:] or [p.stem for p in sorted(desks.glob('*.png'))]
    for n in names:
        print('ok', compose(desks / f'{n}.png', props, ui_path, out, n))
