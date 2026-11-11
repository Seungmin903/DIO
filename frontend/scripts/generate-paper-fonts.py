"""속지 글꼴 글자 윤곽 → frontend/src/editor/templates/paperFonts/*.js

속지(날짜 · 월간 · 주간 · 하루 계획 · 일기 · 스크랩 · 스터디 / 데일리 플래너)의 인쇄 글자는 모두 MaruBuri 글자 윤곽(path)이다.
속지 설정에서 글꼴을 바꾸면 앱이 최종 SVG 의 글자 묶음(<g aria-label>)을 고른 글꼴의 윤곽으로 다시 놓는다(src/editor/templates/paperFont.js).
이 스크립트는 그때 쓸 두 가지를 만든다.
  1) maruburi.js   — 원본 글자 확인표: 글자마다 [Regular 폭, 윤곽 가로, 윤곽 세로, Bold 폭, 윤곽 가로, 윤곽 세로]
                     (원본 SVG 의 글자 묶음이 Regular 인지 Bold 인지, 그리고 원래 폭을 알아내는 데 쓴다. 원본 SVG 의 윤곽은 모양은 같고 시작점 · 순서만 달라
                      path 문자열로는 못 알아보므로 윤곽 상자 크기로 가른다)
  2) <글꼴 id>.js  — 바꿀 글꼴의 글자 윤곽 { R: { 글자: [폭, path] }, B: ... | null }, size(MaruBuri 와 숫자 높이를 맞추는 배율)
쓰는 글자는 속지에 나오는 글자 전부(속지 SVG 의 aria-label · 날짜 글자표 · 플래너 글자표)다.
글꼴에 없는 글자는 고운돋움 글자로 채운다. Bold 가 없는 글꼴은 B 를 null 로 두고 앱이 덧선으로 굵게 만든다.

폰트 파일은 저장소의 frontend/assets/fonts 와 node_modules/@expo-google-fonts 에 있는 것을 쓴다(OFL).
실행:  pip install fonttools
       python frontend/scripts/generate-paper-fonts.py
"""
import glob
import json
import re
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / 'src/editor/templates'
OUT = TEMPLATES / 'paperFonts'

FONTS = {
    'maruburi': {'label': '마루부리', 'R': 'assets/fonts/maruburi/MaruBuri-Regular.ttf', 'B': 'assets/fonts/maruburi/MaruBuri-Bold.ttf'},
    'gowun-batang': {'label': '고운바탕', 'R': 'assets/fonts/gowunbatang/GowunBatang-Regular.ttf', 'B': 'assets/fonts/gowunbatang/GowunBatang-Bold.ttf'},
    'nanum-gothic': {'label': '나눔고딕', 'R': 'node_modules/@expo-google-fonts/nanum-gothic/400Regular/NanumGothic_400Regular.ttf', 'B': 'node_modules/@expo-google-fonts/nanum-gothic/700Bold/NanumGothic_700Bold.ttf'},
    'nanum-myeongjo': {'label': '나눔명조', 'R': 'node_modules/@expo-google-fonts/nanum-myeongjo/400Regular/NanumMyeongjo_400Regular.ttf', 'B': 'node_modules/@expo-google-fonts/nanum-myeongjo/700Bold/NanumMyeongjo_700Bold.ttf'},
    'gowun-dodum': {'label': '고운돋움', 'R': 'assets/fonts/gowundodum/GowunDodum-Regular.ttf'},
    'nanum-pen': {'label': '나눔손글씨 펜', 'R': 'node_modules/@expo-google-fonts/nanum-pen-script/400Regular/NanumPenScript_400Regular.ttf'},
    'poor-story': {'label': '푸어스토리', 'R': 'node_modules/@expo-google-fonts/poor-story/400Regular/PoorStory_400Regular.ttf'},
}
FALLBACK = 'gowun-dodum'
DIGITS = '0123456789'


def runtime_chars():
    """속지 SVG 에는 없지만 앱이 **실행 중에** 찍는 글자.
    목록은 src/editor/templates/paperRuntimeChars.js 하나만 본다 — 여기에 또 적으면 둘이 어긋난다."""
    source = (TEMPLATES / 'paperRuntimeChars.js').read_text(encoding='utf-8')
    match = re.search(r"PAPER_RUNTIME_CHARS\s*=\s*\[\.\.\.'([^']*)'\]", source)
    if not match:
        raise SystemExit('paperRuntimeChars.js 에서 글자 목록을 읽지 못했습니다')
    return set(match.group(1))


def charset():
    """속지에 나오는 글자 전부: 속지 SVG 의 aria-label · 날짜 글자표 · 플래너 글자표 + 실행 중에 찍는 글자"""
    chars = {' '} | runtime_chars()
    # 속지 SVG **전부**를 훑는다. 전에는 undated 와 reusable 만 봐서 먼슬리 · 위클리 · 데일리에만
    # 나오는 글자 43자가 표에서 빠져 있었고, 속지 글꼴을 바꿔도 그 글자들만 마루부리로 남았다
    # (2026-11-11 실측: 가·같·게·격·꼭·다·되·또·로·마·맛·먹… 과 h·i·t·w).
    files = sorted(glob.glob(str(ROOT / 'assets/templates/**/*.svg'), recursive=True))
    for file in files:
        text = Path(file).read_text(encoding='utf-8')
        for match in re.finditer(r'aria-label="([^"]*)"', text):
            chars.update(match.group(1).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>'))
    for name in ('studyPlannerGlyphs.js', 'datedGlyphs.js'):
        chars.update(re.findall(r'^\s+"(.)": \[', (TEMPLATES / name).read_text(encoding='utf-8'), re.M))
    return sorted(chars)


def ntos(value):
    text = f'{value:.1f}'.rstrip('0').rstrip('.')
    return '0' if text in ('-0', '') else text


TOKEN = re.compile(r'([MLQCHVZ])|(-?\d+(?:\.\d+)?)')
ARGS = {'M': 2, 'L': 2, 'Q': 4, 'C': 6, 'H': 1, 'V': 1}


def box(path):
    """path(절대 좌표 M L Q C H V Z)의 점 · 조절점이 이루는 상자의 [가로, 세로]. JS 쪽 paperFont.js 의 boxOf 와 같은 계산."""
    tokens = [(m.group(1), m.group(2)) for m in TOKEN.finditer(path)]
    xs, ys, command, i = [], [], None, 0
    while i < len(tokens):
        letter, number = tokens[i]
        if letter:
            command = letter
            i += 1
            continue
        count = ARGS[command]
        values = [float(tokens[i + k][1]) for k in range(count)]
        i += count
        if command == 'H':
            xs.append(values[0])
        elif command == 'V':
            ys.append(values[0])
        else:
            xs += values[0::2]
            ys += values[1::2]
    return [round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)] if xs and ys else [0, 0]


