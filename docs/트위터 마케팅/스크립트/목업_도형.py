# -*- coding: utf-8 -*-
"""트위터 마케팅 시안 공통 — 최종 시안(디오 · 두리) 벡터 임베드 · 팔레트 · 소품 · 렌더(크롬 헤드리스)

캐릭터 원본은 `docs/캐릭터 디자인/최종시안 svg 변경본.svg` (4249 × 2477, 디오 왼쪽 · 두리 오른쪽).
이 파일을 복사하지 않고 읽어서 <defs> 안에 한 번만 넣고, 영역(REGIONS)을 잘라 `art()` 로 놓는다 → 최종 시안이 바뀌면 시안 전체가 따라 바뀐다.
스티커는 `캐릭터 디자인/스크립트/캐릭터_도형.py` 의 `sticker()` 를 그대로 쓴다(앱 스티커 팩과 같은 모양).
"""
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
DOC = HERE.parent
DOCS = DOC.parent
FINAL = DOCS / "캐릭터 디자인" / "최종시안 svg 변경본.svg"
LOGO = DOCS.parent / "frontend" / "assets" / "brand" / "dio-logo.svg"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

sys.path.insert(0, str(DOCS / "캐릭터 디자인" / "스크립트"))
import 캐릭터_도형 as ch  # noqa: E402  sticker() · g() · star_path() · sparkle_path()

# ───────────────────────── 팔레트 ─────────────────────────
NAVY = "#0B1957"        # 앱 text 토큰 — 글자
SOFT = "#CED9EE"        # 앱 배경(surfaceSoft) — 계정 바탕의 기본색
PRIMARY = "#6E92C6"
ACCENT = "#9FB6D9"      # 로고 테마 원
MUTED = "#EEF2F9"
WHITE = "#FFFFFF"
CREAM = "#FEF0BF"       # 최종 시안 — 디오 표지
LILAC = "#DBDCF9"       # 최종 시안 — 두리 목도리 · 다리
COAT = "#F7F7FC"        # 최종 시안 — 두리 코트
INK = "#010101"         # 최종 시안 — 먹선
FONT = "'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif"
HAND = "'Poor Story','Gaegu','Nanum Pen Script','Pretendard',cursive"   # 앱 캔버스 글꼴(푸어스토리)과 같은 손글씨 — 구글 폰트(OFL)
FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poor+Story&amp;family=Gaegu:wght@400;700&amp;display=swap">'

# ───────────────────────── 최종 시안 영역 (원본 좌표 4249 × 2477) ─────────────────────────
# (x, y, w, h). debug_grid() 로 눈금을 얹어 확인한 값.
REGIONS = {
    "all": (0, 0, 4249, 2477),
    "dio_all": (-30, 300, 1940, 2180),       # 디오 전체(다리 · 책갈피 포함)
    "dio_body": (-30, 300, 1940, 1920),      # 디오 몸(다리 제외)
    "dio_cover": (-30, 300, 1620, 1930),     # 디오 앞표지만(책등 · 책갈피 제외)
    "dio_face": (72, 535, 1360, 1360),       # 디오 얼굴 클로즈업(정사각, 표지 안쪽만)
    "duri_all": (1960, -30, 2300, 2520),     # 두리 전체(목도리 꼬리 포함)
    "duri_body": (1960, -30, 1480, 2520),    # 두리(꼬리 일부 제외)
    "duri_head": (2110, -30, 1270, 1250),    # 두리 머리 + 목도리 띠
}


def _final_inner():
    s = FINAL.read_text(encoding="utf-8")
    m = re.search(r'<g clip-path="url\(#clip0\)" transform="translate\(870 -53\)">(.*)</g>', s, re.S)
    return m.group(1)


def defs():
    """최종 시안 본체 + 영역별 클립. 모든 SVG 문서 맨 앞에 한 번 넣는다."""
    clips = "".join(f'<clipPath id="clip_{k}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath>' for k, (x, y, w, h) in REGIONS.items())
    return (f'<defs><clipPath id="finalclip"><rect x="-870" y="53" width="4249" height="2477"/></clipPath>'
            f'<g id="finalart" clip-path="url(#finalclip)" transform="translate(870 -53)">{_final_inner()}</g>{clips}</defs>')


