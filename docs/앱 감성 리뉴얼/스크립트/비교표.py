# -*- coding: utf-8 -*-
"""이미지/시안/*.jpg → 이미지/비교/<화면> <기기>.jpg : 지금 · A · B · C 를 한 장에 나란히(이름표만 그림에 넣는다).

실행:  python "docs/앱 감성 리뉴얼/스크립트/비교표.py"
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent.parent
SRC = HERE / "이미지" / "시안"
OUT = HERE / "이미지" / "비교"
IMG_STORE = HERE / "이미지" / "스토어"
FONT = r"C:\Windows\Fonts\malgunbd.ttf"
NAMES = {"지금": "지금", "A": "A 햇살 드로어리", "B": "B 포토부스 콜라주", "C": "C 조용한 문구점", "혼합": "혼합안 (추천)"}
BG = (243, 243, 247)


def labeled(img: Image.Image, text: str, size: int) -> Image.Image:
    """그림 위에 이름표 한 줄을 붙인 새 그림(그림 안은 가리지 않는다)."""
    bar = int(size * 2.1)
    out = Image.new("RGB", (img.width, img.height + bar), (255, 255, 255))
    out.paste(img, (0, bar))
    d = ImageDraw.Draw(out)
    f = ImageFont.truetype(FONT, size)
    pad = int(size * .42)
    tw = d.textlength(text, font=f)
    y = int(size * .3)
    d.rounded_rectangle([0, y, tw + pad * 2, y + size + pad * 1.5], radius=int(size * .5), fill=(11, 23, 102))
    d.text((pad, y + pad * .65), text, font=f, fill="white")
    return out


def sheet(screen: str, dev: str, skins: list[str], cols: int, scale: float, label_size: int, gap=36, name=None):
    files = [SRC / f"{screen} {k} {dev}.jpg" for k in skins]
    if not all(f.exists() for f in files):
        return
    ims = []
    for f, k in zip(files, skins):
        im = Image.open(f).convert("RGB")
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        ims.append(labeled(im, NAMES[k], label_size))
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    canvas = Image.new("RGB", (cols * w + (cols + 1) * gap, rows * h + (rows + 1) * gap), (255, 255, 255))
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        canvas.paste(im, (gap + c * (w + gap), gap + r * (h + gap)))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name or screen + ' ' + dev}.jpg"
    canvas.save(out, quality=86, optimize=True)
    print("ok", out.name, canvas.size)


if __name__ == "__main__":
    allk = ["지금", "A", "B", "C"]
    for screen in ["로그인", "홈", "공방", "내공간", "휴지통"]:
        sheet(screen, "태블릿", allk, cols=2, scale=.5, label_size=34)
        sheet(screen, "폰", allk, cols=4, scale=.5, label_size=30)
    sheet("회원가입", "폰", allk, cols=4, scale=.5, label_size=30)

    # 추천 혼합안: 지금과 나란히(태블릿 2열 · 폰 2열 × 화면 묶음)
    pair = ["지금", "혼합"]
    for screen in ["로그인", "홈", "공방", "내공간", "휴지통"]:
        sheet(screen, "태블릿", pair, cols=2, scale=.5, label_size=34, name=f"{screen} 혼합 태블릿")

    phones = [("로그인", "폰"), ("홈", "폰"), ("공방", "폰"), ("내공간", "폰"), ("휴지통", "폰")]
    rows = []
    for k in ["지금", "혼합"]:
        row = [Image.open(SRC / f"{sc} {k} {d}.jpg").convert("RGB").resize((390, 844), Image.LANCZOS) for sc, d in phones]
        rows.append(row)
    gap = 28
    lab_h = 72
    canvas = Image.new("RGB", (5 * 390 + 6 * gap, 2 * (844 + lab_h) + 3 * gap), (255, 255, 255))
    for ri, (k, row) in enumerate(zip(["지금", "혼합"], rows)):
        y0 = gap + ri * (844 + lab_h + gap)
        d = ImageDraw.Draw(canvas)
        f = ImageFont.truetype(FONT, 30)
        t = NAMES[k]
        tw = d.textlength(t, font=f)
        d.rounded_rectangle([gap, y0, gap + tw + 28, y0 + 52], radius=26, fill=(11, 23, 102))
        d.text((gap + 14, y0 + 8), t, font=f, fill="white")
        for ci, im in enumerate(row):
            canvas.paste(im, (gap + ci * (390 + gap), y0 + lab_h))
    canvas.save(OUT / "폰 5화면 혼합.jpg", quality=86, optimize=True)
    print("ok 폰 5화면 혼합")
    sheet("홈빈", "태블릿", ["A", "B", "C", "혼합"], cols=4, scale=.32, label_size=26)
    sheet("휴지통빈", "태블릿", ["A", "B", "C", "혼합"], cols=4, scale=.32, label_size=26)

    # 스토어 첫 5장을 한 줄로(스토어 n.jpg 가 먼저 있어야 한다: 렌더.py 스토어)
    store = [IMG_STORE / f"스토어 {n}.jpg" for n in range(1, 6)]
    if all(f.exists() for f in store):
        gap = 24
        ims = [Image.open(f).convert("RGB").resize((540, 960), Image.LANCZOS) for f in store]
        strip = Image.new("RGB", (5 * 540 + 6 * gap, 960 + 2 * gap), (255, 255, 255))
        for i, im in enumerate(ims):
            strip.paste(im, (gap + i * (540 + gap), gap))
        strip.save(IMG_STORE / "스토어 5장.jpg", quality=86, optimize=True)
        print("ok 스토어 5장")
