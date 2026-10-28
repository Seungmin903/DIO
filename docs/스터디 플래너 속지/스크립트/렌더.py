"""시안.html → 목업/*.jpg (크롬 헤드리스, 2배 해상도)

실행:  python "docs/스터디 플래너 속지/스크립트/렌더.py"
속지 전체(가로 · 세로 × 예시 · 빈 속지 · 영역 지도 · 종이 색)와 인터랙션 단계 장면을 찍는다.
장면은 시안.html?scene=이름 으로 고정한 상태를 찍어 해당 영역만 잘라 낸다.
"""
import subprocess
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "목업"
PAGE = (ROOT / "시안.html").resolve().as_uri()
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SIZE = {"land": (1280, 800), "port": (800, 1280)}
K = 2

# (파일 이름, 방향, 쿼리)
PAGES = [
    ("가로 예시", "land", ""),
    ("세로 예시", "port", ""),
    ("가로 빈 속지", "land", "&blank"),
    ("세로 빈 속지", "port", "&blank"),
    ("가로 영역 지도", "land", "&blank&map"),
    ("세로 영역 지도", "port", "&blank&map"),
    ("가로 아이보리", "land", "&paper=FFF8E7"),
    ("세로 하늘", "port", "&paper=EDF3FA"),
]

# (파일 이름, 장면, 자를 영역 x, y, w, h — 가로 속지 좌표)
TIME_CROP = (456, 116, 444, 196)
TODO_CROP = (36, 116, 400, 120)
SCENES = [
    ("단계 1 칠하는 중", "fill1", TIME_CROP),
    ("단계 2 칸 채움", "fill2", TIME_CROP),
    ("색 바꾸기 1", "recolor1", TIME_CROP),
    ("색 바꾸기 2", "recolor2", TIME_CROP),
    ("지우기", "erase", TIME_CROP),
    ("할 일 칠하는 중", "band1", TODO_CROP),
    ("할 일 칠함", "band2", TODO_CROP),
    ("체크 그리는 중", "check1", TODO_CROP),
    ("체크 완성", "check2", TODO_CROP),
]


def shoot(query, orient, png):
    w, h = SIZE[orient]
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={K}",
           f"--window-size={w},{h}", "--virtual-time-budget=8000", f"--screenshot={png}", f"{PAGE}?bare&o={orient}{query}"]
    subprocess.run(cmd, capture_output=True, timeout=90)
    return Image.open(png).convert("RGB")


def main():
    OUT.mkdir(exist_ok=True)
    tmp = OUT / "_tmp.png"
    for name, orient, query in PAGES:
        shoot(query, orient, tmp).save(OUT / f"{name}.jpg", quality=90, optimize=True)
        print("ok", name)
    for name, sc, (x, y, w, h) in SCENES:
        im = shoot(f"&scene={sc}", "land", tmp)
        pad = 8
        im.crop(((x - pad) * K, (y - pad) * K, (x + w + pad) * K, (y + h + pad) * K)).save(OUT / f"{name}.jpg", quality=92, optimize=True)
        print("ok", name)
    tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