def art(region, x, y, w=None, h=None, rot=0, flip=False, extra=""):
    """영역(region)을 (x, y) 에 놓는다. 가로 w 또는 세로 h 중 하나로 크기를 정한다. rot 는 영역 가운데 기준(도)."""
    rx, ry, rw, rh = REGIONS[region]
    k = (w / rw) if w else (h / rh)
    dw, dh = rw * k, rh * k
    t = f"translate({x:.2f},{y:.2f})"
    if rot:
        t += f" rotate({rot} {dw / 2:.2f} {dh / 2:.2f})"
    t += f" scale({k:.5f})"
    if flip:
        t += f" translate({rx + rw / 2:.1f},0) scale(-1,1) translate({-(rx + rw / 2):.1f},0)"
    t += f" translate({-rx},{-ry})"
    return f'<g transform="{t}" {extra}><use href="#finalart" clip-path="url(#clip_{region})"/></g>'


def art_c(region, cx, cy, w=None, h=None, **kw):
    """art() 와 같지만 (cx, cy) 가 영역의 가운데."""
    rx, ry, rw, rh = REGIONS[region]
    k = (w / rw) if w else (h / rh)
    return art(region, cx - rw * k / 2, cy - rh * k / 2, w=w, h=h, **kw)


def logo(x, y, h, ink="#242424", accent=ACCENT):
    """DIO 로고(D 심볼 + 테마 원). 원본 746×836, viewBox 6 -16 746 836."""
    k = h / 836
    body = (f'<path d="M431 106C408 96 383 94 350 94H72V754H350C534 754 686 622 686 424C686 357 664 297 624 251" stroke="{ink}" stroke-width="132" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
            f'<rect x="218" y="356" width="277" height="44" rx="22" fill="{ink}"/><rect x="218" y="452" width="195" height="44" rx="22" fill="{ink}"/>'
            f'<circle cx="607" cy="74" r="90" fill="{accent}"/>')
    return f'<g transform="translate({x:.2f},{y:.2f}) scale({k:.5f}) translate(-6,16)">{body}</g>'


def svg_doc(w, h, body, bg=None, extra_defs=""):
    bgrect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{defs()}{extra_defs}{bgrect}{body}</svg>')


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size=24, weight=800, fill=NAVY, anchor="start", extra=""):
    return f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" {extra}>{esc(s)}</text>'


def sticker(kind, x, y, size=60, rot=0):
    """앱 스티커(지름 ≈ 20 단위) 를 size px 로. rot 도."""
    k = size / 20
    inner = ch.sticker(kind, 0, 0, 1.0)
    return f'<g transform="translate({x:.1f},{y:.1f}) rotate({rot}) scale({k:.3f})">{inner}</g>'


