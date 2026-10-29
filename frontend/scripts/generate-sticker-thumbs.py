"""기본 스티커 보관함 썸네일 → assets/stickers/thumbs/ + src/editor/stickerThumbs.js

보관함 칸은 40~60px 인데 원본은 256~512px 라, 칸마다 큰 이미지를 받아 줄이느라 목록이 느렸다.
칸에서만 쓰는 128px 썸네일을 따로 두고, 캔버스에 붙인 스티커는 원본을 그대로 쓴다.
움직이는 스티커(Noto GIF)는 첫 장면(still)으로 만든다.

실행:  pip install pillow
       python frontend/scripts/generate-sticker-thumbs.py
"""
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'src/editor/stickerAssets.js'
OUT_DIR = ROOT / 'assets/stickers/thumbs'
OUT_JS = ROOT / 'src/editor/stickerThumbs.js'
SIZE = 128


def main():
    text = ASSETS.read_text(encoding='utf-8')
    # 움직이는 스티커는 첫 장면(STICKER_STILLS)을, 나머지는 원본을 줄인다
    # 키는 'tw-1f600' 처럼 따옴표가 있거나 coffee 처럼 없다
    entries = [(quoted or bare, path) for quoted, bare, path in re.findall(r"(?:'([^']+)'|([\w-]+)): require\('\.\./\.\./assets/stickers/([^']+)'\)", text)]
    stills = {asset_id: path for asset_id, path in entries if path.startswith('noto/still/')}
    sources = {}
    for asset_id, path in entries:
        if path.startswith('noto/still/'):
            continue
        sources[asset_id] = stills.get(asset_id, path)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines = []
    for asset_id, path in sorted(sources.items()):
        name = f'{asset_id}.png'
        with Image.open(ROOT / 'assets/stickers' / path) as image:
            image = image.convert('RGBA')
            image.thumbnail((SIZE, SIZE), Image.LANCZOS)
            # 칸 크기에선 256색으로도 차이가 안 보여 용량을 줄인다
            image.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(OUT_DIR / name, optimize=True)
        lines.append(f"  '{asset_id}': require('../../assets/stickers/thumbs/{name}'),")
    OUT_JS.write_text(
        '// 자동 생성 파일 — frontend/scripts/generate-sticker-thumbs.py 로 다시 만든다. 직접 고치지 않는다.\n'
        f'// 기본 스티커 보관함 칸용 {SIZE}px 썸네일 (움직이는 스티커는 첫 장면)\n'
        'export const STICKER_THUMBS = {\n' + '\n'.join(lines) + '\n}\n', encoding='utf-8', newline='\n')
    total = sum(f.stat().st_size for f in OUT_DIR.glob('*.png'))
    print(len(lines), 'thumbs', total // 1024, 'KB')


if __name__ == '__main__':
    main()
