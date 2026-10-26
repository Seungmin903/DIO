"""검색 결과 스크린샷 촬영 — 네이버 · 유튜브 · 구글 검색 결과를 크롬 헤드리스로 찍어 스크린샷/ 에 저장

실행:  python "docs/속지 에셋 아이디어/스크립트/스크린샷찍기.py"          (저장소 루트 또는 아무 데서나)
       python "docs/속지 에셋 아이디어/스크립트/스크린샷찍기.py" 03 07     (번호만 다시 찍기)
결과:  스크린샷/NN-slug.jpg (폭 1280, 세로 1600 · JPG 82)
스크린샷은 2026-10-26 기준 검색 결과다. 다시 찍으면 결과가 달라질 수 있다.
"""
import subprocess
import sys
import urllib.parse
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "스크린샷"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def naver(q, where="nexearch"):
    return f"https://search.naver.com/search.naver?where={where}&query={urllib.parse.quote(q)}"


def naver_view(q):  # 블로그 · 카페 (VIEW)
    return f"https://search.naver.com/search.naver?where=view&query={urllib.parse.quote(q)}"


def naver_news(q):
    return f"https://search.naver.com/search.naver?where=news&query={urllib.parse.quote(q)}&sort=1"


def youtube(q):
    return f"https://www.youtube.com/results?search_query={urllib.parse.quote(q)}"


def google(q):
    return f"https://www.google.com/search?q={urllib.parse.quote(q)}&hl=ko&gl=kr"


# (파일 slug, 설명, URL, 세로 높이)
SHOTS = [
    ("01 네이버 다꾸 트렌드 2026", "네이버 통합 · 다꾸 트렌드 2026", naver("다꾸 트렌드 2026"), 1800),
    ("02 네이버 10대 다꾸", "네이버 통합 · 10대 다꾸", naver("10대 다꾸"), 1800),
    ("03 네이버 20대 여성 다꾸", "네이버 통합 · 20대 여자 다이어리 꾸미기", naver("20대 여자 다이어리 꾸미기"), 1800),
    ("04 네이버뉴스 다꾸 2026", "네이버 뉴스(최신순) · 다꾸", naver_news("다꾸"), 1800),
    ("05 네이버뉴스 2027 다이어리", "네이버 뉴스(최신순) · 2027 다이어리", naver_news("2027 다이어리"), 1800),
    ("06 네이버 디지털 다꾸 갤럭시탭", "네이버 통합 · 디지털 다꾸 갤럭시탭", naver("디지털 다꾸 갤럭시탭"), 1800),
    ("07 네이버 삼성노트 템플릿", "네이버 통합 · 삼성노트 템플릿 종류", naver("삼성노트 페이지 템플릿 종류"), 1800),
    ("08 네이버 굿노트 속지 2026", "네이버 통합 · 굿노트 속지 추천 2026", naver("굿노트 속지 추천 2026"), 1800),
    ("09 네이버 포카 탑꾸", "네이버 통합 · 포카 꾸미기 탑꾸", naver("포카 꾸미기 탑꾸"), 1800),
    ("10 네이버 스티커 모조지", "네이버 통합 · 다꾸 스티커 추천 모조지 떡메", naver("다꾸 스티커 추천 모조지 떡메"), 1800),
    ("11 네이버 배경 마테", "네이버 통합 · 배경 마테 일력 마테", naver("배경 마테 일력 마테"), 1800),
    ("12 네이버 교환일기 앱", "네이버 통합 · 교환일기 앱", naver("교환일기 앱"), 1800),
    ("13 네이버 야구 직관 다이어리", "네이버 통합 · 야구 직관 다이어리", naver("야구 직관 다이어리"), 1800),
    ("14 네이버 별다꾸", "네이버 통합 · 별다꾸", naver("별다꾸"), 1800),
    ("15 네이버 질문일기365 1D1P", "네이버 통합 · 질문 일기 365 1D1P 다이어리", naver("질문 일기 365 1D1P 다이어리"), 1800),
    ("16 핫트랙스 2027 다이어리", "핫트랙스 · 2027 다이어리 기획전", "https://hottracks.kyobobook.co.kr/gift/01/08?pcMode=on", 1800),
    ("17 유튜브 다꾸", "유튜브 · 다꾸", youtube("다꾸"), 1800),
    ("18 유튜브 디지털 다꾸", "유튜브 · 디지털 다꾸 갤럭시탭", youtube("디지털 다꾸 갤럭시탭"), 1800),
    ("19 구글 다꾸 트렌드 2026", "구글 · 다꾸 트렌드 2026", google("다꾸 트렌드 2026"), 1800),
    ("20 네이버이미지 다꾸", "네이버 이미지 · 다꾸", naver("다꾸", "image"), 1800),
    ("21 교보핫트랙스 베스트 문구", "교보 핫트랙스 · 월간 베스트(독서용품)", "https://store.kyobobook.co.kr/bestseller/online/monthly/hottracks/gift/000002?page=1", 1800),
    ("23 삼성멤버스 템플릿", "삼성 멤버스 · 삼성노트 템플릿 추가 글", "https://r1.community.samsung.com/t5/%ED%83%9C%EB%B8%94%EB%A6%BF/%EC%82%BC%EC%84%B1%EB%85%B8%ED%8A%B8-%EC%98%A4-%EC%82%BC%EC%84%B1%EB%85%B8%ED%8A%B8%EC%97%90-%EB%90%98%EA%B2%8C-%EB%8B%A4%EC%96%91%ED%95%9C-%ED%85%9C%ED%94%8C%EB%A6%BF%EC%9D%B4-%EC%B6%94%EA%B0%80%EB%90%90%EB%84%A4%EC%9A%94/td-p/12907646", 1800),
    ("22 네이버뉴스 문구 29CM", "네이버 뉴스(최신순) · 문구 열풍 29CM", naver_news("다꾸 열풍 문구 매출"), 1800),
]


def shoot(slug, desc, url, height):
    OUT.mkdir(exist_ok=True)
    png = OUT / f"{slug}.png"
    jpg = OUT / f"{slug}.jpg"
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--lang=ko-KR",
           f"--window-size=1280,{height}", "--virtual-time-budget=16000",
           "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
           f"--screenshot={png}", url]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
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