def tape(x, y, w, h, rot=-3, color="#FAD3DC", mark="#F59AB2", pattern="dots", opacity=0.92):
    """마스킹 테이프 조각. 양 끝을 톱니로 자른다."""
    n = max(3, int(h // 7))
    zig_l = " ".join(f"{-2 if i % 2 == 0 else 4},{i * h / n:.1f}" for i in range(n + 1))
    zig_r = " ".join(f"{w + (2 if i % 2 == 0 else -4)},{(n - i) * h / n:.1f}" for i in range(n + 1))
    poly = f"{zig_l} {zig_r}"
    deco = ""
    if pattern == "dots":
        deco = "".join(f'<circle cx="{cx}" cy="{cy}" r="{max(1.6, h * 0.07):.1f}" fill="{mark}" opacity=".85"/>'
                       for cx in range(10, int(w) - 6, 22) for cy in (h * 0.3, h * 0.7))
    elif pattern == "stripes":
        deco = "".join(f'<rect x="{cx}" y="0" width="{max(3, h * .16):.1f}" height="{h}" fill="{mark}" opacity=".5"/>' for cx in range(6, int(w) - 4, 18))
    elif pattern == "check":
        deco = "".join(f'<rect x="{cx}" y="{cy}" width="{h * .25:.1f}" height="{h * .25:.1f}" fill="{mark}" opacity=".45"/>'
                       for i, cx in enumerate(range(0, int(w), int(h * .25) or 6)) for cy in ([0, h * .5] if i % 2 == 0 else [h * .25, h * .75]))
    return (f'<g transform="translate({x},{y}) rotate({rot})" opacity="{opacity}">'
            f'<clipPath id="tp{abs(hash((x, y, w))) % 99999}"><polygon points="{poly}"/></clipPath>'
            f'<polygon points="{poly}" fill="{color}"/>'
            f'<g clip-path="url(#tp{abs(hash((x, y, w))) % 99999})">{deco}</g></g>')


def dotted_paper(w, h, base=SOFT, dot="#B7C6E4", step=34, r=2.2):
    """도트 속지 바탕."""
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{dot}"/>' for x in range(step // 2, w, step) for y in range(step // 2, h, step))
    return f'<rect width="{w}" height="{h}" fill="{base}"/>{dots}'


def photo_placeholder(x, y, w, h, kind="sky", rx=0):
    """'오늘의 한 장' 사진 자리 — 일러스트 풍경(실제 사진이 아님을 시안에서 분명히)."""
    pid = f"ph{abs(hash((x, y, w, h, kind))) % 99999}"
    if kind == "sky":
        sky, hill1, hill2, sun = "#BFD7F2", "#9CC8A8", "#7FB591", "#FFE29A"
    elif kind == "dusk":
        sky, hill1, hill2, sun = "#F6C9C0", "#9AA6D4", "#7E88BD", "#FFF1C9"
    elif kind == "cafe":
        sky, hill1, hill2, sun = "#F3E3C8", "#D9A87F", "#B98760", "#FFFFFF"
    elif kind == "snow":
        sky, hill1, hill2, sun = "#D5E3F7", "#F4F8FF", "#E4EDFA", "#FFFFFF"
    else:
        sky, hill1, hill2, sun = "#CFE8E0", "#8FD3B6", "#6FB899", "#FFF1C2"
    return (f'<clipPath id="{pid}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/></clipPath>'
            f'<g clip-path="url(#{pid})"><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{sky}"/>'
            f'<circle cx="{x + w * .74:.1f}" cy="{y + h * .3:.1f}" r="{min(w, h) * .12:.1f}" fill="{sun}"/>'
            f'<path d="M{x},{y + h * .72:.1f} Q{x + w * .3:.1f},{y + h * .5:.1f} {x + w * .55:.1f},{y + h * .7:.1f} T{x + w},{y + h * .66:.1f} L{x + w},{y + h} L{x},{y + h} Z" fill="{hill1}"/>'
            f'<path d="M{x},{y + h * .86:.1f} Q{x + w * .35:.1f},{y + h * .68:.1f} {x + w * .7:.1f},{y + h * .86:.1f} T{x + w},{y + h * .82:.1f} L{x + w},{y + h} L{x},{y + h} Z" fill="{hill2}"/></g>')


def polaroid(x, y, w, h, rot=0, kind="sky", pad=None, bottom=None, caption=None, cap_size=None):
    """폴라로이드 틀 + 사진 자리. caption 은 아래 흰 띠에 손글씨로(틀과 함께 기울어진다)."""
    pad = pad or w * 0.07
    bottom = bottom or w * 0.2
    inner = photo_placeholder(x + pad, y + pad, w - 2 * pad, h - pad - bottom, kind)
    cap = ""
    if caption:
        size = cap_size or bottom * 0.62
        cap = f'<text x="{x + w / 2:.1f}" y="{y + h - bottom * 0.3:.1f}" font-family="{HAND}" font-size="{size:.0f}" fill="{NAVY}" text-anchor="middle">{esc(caption)}</text>'
    return (f'<g transform="rotate({rot} {x + w / 2:.1f} {y + h / 2:.1f})">'
            f'<rect x="{x + 3}" y="{y + 6}" width="{w}" height="{h}" rx="4" fill="#0B1957" opacity=".16"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="#FFFFFF"/>{inner}{cap}</g>')


# ───────────────────────── 렌더 ─────────────────────────
def render(svg_text, out_path, w, h, scale=2, fmt=None, quality=90):
    """SVG 문자열 → 이미지(png/jpg). 크롬 헤드리스, 절대 경로, 창 크기 = svg 크기."""
    out_path = Path(out_path).resolve()
    fmt = fmt or out_path.suffix.lstrip(".").lower().replace("jpeg", "jpg")
    tmp = Path(tempfile.mkdtemp(prefix="dio-tw-"))
    try:
        page = tmp / "p.html"
        page.write_text(f'<!doctype html><html><head><meta charset="utf-8">{FONT_LINK}<style>html,body{{margin:0;background:#fff;overflow:hidden}}svg{{display:block}}</style></head><body>{svg_text}</body></html>', encoding="utf-8")
        png = tmp / "p.png"
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={scale}", "--virtual-time-budget=8000",
                        f"--window-size={w},{h + 40}", f"--screenshot={png}", page.as_uri()], check=True, capture_output=True, timeout=180)
        im = Image.open(png).crop((0, 0, int(w * scale), int(h * scale)))  # 창을 40px 크게 잡고 잘라 아래쪽이 비는 것을 막는다
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "jpg":
            im.convert("RGB").save(out_path, quality=quality, optimize=True)
        else:
            im.save(out_path, optimize=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out_path


def render_html(html_text, out_path, w, h, scale=2, quality=90):
    """HTML 문자열 → 이미지. 폰 프로필 · 트윗 목업처럼 글이 많은 화면용."""
    out_path = Path(out_path).resolve()
    fmt = out_path.suffix.lstrip(".").lower().replace("jpeg", "jpg")
    tmp = Path(tempfile.mkdtemp(prefix="dio-tw-"))
    try:
        page = tmp / "p.html"
        page.write_text(html_text, encoding="utf-8")
        png = tmp / "p.png"
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={scale}", "--virtual-time-budget=8000",
                        f"--window-size={w},{h + 40}", f"--screenshot={png}", page.as_uri()], check=True, capture_output=True, timeout=180)
        im = Image.open(png).crop((0, 0, int(w * scale), int(h * scale)))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "jpg":
            im.convert("RGB").save(out_path, quality=quality, optimize=True)
        else:
            im.save(out_path, optimize=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out_path


def debug_grid(out_path, region="all", step=200, width=1800):
    """영역 좌표 확인용 — 원본 좌표 눈금을 얹어 그린다."""
    x, y, w, h = REGIONS[region]
    k = width / w
    body = f'<g transform="scale({k:.5f}) translate({-x},{-y})"><use href="#finalart"/>'
    for gx in range((x // step) * step, x + w + 1, step):
        body += f'<line x1="{gx}" y1="{y}" x2="{gx}" y2="{y + h}" stroke="#E5484D" stroke-width="3" opacity=".5"/><text x="{gx + 8}" y="{y + 60}" font-size="46" fill="#E5484D" font-family="{FONT}">{gx}</text>'
    for gy in range((y // step) * step, y + h + 1, step):
        body += f'<line x1="{x}" y1="{gy}" x2="{x + w}" y2="{gy}" stroke="#0B65E5" stroke-width="3" opacity=".5"/><text x="{x + 8}" y="{gy - 8}" font-size="46" fill="#0B65E5" font-family="{FONT}">{gy}</text>'
    body += "</g>"
    return render(svg_doc(width, int(h * k), body, bg="#FFFFFF"), out_path, width, int(h * k), scale=1)


if __name__ == "__main__":
    out = debug_grid(Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "눈금.png")
    print(out)
