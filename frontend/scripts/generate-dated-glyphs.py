"""날짜 속지 글자 · 자리표 → frontend/src/editor/templates/datedGlyphs.js

날짜가 적힌 속지(표지 연도 · 구분지 달 · 먼슬리 · 위클리)는 연도마다 SVG 파일을 두지 않고,
앱이 만년형 속지 위에 날짜 글자를 얹어 그때그때 만든다(src/editor/templates/dated.js).
이 스크립트는 그때 쓸 두 가지를 뽑는다.
  1) MaruBuri 글자 윤곽: 날짜에 쓰는 글자만 (숫자 · 월 · 주차 · & · . · —)
  2) 글자 쌍 커닝: 원본 SVG 의 이웃 글자 간격에서 잰다
  3) 자리표: 2026 원본 SVG 에서 글자 묶음마다 굵기 · 크기 · 색 · 기준점(왼쪽 · 가운데 · 오른쪽)과 자리
     기준점은 글자 폭이 다른 두 장을 비교해 자리가 같은 쪽으로 정한다.
폰트 파일은 저장소에 넣지 않는다. 네이버 한글 글꼴에서 받아 폴더를 넘긴다.
  https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Regular.ttf
  https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Bold.ttf

실행:  pip install fonttools
       python frontend/scripts/generate-dated-glyphs.py <MaruBuri ttf 폴더>
"""
import json
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/templates/2026/SVG'
UNDATED = ROOT / 'assets/templates/undated'
OUT = ROOT / 'src/editor/templates/datedGlyphs.js'
NS = '{http://www.w3.org/2000/svg}'
CHARS = '0123456789월주차&.— '
WEIGHTS = {'R': 'Regular', 'B': 'Bold'}
ORIENTATIONS = ('portrait', 'landscape')
KERNING = {}  # main 에서 채운다. 글자 묶음 폭을 잴 때도 쓴다.


def load_fonts(folder):
    fonts = {}
    for key, name in WEIGHTS.items():
        font = TTFont(folder / f'MaruBuri-{name}.ttf')
        cmap, glyph_set = font.getBestCmap(), font.getGlyphSet()
        table = {}
        for ch in CHARS:
            glyph = glyph_set[cmap[ord(ch)]]
            pen = SVGPathPen(glyph_set)
            glyph.draw(pen)
            table[ch] = [glyph.width, pen.getCommands()]
        fonts[key] = table
    return fonts


def text_groups(parent):
    """aria-label 이 있고 path 가 있는 바로 아래 글자 묶음"""
    return [g for g in parent if g.tag == f'{NS}g' and g.get('aria-label') and g.find(f'{NS}path') is not None]


def measure(group, fonts):
    """글자 묶음 → 굵기 · 크기 · 색 · 시작 x · 기준선 y · 폭"""
    label = group.get('aria-label')
    paths = group.findall(f'{NS}path')
    first = [float(v) for v in re.findall(r'[-\d.]+', paths[0].get('transform'))]
    weight = next(key for key, table in fonts.items() if table[label[0]][1] == paths[0].get('d'))
    scale = first[2]
    kern = KERNING.get(weight, {})
    width = (sum(fonts[weight][ch][0] for ch in label) + sum(kern.get(label[i:i + 2], 0) for i in range(len(label) - 1))) * scale
    return {'weight': weight, 'size': round(scale * 1000, 3), 'fill': group.get('fill'), 'x': first[0], 'y': first[1], 'width': width}


def anchor_of(a, b):
    """글자 폭이 다른 두 장에서 자리가 같은 기준점"""
    for name, at in (('start', lambda m: m['x']), ('middle', lambda m: m['x'] + m['width'] / 2), ('end', lambda m: m['x'] + m['width'])):
        if abs(at(a) - at(b)) < 0.15:  # 커닝을 정수로 반올림해 생기는 오차만큼 허용
            return name, round(at(a), 3)
    raise ValueError(f'기준점을 찾지 못했어요: {a} {b}')


def slot(a, b=None):
    # 한 장뿐인 표지 연도: 왼쪽 여백(40)에서 시작하면 왼쪽, 아니면 가운데 기준
    single = ('start', round(a['x'], 3)) if abs(a['x'] - 40) < 0.5 else ('middle', round(a['x'] + a['width'] / 2, 3))
    anchor, x = anchor_of(a, b) if b else single
    return {'weight': a['weight'], 'size': a['size'], 'fill': a['fill'], 'anchor': anchor, 'x': x, 'y': round(a['y'], 3)}


def root(name):
    return ET.parse(SOURCE / name).getroot()


