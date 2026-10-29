"""자유 노트 속지(모눈 · 도트 · 줄)의 무늬를 다시 그린다.

- 모눈 · 도트: 여백 없이 페이지 끝까지 무늬를 깐다. 가장자리에 선 · 점이 한 줄로 붙어 보이지 않도록
  네 변의 남는 폭을 같게 나누고, 그 폭이 칸의 1/3 보다 좁으면 한 칸을 더 비워 가운데로 모은다.
- 색은 속지 팔레트(editor/templates/appearance.js 의 palette)에 있는 색만 쓴다. 선 · 글자 색을 바꾸면 이 색이 함께 바뀐다.
- 줄 노트는 자리는 그대로 두고 선 색만 한 단계 진하게 바꾼다.

실행: python scripts/generate-note-grids.py (frontend 폴더에서)
"""
import re
from pathlib import Path

SVG_DIR = Path(__file__).resolve().parent.parent / 'assets' / 'templates' / '2026' / 'SVG'
STEP = 28
LINE = '#d7d9dc'  # 모눈 · 줄 선 (예전 #e8e9eb 보다 한 단계 진하게)
DOT = '#bfc1c4'  # 도트 (예전 #d7d9dc 보다 한 단계 진하게)
DOT_R = 1.4
SIZES = {'portrait': (768, 1024), 'landscape': (1024, 768)}


def edge(length):
    """첫 선까지의 거리. 네 변이 같고, 칸의 1/3 보다 좁으면 한 칸을 더 비운다."""
    gap = (length % STEP) / 2
    return gap + STEP / 2 if gap < STEP / 3 else gap


def marks(length):
    # 1px 선이 화면 픽셀에 맞도록 .5 에 둔다
    start = edge(length)
    count = int((length - 2 * start) // STEP) + 1
    return [start + i * STEP + 0.5 for i in range(count)]


def fmt(value):
    return f'{value:g}'


def grid_group(width, height):
    lines = [f'<line x1="0" y1="{fmt(y)}" x2="{width}" y2="{fmt(y)}" fill="none" stroke="{LINE}" stroke-width="1" />' for y in marks(height)]
    lines += [f'<line x1="{fmt(x)}" y1="0" x2="{fmt(x)}" y2="{height}" fill="none" stroke="{LINE}" stroke-width="1" />' for x in marks(width)]
    return '<g data-note-background="grid">' + ''.join(lines) + '</g>'


def dots_group(width, height):
    dots = [f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{DOT_R}" fill="{DOT}" />' for x in marks(width) for y in marks(height)]
    return '<g data-note-background="dots">' + ''.join(dots) + '</g>'


def replace_group(path, background, group):
    text = path.read_text(encoding='utf-8')
    pattern = re.compile(r'<g data-note-background="' + background + r'">.*?</g>', re.S)
    assert len(pattern.findall(text)) == 1, path.name
    path.write_text(pattern.sub(lambda _: group, text), encoding='utf-8', newline='')


def main():
    for orientation, (width, height) in SIZES.items():
        replace_group(SVG_DIR / f'2026-reusable-note-grid-{orientation}.svg', 'grid', grid_group(width, height))
        replace_group(SVG_DIR / f'2026-reusable-note-dots-{orientation}.svg', 'dots', dots_group(width, height))
        ruled = SVG_DIR / f'2026-reusable-note-ruled-{orientation}.svg'
        ruled.write_text(ruled.read_text(encoding='utf-8').replace('stroke="#e8e9eb"', f'stroke="{LINE}"'), encoding='utf-8', newline='')
        print(orientation, 'x', fmt(marks(width)[0]), '…', fmt(marks(width)[-1]), ' y', fmt(marks(height)[0]), '…', fmt(marks(height)[-1]))


if __name__ == '__main__':
    main()
