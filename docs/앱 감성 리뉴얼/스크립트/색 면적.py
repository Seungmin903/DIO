# -*- coding: utf-8 -*-
"""렌더 이미지가 화면 면적의 몇 %를 UI 계열 · 캐릭터 노랑 · 무채색 · 그 밖의 색으로 칠했는지 센다(색 규칙 v2 점검).

구분은 색 검수.py 와 같다: UI 계열 H 217~257°(설계 값 228~242° ±15°) · 캐릭터 노랑 H 35~57°(40~52° ±5°) · 이탈(그 밖). 다만 픽셀은 JPEG 압축으로 아주 옅은 색(R·G·B 차이 10 이하)의 색상각이 흔들려
(#F3F3F7 → #F3F2F7, H 240→252) 그런 옅은 색은 '옅은 색 · 무채'로 따로 센다(라벤더 틴트 바탕이 여기에 들어간다). 그래서 메인 색 점검은 'UI 계열 + 옅은 색 · 무채'의 합을 본다.
표지 · 사진 · 스티커는 사용자 콘텐츠라 '이탈'로 잡힌다 — 표지가 없는 화면(로그인 · 공방 · 내 공간 · 빈 상태)이 UI 층의 순수한 값이다.
실행:  python "docs/앱 감성 리뉴얼/스크립트/색 면적.py" [이름 조각 ...]   이름 조각이 모두 들어간 이미지만(없으면 이미지/현재 · 이미지/시안 전부)
"""
import colorsys
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent.parent
# 픽셀은 설계 값(228~242°)보다 ±15° 넓게 본다: 그림자 · 겹침 · JPEG 압축으로 색상각이 흔들린다.
UI, YELLOW = (217, 257), (35, 57)


def fractions(path: Path):
    im = Image.open(path).convert("RGB")
    im = im.resize((320, round(320 * im.height / im.width)))
    cnt = {"UI": 0, "노랑": 0, "무채": 0, "이탈": 0}
    cache = {}
    px = list(im.get_flattened_data()) if hasattr(im, 'get_flattened_data') else list(im.getdata())
    for p in px:
        k = (p[0] >> 2, p[1] >> 2, p[2] >> 2)
        z = cache.get(k)
        if z is None:
            h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in p))
            h, s, l = h * 360, s * 100, l * 100
            if max(p) - min(p) <= 10 or l >= 97 or l <= 6:
                z = "무채"
            elif UI[0] <= h <= UI[1]:
                z = "UI"
            elif YELLOW[0] <= h <= YELLOW[1]:
                z = "노랑"
            else:
                z = "이탈"
            cache[k] = z
        cnt[z] += 1
    n = len(px)
    return {k: v * 100 / n for k, v in cnt.items()}


if __name__ == "__main__":
    keys = sys.argv[1:]
    files = sorted(list((HERE / "이미지" / "현재").glob("*.jpg")) + list((HERE / "이미지" / "시안").glob("*.jpg")))
    print("| 이미지 | UI 계열 | 옅은 색 · 무채 | 캐릭터 노랑 | 그 밖 |\n|---|---:|---:|---:|---:|")
    for f in files:
        if keys and not all(k in f"{f.parent.name}/{f.stem}" for k in keys):
            continue
        r = fractions(f)
        print(f"| {f.parent.name}/{f.stem} | {r['UI']:.1f} | {r['무채']:.1f} | {r['노랑']:.1f} | {r['이탈']:.1f} |")
