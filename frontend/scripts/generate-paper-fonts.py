"""속지 원본 글꼴(MaruBuri) 확인표 → frontend/src/editor/templates/paperFonts/maruburi.js

속지(날짜 · 월간 · 주간 · 하루 계획 · 일기 · 스크랩 · 스터디 / 데일리 플래너 · 발색 기록)의 인쇄 글자는
모두 MaruBuri 글자 윤곽(path)이다. 속지 설정에서 다른 글꼴을 고르면 앱이 그 묶음(<g aria-label>)을
**진짜 글꼴로 쓴 <text>** 로 바꾼다(src/editor/templates/paperFont.js · paperTextFont.js).

그때 알아야 하는 것이 두 가지인데, SVG 에는 글자 윤곽만 있고 적혀 있지 않다.
  · 그 묶음이 Regular 인지 Bold 인지 (원본 윤곽은 모양이 같고 시작점 · 순서만 달라 path 문자열로는 못 가른다)
  · 묶음이 차지한 폭 (글자 폭은 윤곽에 없다)
그래서 글자마다 [Regular 폭, 윤곽 가로, 윤곽 세로, Bold 폭, 윤곽 가로, 윤곽 세로] 를 적어 둔다.
쓰는 글자는 속지에 나오는 글자 전부(속지 SVG 의 aria-label · 앱이 실행 중에 찍는 글자)다.

2026-11-11 이전에는 바꿀 글꼴 여섯 벌의 **글자 윤곽 표**(1.8MB)도 함께 만들었다. 표에 없는 글자 ·
표를 안 뜬 글꼴이 그대로 남는 문제가 있어 없앴다(S15P31F106-848).

폰트 파일은 저장소의 frontend/assets/fonts 에 있는 것을 쓴다(OFL).
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
}


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

    def glyph(self, ch):
        """[폭, path] — 1000 단위, y 위쪽이 +. 숫자 모양은 원본 SVG 와 같게 둔다(803.0 처럼)."""
        glyph = self.glyphs[self.cmap[ord(ch)]]
        pen = SVGPathPen(self.glyphs, ntos=str)
        glyph.draw(TransformPen(pen, (self.k, 0, 0, self.k, 0, 0)) if self.k != 1 else pen)
        return [round(glyph.width * self.k), pen.getCommands()]


def main():
    chars = charset()
    faces = {font_id: {weight: Face(path) for weight, path in spec.items() if weight in ('R', 'B')} for font_id, spec in FONTS.items()}
    OUT.mkdir(exist_ok=True)

    # 1) 원본 확인표 (MaruBuri). 윤곽 상자는 SVGPathPen 의 원래 출력으로 잰다.
    reference = {}
    for ch in chars:
        row = []
        for weight in ('R', 'B'):
            width, path = faces['maruburi'][weight].glyph(ch)
            row += [width, *box(path)]
        reference[ch] = row
    (OUT / 'maruburi.js').write_text(
        '// 자동 생성 파일 — frontend/scripts/generate-paper-fonts.py 로 다시 만든다. 직접 고치지 않는다.\n'
        '// 속지 원본 글자(MaruBuri) 확인표: 글자 → [Regular 폭, 윤곽 가로, 윤곽 세로, Bold 폭, 윤곽 가로, 윤곽 세로] (1000 단위). NAVER https://hangeul.naver.com/font\n'
        f'export default {json.dumps(reference, ensure_ascii=False, separators=(",", ":"))}\n', encoding='utf-8', newline='\n')

    print('maruburi 확인표', (OUT / 'maruburi.js').stat().st_size // 1024, 'KB', '글자', len(chars))


if __name__ == '__main__':
    sys.exit(main())
