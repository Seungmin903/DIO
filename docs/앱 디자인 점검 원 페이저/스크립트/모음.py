# 지금 화면/ 을 기기별 모음 한 장으로 붙인다(코덱스에 이미지 한 장으로 주려고). 각 칸 위에 파일 이름.
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent.parent
SRC = HERE / "지금 화면"
OUT = HERE / "작업"
OUT.mkdir(exist_ok=True)
font = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", 22)
for device, cols, w in [("태블릿", 4, 640), ("폰", 8, 300)]:
    files = sorted(SRC.glob(f"{device} *.png"))
    ims = [Image.open(f).convert("RGB") for f in files]
    h = round(w * ims[0].height / ims[0].width)
    rows = -(-len(ims) // cols)
    sheet = Image.new("RGB", (cols * (w + 16) + 16, rows * (h + 50) + 16), "#9AA0B8")
    d = ImageDraw.Draw(sheet)
    for i, (f, im) in enumerate(zip(files, ims)):
        x, y = 16 + (i % cols) * (w + 16), 16 + (i // cols) * (h + 50)
        d.text((x, y), f.stem, fill="white", font=font)
        sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y + 32))
    sheet.save(OUT / f"모음 {device}.jpg", quality=88)
    print(device, sheet.size)
