# -*- coding: utf-8 -*-
"""다이어리 홈 '햇살 책상' 이미지 만들기 → frontend/assets/desk/

python scripts/generate-desk-assets.py <코덱스 창빛.png> <소품 폴더 (docs/.../책상 시안 3차/소품)>

(상판은 그림 없이 단색이라 원목 그림은 만들지 않는다. 예전 desk-wood.jpg 는 지웠다)
- window-light.png : 코덱스가 검은 바탕에 그린 십자 창빛 + 그 안에 녹은 나무 그림자 → 흰색 + 알파. 앱에서 시간대 색 · 자리를 입힌다
- 책갈피 · 별 클립은 이 스크립트가 아니라 scripts/process-bookmark.py · draw-star-clip.py 가 만든다.
- props/<이름>.png · <이름>-shadow.png : 화이트 밸런스를 맞춘 소품과 같은 모양의 부드러운 그림자(검정 + 알파)
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'desk'

# 앱 이름 → (소품 폴더 안 경로, 만들 너비 px). 너비는 화면에서 쓰는 폭의 약 2.2배
PROPS = {
    'polaroid-picnic': ('1안 버터 오후 원목/폴라로이드 디오와 두리 소풍', 340),
    'tape-butter': ('1안 버터 오후 원목/마스킹테이프 조각 버터 깅엄', 200),
    'binder-clip-2': ('1안 버터 오후 원목/바인더 클립 버터', 150),  # 같은 그림을 다른 방향으로 한 번 더 놓는다
    'binder-clip': ('1안 버터 오후 원목/바인더 클립 버터', 150),  # 코덱스가 그린 실물 구조 그림(철사 손잡이가 잘록한 목을 지나 둥근 고리로 벌어진다)
    'polaroid-sky': ('2안 아이보리 리넨 매트/폴라로이드 하늘 두리 스티커', 380),
    'tape-lavender': ('2안 아이보리 리넨 매트/마스킹테이프 조각 라벤더 도트', 240),
    'sticker-heart': ('4안 크림 가죽 데스크패드/스티커 하트 라벤더', 90),
    'paper-clip': ('공용/종이 클립 골드', 90),
}
EVEN_TONE = {'polaroid-picnic': 0, 'polaroid-sky': 0, 'tape-butter': 3, 'tape-lavender': 3, 'sticker-heart': 3}  # 0 = 종이 틀만, k = 색 면 k 개
TRANSLUCENT = {'tape-butter': 0.8, 'tape-lavender': 0.8}  # 마스킹테이프는 살짝 비쳐야 종이 위에 붙은 테이프답다 (알파 배율)
MASCOTS = ('polaroid-picnic', 'polaroid-sky')  # 마스코트 색 면 고르기
STICKER_BORDER = ('polaroid-sky',)  # 스티커 흰 테두리 폭 맞추기
SMOOTH_OUTLINE = ('polaroid-sky',)  # 스티커 테두리의 삐죽함 지우기
EVEN_CLIP_BODY = ('binder-clip', 'binder-clip-2')  # 노란 몸통 색 맞추기 (회전 뒤에 적용)
WIRE_CLIPS = {'binder-clip': 1, 'binder-clip-2': 1, 'paper-clip': 1}  # 알파를 깎을 px. 하트 클립은 새로 그릴 때부터 가늘다 (화면에서 철사 굵기가 셋 다 2.4 ~ 3.1dp)
PAD = 14  # 그림자가 번질 여백 (소품 · 그림자 이미지 크기를 같게 맞춘다)
ROTATE = {'polaroid-picnic': 6, 'tape-butter': 6, 'binder-clip': 22, 'binder-clip-2': -50, 'polaroid-sky': 9, 'tape-lavender': 33, 'sticker-heart': -15, 'paper-clip': -57}


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def window(src: Path) -> None:
    """코덱스가 검은 바탕에 그린 '십자 창빛 + 그 안에 녹은 나무 그림자' → 흰색 + 알파 (밝기가 곧 투명도).
    창 모양 · 나무 그림자가 한 장에 들어 있어 앱에서 한 덩어리로 같이 움직인다. 앱에서 tintColor 로 시간대 색을 입힌다."""
    lum = Image.open(src).convert('L')
    box = lum.point(lambda v: 255 if v > 10 else 0).getbbox()
    pad = 24
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(lum.width, box[2] + pad), min(lum.height, box[3] + pad))
    lum = lum.crop(box)
    scale = 1400 / lum.width
    lum = lum.resize((1400, round(lum.height * scale)), Image.LANCZOS)
    rgba = Image.new('RGBA', lum.size, (255, 255, 255, 0))
    rgba.putalpha(lum)
    rgba.save(OUT / 'window-light.png', optimize=True)
    print('window-light', rgba.size)


def white_balance(prop: Image.Image) -> Image.Image:
    """밝고 채도 낮은 곳(폴라로이드 틀 · 스티커 테두리)의 노란 기를 빼 라벤더 상판에 맞춘다. 그림 속 색은 거의 그대로."""
    arr = np.asarray(prop, np.float32)
    rgb, a = arr[..., :3], arr[..., 3:]
    lum = rgb @ np.array([.2126, .7152, .0722], np.float32)
    chroma = rgb.max(-1) - rgb.min(-1)
    w = (smooth(lum, 150, 215) * (1 - smooth(chroma, 40, 90)))[..., None]
    m = rgb.mean(-1, keepdims=True)
    rgb = rgb + w * ((m + (rgb - m) * 0.3) - rgb) + w * np.array([-1, -2, 4], np.float32)
    rgb = rgb * np.array([0.985, 0.99, 1.02], np.float32)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8), 'RGBA')


def straighten_tape(tape: Image.Image) -> Image.Image:
    """마스킹테이프의 위 · 아래 윤곽을 직선으로: 가로로 꽉 찬(90% 이상) 첫 줄 · 마지막 줄 사이만 남긴다. 양 끝의 찢긴 모양은 그대로 둔다."""
    alpha = np.asarray(tape.getchannel('A'))
    cover = (alpha > 128).sum(axis=1)
    rows = np.where(cover >= cover.max() * 0.9)[0]
    return tape.crop((0, int(rows.min()), tape.width, int(rows.max()) + 1))


def whiten(prop: Image.Image, strength: float = 0.6) -> Image.Image:
    """밝고 색이 거의 없는 부분(깅엄의 흰 칸)을 흰색 쪽으로 끌어올려 더 또렷하게 한다. 노란 칸은 그대로."""
    arr = np.asarray(prop, np.float32)
    rgb, a = arr[..., :3], arr[..., 3:]
    lum = rgb @ np.array([.2126, .7152, .0722], np.float32)
    chroma = rgb.max(-1) - rgb.min(-1)
    w = (smooth(lum, 190, 232) * (1 - smooth(chroma, 32, 70)))[..., None] * strength
    rgb = rgb + w * (255 - rgb)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a]).astype(np.uint8), 'RGBA')


def rotate_smooth(prop: Image.Image, degrees: float) -> Image.Image:
    """2배로 키워 돌린 뒤 줄여서 가장자리를 매끄럽게 한다 (PIL 은 시계 반대 방향이 + 라 부호를 뒤집는다)."""
    if not degrees:
        return prop
    big = prop.resize((prop.width * 2, prop.height * 2), Image.LANCZOS).rotate(-degrees, resample=Image.BICUBIC, expand=True)
    return big.resize((big.width // 2, big.height // 2), Image.LANCZOS)


TRIM_EDGE = ('polaroid-picnic', 'polaroid-sky', 'tape-butter', 'tape-lavender', 'sticker-heart')  # 가장자리 어두운 띠가 남기 쉬운 소품 (클립은 선이 가늘어 제외)


def trim_edge(prop: Image.Image, px: int = 3, peel: bool = False) -> Image.Image:
    """코덱스 그림 가장자리에 남은 검은 테두리(오른쪽 · 아래로 갈수록 두꺼움)를 지운다.
    알파를 px 만큼 안쪽으로 깎고, peel 이면 가장자리 가까이의 어두운 픽셀(밝은 종이 틀에는 없는 색)을 한 겹씩 더 벗겨 낸 뒤 살짝 부드럽게 한다."""
    from scipy import ndimage
    rgba = np.asarray(prop, np.uint8).copy()
    alpha = np.asarray(prop.getchannel('A').filter(ImageFilter.MinFilter(px * 2 + 1)), np.uint8).copy()
    lum = rgba[..., :3].astype(np.float32) @ np.array([.2126, .7152, .0722], np.float32)
    chroma = rgba[..., :3].max(-1).astype(np.int16) - rgba[..., :3].min(-1).astype(np.int16)
    for _ in range(12 if peel else 0):
        near_edge = (alpha > 0) & ~ndimage.binary_erosion(alpha > 0, iterations=8)
        # 흰 종이 틀 가장자리에 남은 회색 · 초록빛 실선: 종이 색(밝고 색이 거의 없음)이 아닌 픽셀
        dark = near_edge & ((lum < 205) | (chroma > 26))
        if not dark.any():
            break
        alpha[ndimage.binary_dilation(dark, iterations=1) & (alpha > 0)] = 0
    out = Image.fromarray(rgba, 'RGBA')
    out.putalpha(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.7)))
    return out


def to_lab(rgb):
    """sRGB(0~255) → CIE Lab (D65)."""
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[.4124, .2126, .0193], [.3576, .7152, .1192], [.1805, .0722, .9505]], np.float32) / np.array([.95047, 1, 1.08883], np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def from_lab(lab):
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * np.array([.95047, 1, 1.08883], np.float32)
    c = xyz @ np.linalg.inv(np.array([[.4124, .2126, .0193], [.3576, .7152, .1192], [.1805, .0722, .9505]], np.float32))
    c = np.where(c > 0.0031308, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055, 12.92 * c)
    return np.clip(c * 255, 0, 255)


def masked_blur(channel, weight, sigma):
    from scipy import ndimage
    return ndimage.gaussian_filter(channel * weight, sigma) / np.maximum(ndimage.gaussian_filter(weight, sigma), 1e-4)


def even_tone(prop: Image.Image, clusters: int = 0, sigma: float = 12, hue_keep: float = 0.0, light_keep: float = 0.4) -> Image.Image:
    """코덱스 그림은 한 면(흰 종이 틀 · 테이프 색 칸 · 스티커 몸통) 안에서 색 · 밝기가 조금씩 왔다갔다 한다.
    같은 면으로 묶은 픽셀의 색(a · b)을 그 면의 대표색으로 맞추고, 밝기는 넓게 번진 값 쪽으로 당겨 얼룩을 지운다.
    clusters=0 : 밝고 색이 거의 없는 픽셀(종이 틀)만 한 면으로 본다. 사진 · 그림 안쪽은 건드리지 않는다.
    clusters=k : 소품 전체를 k 가지 색 면으로 나눈다 (테이프 · 스티커). hue_keep 은 원래 색을 남기는 비율, light_keep 은 원래 밝기를 남기는 비율."""
    arr = np.asarray(prop, np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3]
    lab = to_lab(rgb)
    solid = alpha > 200
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    if clusters:
        pts = lab[solid][::7]
        centers = pts[np.argsort(pts[:, 0])[np.linspace(0, len(pts) - 1, clusters).astype(int)]]
        for _ in range(12):
            label = np.argmin(((pts[:, None] - centers[None]) ** 2).sum(-1), 1)
            centers = np.stack([pts[label == k].mean(0) if (label == k).any() else centers[k] for k in range(clusters)])
        full = np.argmin(((lab[..., None, :] - centers) ** 2).sum(-1), -1)
        groups = [solid & (full == k) for k in range(clusters)]
    else:
        from scipy import ndimage
        # 가장자리 가까이만 종이 틀로 본다 (사진 안쪽의 흰 구름 · 빛 번짐이 같이 묶이지 않게)
        ring = ndimage.distance_transform_edt(alpha > 128) <= 0.06 * min(alpha.shape)
        paper = solid & ring & (lab[..., 0] > 82) & (chroma < 14)
        parts, count = ndimage.label(paper)
        # 종이 틀은 가장 큰 한 덩어리. 사진 속 구름 · 캐릭터의 흰색은 따로 떨어진 덩어리라 건드리지 않는다.
        groups = [parts == (1 + int(np.argmax(ndimage.sum(paper, parts, range(1, count + 1)))))] if count else []
    out = lab.copy()
    for g in groups:
        if g.sum() < 50:
            continue
        w = g.astype(np.float32)
        medians = np.median(lab[g], axis=0)
        smooth_l = masked_blur(lab[..., 0], w, sigma)
        out[..., 0] = np.where(g, light_keep * lab[..., 0] + (1 - light_keep) * smooth_l, out[..., 0])
        for c in (1, 2):
            out[..., c] = np.where(g, hue_keep * lab[..., c] + (1 - hue_keep) * medians[c], out[..., c])
    return Image.fromarray(np.dstack([from_lab(out), alpha]).astype(np.uint8), 'RGBA')


def even_mascots(prop: Image.Image, max_share: float = 0.09) -> Image.Image:
    """마스코트(디오 · 두리 · 수첩)의 색 면을 확실하게 한 색으로 칠한다. 진한 윤곽선으로 둘러싸인 면마다 대표색 하나로 채우고,
    윤곽선 바로 옆(3px)만 윤곽선 ↔ 면색 사이의 번짐을 남겨 선이 계단지지 않게 한다. 윤곽선 안쪽의 밝은 테(할로) · 얼룩이 같이 사라진다.
    하얀 면(머리 · 몸 · 손 · 발)은 서로 한 색으로 맞춘다. 하늘 · 풀밭처럼 큰 면은 건드리지 않는다."""
    from scipy import ndimage
    arr = np.asarray(prop, np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3]
    lab = to_lab(rgb)
    solid = alpha > 200
    dark = solid & (lab[..., 0] <= 40)  # 진한 윤곽선(검정)
    parts, count = ndimage.label(solid & ~dark)
    near_line = ndimage.binary_dilation(dark, iterations=3)
    limit = solid.sum() * max_share
    faces = []
    for k in range(1, count + 1):
        face = parts == k
        if not 120 <= face.sum() <= limit:
            continue
        core = ndimage.binary_erosion(face, iterations=3)
        if core.sum() < 40:
            core = face
        faces.append((face, np.median(lab[core], axis=0)))
    is_white = lambda m: m[0] > 78 and np.hypot(m[1], m[2]) < 9  # 목도리(연보라)는 제외
    whites = [m for _, m in faces if is_white(m)]  # 하얀 면은 한 색으로
    white = np.array([np.percentile([m[0] for m in whites], 75), *np.median(whites, axis=0)[1:]]) if whites else None
    line_l = float(np.median(lab[dark][:, 0])) if dark.any() else 8.0
    out = lab.copy()
    for face, median in faces:
        flat = white if white is not None and is_white(median) else median
        t = np.clip((lab[..., 0] - line_l) / max(flat[0] - line_l, 1.0), 0, 1)  # 이 픽셀이 면색 쪽인 정도
        band = face & near_line
        for c in range(3):
            target = line_l if c == 0 else 0.0
            blend = target + t * (flat[c] - target)
            out[..., c] = np.where(face, np.where(band, blend, flat[c]), out[..., c])
    return Image.fromarray(np.dstack([from_lab(out), alpha]).astype(np.uint8), 'RGBA')


def even_sticker_border(prop: Image.Image, width: float = 7.0, right_extra: float = 3.0) -> Image.Image:
    """스티커의 흰 테두리를 사방 같은 폭으로 다시 만든다. 마스코트 윤곽선(검정)을 채운 모양에서 width px 만큼 바깥까지 스티커 흰색으로 덮는다.
    왼쪽은 사진 · 틀 위라 흰색이 묻혀 얇아 보이므로, 오른쪽(책상 쪽)은 right_extra 만큼 더 두껍게 해 눈에 보이는 폭을 좌우 맞춘다. width 는 책상 위에 걸친 쪽(아래)에서 잰 두께."""
    from scipy import ndimage
    arr = np.asarray(prop, np.float32).copy()
    lab = to_lab(arr[..., :3])
    dark = (arr[..., 3] > 200) & (lab[..., 0] <= 40)
    shape = ndimage.binary_fill_holes(ndimage.binary_closing(dark, iterations=3))
    dist = ndimage.distance_transform_edt(~shape)
    ys, xs = np.nonzero(shape)
    yy, xx = np.mgrid[:shape.shape[0], :shape.shape[1]]
    cos = np.cos(np.arctan2(yy - ys.mean(), xx - xs.mean()))
    reach = width + right_extra * np.clip(cos, 0, 1) ** 1.5  # 오른쪽으로 갈수록 두껍게
    cover = np.clip(reach + 0.5 - dist, 0, 1) * (~shape)
    paper = np.array([253, 252, 255], np.float32)
    arr[..., :3] = arr[..., :3] * (1 - cover[..., None]) + paper * cover[..., None]
    arr[..., 3] = np.maximum(arr[..., 3], cover * 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def smooth_outline(prop: Image.Image, sigma: float = 3.0) -> Image.Image:
    """윤곽의 작은 튀어나옴(스티커 흰 테두리가 발 아래로 삐죽 나온 곳)을 지운다. 알파를 번지게 한 뒤 문턱으로 다시 깎는다."""
    from scipy import ndimage
    alpha = np.asarray(prop.getchannel('A'), np.float32) / 255
    blurred = ndimage.gaussian_filter(alpha, sigma)
    t = np.clip((blurred - 0.42) / 0.16, 0, 1)
    t = t * t * (3 - 2 * t)
    out = prop.copy()
    out.putalpha(Image.fromarray((np.minimum(alpha, 1) * 0 + t * 255).astype(np.uint8)))
    return out


def even_clip_body(prop: Image.Image, tilt: float = 3.0) -> Image.Image:
    """바인더 클립의 노란 몸통 색을 두 클립이 같게 맞춘다. 원본에 구워진 빛 방향이 회전과 함께 돌아가 클립마다 밝기가 달라 보이므로,
    몸통의 넓은 밝기 변화를 걷어내고 돌린 뒤의 화면 기준(왼쪽 위가 밝다)으로 같은 기울기를 다시 입힌다. 접힌 선 · 가장자리의 가는 밝기 차는 남긴다."""
    from scipy import ndimage
    arr = np.asarray(prop, np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3]
    lab = to_lab(rgb)
    body = (alpha > 200) & ((rgb[..., 0] - rgb[..., 2]) > 40)  # 노란 몸통 (은색 철사 제외)
    body = ndimage.binary_opening(body, iterations=1)
    if body.sum() < 100:
        return prop
    w = body.astype(np.float32)
    low = masked_blur(lab[..., 0], w, 10)
    detail = lab[..., 0] - low
    h, wd = body.shape
    yy, xx = np.mgrid[:h, :wd]
    gradient = -((xx / wd + yy / h) - 1) * tilt  # 왼쪽 위 +, 오른쪽 아래 −
    median = np.median(lab[body], axis=0)
    out = lab.copy()
    out[..., 0] = np.where(body, median[0] + gradient + detail, lab[..., 0])
    out[..., 1] = np.where(body, median[1], lab[..., 1])
    out[..., 2] = np.where(body, median[2], lab[..., 2])
    return Image.fromarray(np.dstack([from_lab(out), alpha]).astype(np.uint8), 'RGBA')


def translucent(prop: Image.Image, opacity: float) -> Image.Image:
    """마스킹테이프를 살짝 반투명하게 한다. 알파에 opacity 를 곱하므로 바탕(책상 · 종이)이 은은히 비치고 그림자도 같이 옅어진다."""
    out = prop.copy()
    out.putalpha(prop.getchannel('A').point(lambda v: round(v * opacity)))
    return out


def thin_wire(prop: Image.Image, px: int = 1) -> Image.Image:
    """철사가 소품마다 굵기가 달라(종이 클립 · 바인더 클립이 하트 클립보다 훨씬 굵다) 알파를 px 만큼 깎아 비슷한 굵기로 맞춘다."""
    alpha = prop.getchannel('A').filter(ImageFilter.MinFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(0.5))
    out = prop.copy()
    out.putalpha(alpha)
    return out


def props(folder: Path) -> None:
    (OUT / 'props').mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, (rel, width) in PROPS.items():
        src = folder / f'{rel}.png'
        im = Image.open(src).convert('RGBA')
        im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        if name == 'tape-butter':
            im = straighten_tape(im)  # 위 · 아래 윤곽 직선
        if name not in ('binder-clip', 'binder-clip-2', 'paper-clip'):  # 클립은 처음부터 중립 색으로 그렸다
            im = white_balance(im)
        if name == 'tape-butter':
            im = whiten(im)  # 깅엄의 흰 칸을 더 살린다
        if name in EVEN_TONE:
            im = even_tone(im, clusters=EVEN_TONE[name])  # 한 면 안에서 왔다갔다 하는 색 · 밝기를 고른다
        if name in MASCOTS:
            im = even_mascots(im)
        if name in STICKER_BORDER:
            im = even_sticker_border(im)
        if name in SMOOTH_OUTLINE:
            im = smooth_outline(im)
        if name in TRANSLUCENT:
            im = translucent(im, TRANSLUCENT[name])
        if name in WIRE_CLIPS:
            im = thin_wire(im, WIRE_CLIPS[name])  # 클립끼리 철사 굵기를 맞춘다
        if name in TRIM_EDGE:
            im = trim_edge(im, peel=(name == 'polaroid-picnic'))  # 어두운 띠 벗기기는 소풍 폴라로이드만 (하늘 폴라로이드는 가장자리에 걸친 두리 스티커 윤곽선이 있다)
        base_width = im.width  # 돌리기 전 내용 폭 (앱이 보이는 폭에 맞춰 크기를 정하는 기준)
        im = rotate_smooth(im, ROTATE.get(name, 0))
        if name in EVEN_CLIP_BODY:
            im = even_clip_body(im)
        canvas = Image.new('RGBA', (im.width + PAD * 2, im.height + PAD * 2), (0, 0, 0, 0))
        canvas.alpha_composite(im, (PAD, PAD))
        canvas.save(OUT / 'props' / f'{name}.png', optimize=True)
        shadow = canvas.getchannel('A').filter(ImageFilter.GaussianBlur(max(2.0, width * 0.012)))
        black = Image.new('RGBA', canvas.size, (30, 26, 52, 0))
        black.putalpha(shadow)
        black.save(OUT / 'props' / f'{name}-shadow.png', optimize=True)
        manifest[name] = {'w': canvas.width, 'h': canvas.height, 'base': base_width + PAD * 2 - PAD * 2}
        print('ok', name, canvas.size)
    (OUT / 'props' / 'manifest.json').write_text(json.dumps(manifest, indent=1), encoding='utf-8')


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    window(Path(sys.argv[1]))
    props(Path(sys.argv[2]))
