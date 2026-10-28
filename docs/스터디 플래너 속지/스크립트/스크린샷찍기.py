"""스터디 플래너 레퍼런스 검색 스크린샷 — 크롬 헤드리스로 찍어 스크린샷/ 에 저장

실행:  python "docs/스터디 플래너 속지/스크립트/스크린샷찍기.py"        (전부)
       python "docs/스터디 플래너 속지/스크립트/스크린샷찍기.py" 03 07  (번호만 다시 찍기)
결과:  스크린샷/NN 이름.jpg  (폭 1280 · 세로 1600~1800)
스크린샷은 2026-10-27 기준 화면이다. 구글 이미지 검색은 한국어 검색어에서 봇 확인(reCAPTCHA)에 걸려 01 · 02 를 뺐다. 다시 찍으면 결과가 달라질 수 있다.
"""
import subprocess
import sys
import urllib.parse
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "스크린샷"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"


def naver(q, where="nexearch"):
    return f"https://search.naver.com/search.naver?where={where}&query={urllib.parse.quote(q)}"


def naver_news(q):
    return f"https://search.naver.com/search.naver?where=news&query={urllib.parse.quote(q)}&sort=1"


def youtube(q):
    return f"https://www.youtube.com/results?search_query={urllib.parse.quote(q)}"


def google(q):
    return f"https://www.google.com/search?q={urllib.parse.quote(q)}&hl=ko&gl=kr"


def naver_img(q):
    return f"https://search.naver.com/search.naver?where=image&query={urllib.parse.quote(q)}"


def google_img(q):
    return f"https://www.google.com/search?q={urllib.parse.quote(q)}&tbm=isch&hl=ko&gl=kr"


# (파일 이름, 설명, URL, 세로 높이)
SHOTS = [
    ("03 구글 study planner aesthetic", "구글 이미지 · study planner aesthetic timetable", google_img("study planner aesthetic timetable"), 1600),
    ("04 네이버 스터디 플래너 다꾸", "네이버 이미지 · 스터디 플래너 다꾸", naver_img("스터디 플래너 다꾸"), 1600),
    ("05 네이버 10분 플래너 형광펜", "네이버 이미지 · 10분 플래너 형광펜", naver_img("10분 플래너 형광펜"), 1600),
    ("06 네이버 굿노트 스터디 플래너 속지", "네이버 이미지 · 굿노트 스터디 플래너 속지", naver_img("굿노트 스터디 플래너 속지"), 1600),
    ("07 네이버 공부 타임테이블 색칠", "네이버 이미지 · 공부 타임테이블 색칠", naver_img("공부 타임테이블 색칠"), 1600),
    ("08 네이버 가로형 스터디 플래너", "네이버 이미지 · 가로형 스터디 플래너 속지", naver_img("가로형 스터디 플래너 속지"), 1600),
    ("09 네이버 세로형 스터디 플래너", "네이버 이미지 · 세로형 스터디 플래너 양식", naver_img("세로형 스터디 플래너 양식"), 1600),
    ("10 네이버 스터디 플래너 블로그", "네이버 블로그 · 스터디 플래너 쓰는 법 10분", naver("스터디 플래너 쓰는법 10분", "blog"), 1800),
    ("11 구글 스터디 플래너 10분", "구글 통합 · 스터디 플래너 10분 타임테이블", google("스터디 플래너 10분 타임테이블"), 1800),
    ("12 네이버 열품타 스터디 플래너", "네이버 이미지 · 공스타그램 스터디 플래너", naver_img("공스타그램 스터디플래너"), 1600),
]

def shoot(slug, desc, url, height):
    OUT.mkdir(exist_ok=True)
    png = OUT / f"{slug}.png"
    jpg = OUT / f"{slug}.jpg"
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--lang=ko-KR",
           f"--window-size=1280,{height}", "--virtual-time-budget=16000", f"--user-agent={UA}",
           f"--screenshot={png}", url]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=90)
    if not png.exists():
        print("  FAIL", slug, r.stderr[-300:])
        return False
    Image.open(png).convert("RGB").save(jpg, quality=82, optimize=True)
    png.unlink()
    print(f"  ok  {slug}  {jpg.stat().st_size // 1024} KB  - {desc}")
    return True


if __name__ == "__main__":
    only = set(sys.argv[1:])
    for slug, desc, url, height in SHOTS:
        if only and slug[:2] not in only:
            continue
        shoot(slug, desc, url, height)
