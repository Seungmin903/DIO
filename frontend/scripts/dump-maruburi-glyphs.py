"""속지에 넣을 MaruBuri 글자 윤곽 → scripts/out/maruburi-glyphs.json

속지의 인쇄 글자는 글꼴 파일이 아니라 **글자 윤곽(path)** 이다. 속지 설정에서 글꼴을 바꾸면
paperFont.js 가 그 윤곽을 고른 글꼴의 윤곽으로 바꿔 끼운다(src/editor/templates/paperFont.js).
바꿔 끼우려면 묶음이 반드시 이 모양이어야 한다 — 아니면 readGroup 이 null 을 돌려주고 그 글자만
원본 글꼴로 남는다.

    <g aria-label="잉크"><path d="..." transform="translate(x y) scale(s -s)"/>…</g>

  · 공백이 아닌 글자마다 <path> 하나
  · 모든 path 의 scale(s) 과 translate 의 y 가 같아야 한다
  · 윤곽 상자 크기가 MaruBuri Regular 나 Bold 와 맞아야 굵기를 알아본다(maruburi.js 확인표)

이 스크립트는 글자별 [가로 폭, 윤곽 path] 를 1000 단위 · y 위쪽이 + 인 좌표로 내놓는다.
속지를 만드는 쪽(generate-ink-record-paper.mjs)이 이 값을 읽어 자리만 잡는다.

실행:  pip install fonttools
       python frontend/scripts/dump-maruburi-glyphs.py
"""
import json
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / 'out'
FONTS = {
    'R': ROOT / 'assets/fonts/maruburi/MaruBuri-Regular.ttf',
    'B': ROOT / 'assets/fonts/maruburi/MaruBuri-Bold.ttf',
}
# 발색 기록 속지에 찍히는 글자 + 실행 중에 채우는 HEX 글자
CHARS = sorted(set('발색기록 잉크글리터테' + '0123456789ABCDEF#'))


def outlines(path):
    font = TTFont(str(path))
    upem = font['head'].unitsPerEm
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = 1000 / upem
    out = {}
    for ch in CHARS:
        name = cmap.get(ord(ch))
        if name is None:
            print(f'  빠짐: {ch!r}', file=sys.stderr)
            continue
        pen = SVGPathPen(glyphs, ntos=lambda v: f'{v * scale:.1f}'.rstrip('0').rstrip('.') or '0')
        glyphs[name].draw(pen)
        out[ch] = [round(glyphs[name].width * scale, 1), pen.getCommands()]
    return out


def main():
    OUT.mkdir(exist_ok=True)
    data = {weight: outlines(path) for weight, path in FONTS.items()}
    target = OUT / 'maruburi-glyphs.json'
    target.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    print('저장:', target, f'{target.stat().st_size // 1024} KB',
          '글자', len(data['R']), '/', len(CHARS))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