class Face:
    def __init__(self, path):
        self.font = TTFont(ROOT / path)
        self.cmap = self.font.getBestCmap()
        self.glyphs = self.font.getGlyphSet()
        self.k = 1000 / self.font['head'].unitsPerEm

    def has(self, ch):
        return ord(ch) in self.cmap

    def glyph(self, ch, rounded=True):
        """[폭, path] — 1000 단위, y 위쪽이 +. rounded=False 는 원본 SVG 와 같은 모양(해시 비교용)"""
        glyph = self.glyphs[self.cmap[ord(ch)]]
        pen = SVGPathPen(self.glyphs, ntos=ntos) if rounded else SVGPathPen(self.glyphs, ntos=str)  # str: 원본 SVG 와 같은 숫자 모양(803.0)
        glyph.draw(TransformPen(pen, (self.k, 0, 0, self.k, 0, 0)) if self.k != 1 else pen)
        return [round(glyph.width * self.k), pen.getCommands()]

    def height(self, ch):
        pen = __import__('fontTools.pens.boundsPen', fromlist=['BoundsPen']).BoundsPen(self.glyphs)
        self.glyphs[self.cmap[ord(ch)]].draw(pen)
        return (pen.bounds[3] - pen.bounds[1]) * self.k if pen.bounds else 0


def js_table(table):
    return '{\n' + ',\n'.join(f'    {json.dumps(ch, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False)}' for ch, value in table.items()) + '\n  }'


def main():
    chars = charset()
    faces = {font_id: {weight: Face(path) for weight, path in spec.items() if weight in ('R', 'B')} for font_id, spec in FONTS.items()}
    OUT.mkdir(exist_ok=True)

    # 1) 원본 확인표 (MaruBuri). 윤곽 상자는 SVGPathPen 의 원래 출력으로 잰다.
    reference = {}
    for ch in chars:
        row = []
        for weight in ('R', 'B'):
            width, path = faces['maruburi'][weight].glyph(ch, rounded=False)
            row += [width, *box(path)]
        reference[ch] = row
    (OUT / 'maruburi.js').write_text(
        '// 자동 생성 파일 — frontend/scripts/generate-paper-fonts.py 로 다시 만든다. 직접 고치지 않는다.\n'
        '// 속지 원본 글자(MaruBuri) 확인표: 글자 → [Regular 폭, 윤곽 가로, 윤곽 세로, Bold 폭, 윤곽 가로, 윤곽 세로] (1000 단위). NAVER https://hangeul.naver.com/font\n'
        f'export default {json.dumps(reference, ensure_ascii=False, separators=(",", ":"))}\n', encoding='utf-8', newline='\n')

    # 숫자 높이로 맞춘 배율: MaruBuri 숫자와 같은 높이가 되게 한다(손글씨 글꼴은 작게 보여서)
    def digit_height(face):
        return sum(face.height(d) for d in DIGITS) / len(DIGITS)

    base = digit_height(faces['maruburi']['R'])
    for font_id, spec in FONTS.items():
        if font_id == 'maruburi':
            continue
        regular, bold = faces[font_id]['R'], faces[font_id].get('B')
        size = round(max(0.8, min(1.45, base / digit_height(regular))), 3)
        tables = {'R': {}, 'B': {} if bold else None}
        missing = []
        for ch in chars:
            for weight, face in (('R', regular), ('B', bold)):
                if face is None:
                    continue
                if not face.has(ch):
                    face = faces[FALLBACK]['R']
                    missing.append(ch)
                tables[weight][ch] = face.glyph(ch)
        body = f'  R: {js_table(tables["R"])},\n  B: ' + (js_table(tables['B']) if bold else 'null')
        (OUT / f'{font_id}.js').write_text(
            '// 자동 생성 파일 — frontend/scripts/generate-paper-fonts.py 로 다시 만든다. 직접 고치지 않는다.\n'
            f'// 속지 글꼴 {spec["label"]} 글자 윤곽: 글자 → [폭, path] (1000 단위, y 위쪽이 +). size 는 MaruBuri 와 숫자 높이를 맞추는 배율. OFL\n'
            f'export default {{\n  size: {size},\n{body},\n}}\n', encoding='utf-8', newline='\n')
        print(font_id, 'size', size, 'bold', 'real' if bold else 'synthetic', 'fallback', ''.join(sorted(set(missing))) or '-', (OUT / f'{font_id}.js').stat().st_size // 1024, 'KB')
    print('maruburi 확인표', (OUT / 'maruburi.js').stat().st_size // 1024, 'KB', '글자', len(chars))


if __name__ == '__main__':
    sys.exit(main())
