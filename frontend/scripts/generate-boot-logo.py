"""시작 화면 DIO 손글씨 로고 데이터(src/shared/bootLogoPaths.js)를 만든다.

글자 모양은 앱 UI 글꼴 Pretendard ExtraBold(assets/fonts/pretendard) 의 D · I · O 윤곽을 그대로 쓴다.
펜 선은 각 글자를 쓰는 순서를 따라가는 중심선이다. 앱은 글자 윤곽으로 잘라 낸 펜 선을 그려 나가며
글자가 손으로 쓰는 것처럼 드러나게 한다(BootSplash.js).

쓰는 법(frontend/): python scripts/generate-boot-logo.py   (fontTools 필요: pip install fonttools)
"""
import math
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / 'assets/fonts/pretendard/Pretendard-ExtraBold.otf'
OUT = ROOT / 'src/shared/bootLogoPaths.js'

CAP = 1448  # 대문자 높이(글꼴 단위). 화면 좌표는 y 를 뒤집어 대문자 위가 0, 기준선이 1448 이 되게 한다.

# 글자별 획(쓰는 순서대로, 글꼴 단위, y 위쪽). 획 굵기는 약 340 이고 펜 선 굵기 PEN_WIDTH 로 덮는다.
# 한 획 = 한 경로(M 하나). 점선은 경로 조각(M)마다 처음부터 다시 시작해서, 한 경로에 두 획을 넣으면 동시에 그려진다.
O_PEN = 'M' + ' L'.join(f'{780 + 514 * math.cos(math.radians(a)):.1f} {724 + 594 * math.sin(math.radians(a)):.1f}' for a in range(40, 431, 6))
LETTERS = [
    ('D', ['M280 1448 L280 0',  # 세로획 위 → 아래
           'M280 1303 L640 1303 C980 1303 1183 1060 1183 724 C1183 388 980 146 640 146 L280 146']),  # 위에서 오른쪽으로 둥글게 아래로
    ('I', ['M280 1448 L280 0']),  # 위 → 아래
    ('O', [O_PEN]),  # 오른쪽 위에서 반시계로 한 바퀴 조금 넘게
]
PEN_WIDTH = 430

TOKEN = re.compile(r'[MLCHVZ]|-?\d+(?:\.\d+)?')


def transform(d, dx):
    """절대 좌표 M · L · C · H · V · Z 경로를 x 로 dx 옮기고 y 를 뒤집는다."""
    out, cmd, nums = [], None, []
    tokens = TOKEN.findall(d)

    def flush():
        if cmd is None:
            return
        if cmd in 'MLC':
            pts = [f'{float(nums[i]) + dx:g} {CAP - float(nums[i + 1]):g}' for i in range(0, len(nums), 2)]
            out.append(cmd + ' '.join(pts))
        elif cmd == 'H':
            out.append('H' + ' '.join(f'{float(n) + dx:g}' for n in nums))
        elif cmd == 'V':
            out.append('V' + ' '.join(f'{CAP - float(n):g}' for n in nums))
        elif cmd == 'Z':
            out.append('Z')

    for tok in tokens:
        if tok in 'MLCHVZ':
            flush()
            cmd, nums = tok, []
        else:
            nums.append(tok)
    flush()
    return ''.join(out)


def length(d):
    """M · L · C 로만 된 경로의 길이(곡선은 잘게 나눠 더한다)."""
    total, cur, start = 0.0, (0.0, 0.0), (0.0, 0.0)
    for cmd, body in re.findall(r'([MLC])([^MLC]*)', d):
        n = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', body)]
        pts = list(zip(n[0::2], n[1::2]))
        if cmd == 'M':
            cur = start = pts[0]
            for p in pts[1:]:
                total += math.dist(cur, p); cur = p
        elif cmd == 'L':
            for p in pts:
                total += math.dist(cur, p); cur = p
        else:
            for i in range(0, len(pts), 3):
                p0, p1, p2, p3 = cur, *pts[i:i + 3]
                prev = p0
                for s in range(1, 201):
                    t = s / 200
                    q = tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * e for a, b, c, e in zip(p0, p1, p2, p3))
                    total += math.dist(prev, q); prev = q
                cur = p3
    return total


def main():
    font = TTFont(FONT)
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
    x, rows = 0, []
    for ch, strokes in LETTERS:
        name = cmap[ord(ch)]
        svg = SVGPathPen(glyphs)
        glyphs[name].draw(svg)
        rows.append({'letter': ch, 'glyph': transform(svg.getCommands(), x),
                     'strokes': [{'pen': transform(pen, x), 'length': round(length(pen), 1)} for pen in strokes]})
        x += hmtx[name][0]
    lines = [
        '// 자동 생성: scripts/generate-boot-logo.py (Pretendard ExtraBold 의 D · I · O 윤곽 + 쓰는 순서대로 획별 펜 선). 손으로 고치지 않는다.',
        '// 좌표는 글꼴 단위(2048 = 글자 크기 1)이고 대문자 위가 y 0, 기준선이 y 1448 이다.',
        f'export const BOOT_LOGO_ADVANCE = {x};',
        f'export const BOOT_LOGO_PEN_WIDTH = {PEN_WIDTH};',
        'export const BOOT_LOGO_LETTERS = [',
    ]
    for r in rows:
        strokes = ''.join(f"\n      {{ length: {st['length']}, pen: '{st['pen']}' }}," for st in r['strokes'])
        lines.append(f"  {{ letter: '{r['letter']}',\n    glyph: '{r['glyph']}',\n    strokes: [{strokes}\n    ] }},")
    lines.append('];')
    OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(OUT, x, [[st['length'] for st in r['strokes']] for r in rows])


if __name__ == '__main__':
    main()
