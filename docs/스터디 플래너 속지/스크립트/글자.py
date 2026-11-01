"""플래너 속지(스터디 · 데일리) 글자 윤곽 → frontend/src/editor/templates/studyPlannerGlyphs.js

다른 속지(하루 계획 등)처럼 글자를 MaruBuri 윤곽선으로 그리기 위해, 속지에 쓰는 글자만 뽑아 둔다.
폰트 파일은 저장소에 넣지 않는다. 네이버 한글 글꼴에서 받아 폴더를 넘긴다.
  https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Regular.ttf
  https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Bold.ttf

실행:  pip install fonttools
       python "docs/스터디 플래너 속지/스크립트/글자.py" <MaruBuri ttf 폴더>
속지에 새 글자를 쓰면 아래 TEXT 에 넣고 다시 만든다(없는 글자는 속지를 그릴 때 오류가 난다).
"""
import json
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

DIGITS = "0123456789"
TEXT = {
    # 제목 · 칸 묶음 제목(TO DO LIST 등) · 큰 합계 숫자
    "Bold": "스터디 플래너 데일리 TO DO LIST TIMELINE RECORD" + DIGITS + "시간분",
    # 머리줄 · 소제목 · 칸 이름 · 숫자
    "Regular": "날짜 월화수목금토일 D- 오늘의 목표 완료 할 일 색 메모 총 공부 시간 "
               "시간 분포 오늘 돌아보기 오늘 만족도 쉬는 시간 쉼 분 종일 시작 진행 오전 오후" + DIGITS + ":~%.",
}
OUT = Path(__file__).resolve().parents[3] / "frontend/src/editor/templates/studyPlannerGlyphs.js"


def glyphs(font_path, chars):
    font = TTFont(font_path)
    cmap, glyph_set = font.getBestCmap(), font.getGlyphSet()
    out = {}
    for ch in sorted(set(chars)):
        glyph = glyph_set[cmap[ord(ch)]]
        pen = SVGPathPen(glyph_set)
        glyph.draw(pen)
        out[ch] = [glyph.width, pen.getCommands()]
    return out


def main():
    folder = Path(sys.argv[1])
    data = {key[0]: glyphs(folder / f"MaruBuri-{key}.ttf", text) for key, text in TEXT.items()}
    body = ",\n".join(f"  {weight}: {{\n" + ",\n".join(f"    {json.dumps(ch, ensure_ascii=False)}: {json.dumps(v)}" for ch, v in table.items()) + "\n  }" for weight, table in data.items())
    OUT.write_text(
        "// 자동 생성 파일 — docs/스터디 플래너 속지/스크립트/글자.py 로 다시 만든다. 직접 고치지 않는다.\n"
        "// MaruBuri Regular(R) · Bold(B) 글자 윤곽 [가로 폭, path]. 1000 단위, y 위쪽이 +. NAVER https://hangeul.naver.com/font\n"
        f"export const GLYPHS = {{\n{body},\n}}\n", encoding="utf-8", newline="\n")
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