def layouts(fonts):
    out = {}
    for o in ORIENTATIONS:
        cover = text_groups(root(f'2026-cover-{o}.svg'))[0]
        div = [text_groups(root(f'2026-divider-{m}-{o}.svg'))[0] for m in ('03', '12')]
        mon = [root(f'2026-monthly-{m}-{o}.svg') for m in ('03', '12')]
        cal = next(e for e in mon[0] if e.get('data-calendar'))
        x, y, w, h = (float(cal.get(k)) for k in ('x', 'y', 'width', 'height'))
        rows = int(cal.get('data-rows'))
        dates = [g for g in mon[0] if g.get('data-calendar-date')]
        first_in = next(g for g in dates if g.get('data-in-month') == 'true')
        first_out = next(g for g in dates if g.get('data-in-month') == 'false')
        m_in, m_out = measure(first_in, fonts), measure(first_out, fonts)
        col = round(dates.index(first_in) % 7)
        out[o] = {
            'cover': slot(measure(cover, fonts)),
            'divider': slot(*(measure(g, fonts) for g in div)),
            'monthly': {
                'title': slot(*(measure(text_groups(r)[0], fonts) for r in mon)),
                'calendar': {'x': x, 'y': y, 'width': w, 'height': h},
                # 날짜 칸 안 글자 자리: 칸 왼쪽 위에서 떨어진 거리
                'date': {'dx': round(m_in['x'] - (x + w / 7 * col), 3), 'dy': round(m_in['y'] - (y + h / rows * (dates.index(first_in) // 7)), 3), 'size': m_in['size'],
                         'in': {'weight': m_in['weight'], 'fill': m_in['fill']}, 'out': {'weight': m_out['weight'], 'fill': m_out['fill']}},
            },
        }
        for style in ('blocks', 'journal'):
            pages = [root(f'2026-weekly-{style}-{day}-{o}.svg') for day in ('2026-03-02', '2025-12-29')]
            top = [text_groups(r) for r in pages]
            days = []
            for weekday in range(1, 8):
                found = []
                for r in pages:
                    cell = next(e for e in r if e.get('data-weekday') == str(weekday % 7))  # 일요일은 0
                    found.append(measure(next(g for g in text_groups(cell) if g.get('aria-label').isdecimal()), fonts))
                days.append(slot(*found))
            out[o]['weekly-' + style] = {'header': slot(measure(top[0][0], fonts), measure(top[1][0], fonts)),
                                         'range': slot(measure(top[0][1], fonts), measure(top[1][1], fonts)), 'days': days}
    return out


def kerning(fonts):
    """원본 SVG 의 이웃 글자 간격 - 앞 글자 폭 = 글자 쌍 커닝(1000 단위). 원본에 나온 쌍만 넣는다."""
    found = {}
    for path in sorted(SOURCE.glob('2026-*.svg')):
        for group in ET.parse(path).getroot().iter(f'{NS}g'):
            label = group.get('aria-label') or ''
            paths = group.findall(f'{NS}path')
            chars = [c for c in label if c != ' ']
            if not paths or not set(label) <= set(CHARS) or len(chars) != len(paths):
                continue
            weight = next((key for key, table in fonts.items() if table[chars[0]][1] == paths[0].get('d')), None)
            if not weight:
                continue
            numbers = [[float(v) for v in re.findall(r'[-\d.]+', p.get('transform'))] for p in paths]
            at = [i for i, c in enumerate(label) if c != ' ']
            for i in range(len(chars) - 1):
                if at[i + 1] - at[i] != 1:
                    continue
                value = round((numbers[i + 1][0] - numbers[i][0]) / numbers[i][2] - fonts[weight][chars[i]][0])
                if abs(value) >= 5:  # ±1 은 원본 자리 반올림 오차
                    found.setdefault(weight, {})[chars[i] + chars[i + 1]] = value
    return found


def check(fonts):
    """만년형에서 지운 덧줄(쓰는 칸)과 달력 줄이 예상대로인지 확인한다 — dated.js 가 같은 규칙으로 지운다."""
    for o in ORIENTATIONS:
        text = (UNDATED / f'undated-monthly-{o}.svg').read_text(encoding='utf-8')
        assert 'data-rows="6"' in text, o


def main():
    fonts = load_fonts(Path(sys.argv[1]))
    check(fonts)
    KERNING.update(kerning(fonts))
    data = {'glyphs': fonts, 'layouts': layouts(fonts), 'kerning': KERNING}
    glyphs = ',\n'.join(f'  {w}: {{\n' + ',\n'.join(f'    {json.dumps(ch, ensure_ascii=False)}: {json.dumps(v)}' for ch, v in t.items()) + '\n  }' for w, t in data['glyphs'].items())
    OUT.write_text(
        '// 자동 생성 파일 — frontend/scripts/generate-dated-glyphs.py 로 다시 만든다. 직접 고치지 않는다.\n'
        '// 날짜 속지에 얹는 MaruBuri Regular(R) · Bold(B) 글자 윤곽 [가로 폭, path] (1000 단위, y 위쪽이 +)과\n'
        '// 2026 원본 SVG 에서 읽은 글자 자리표. NAVER https://hangeul.naver.com/font\n'
        f'export const DATED_GLYPHS = {{\n{glyphs},\n}}\n\n'
        '// 글자 쌍 커닝(1000 단위): 원본 SVG 의 이웃 글자 간격에서 잰 값\n'
        f'export const DATED_KERNING = {json.dumps(data["kerning"], ensure_ascii=False)}\n\n'
        f'export const DATED_LAYOUTS = {json.dumps(data["layouts"], ensure_ascii=False, indent=2)}\n',
        encoding='utf-8', newline='\n')
    print(OUT, OUT.stat().st_size)


if __name__ == '__main__':
    main()
