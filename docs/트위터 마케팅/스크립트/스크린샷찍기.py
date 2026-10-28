"""검색 결과 · X 공개 프로필 스크린샷 촬영 — 크롬 헤드리스로 찍어 스크린샷/ 에 저장

실행:  python "docs/트위터 마케팅/스크립트/스크린샷찍기.py"            (전부)
       python "docs/트위터 마케팅/스크립트/스크린샷찍기.py" 03 07       (번호만 다시 찍기)
       python "docs/트위터 마케팅/스크립트/스크린샷찍기.py" --profiles   (X 프로필만)
결과:  스크린샷/NN 이름.jpg  (검색: 폭 1280 · 세로 1800 / X 프로필: 가운데 열 600px 만 잘라 2배)
스크린샷은 2026-10-26 기준 화면이다. 다시 찍으면 결과가 달라질 수 있다.
X 프로필은 로그인 없이 보이는 맨 위(헤더 · 인장 · 이름 · 아이디 · 소개 · 숫자)까지만 잘라 쓴다. 그 아래 트윗에는 다른 사람의 글이 섞여 있어 쓰지 않는다.
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


# (파일 이름, 설명, URL, 세로 높이)
SHOTS = [
    ("01 네이버 트위터 브랜드 계정 운영", "네이버 통합 · 트위터 브랜드 계정 운영", naver("트위터 브랜드 계정 운영"), 1800),
    ("02 네이버뉴스 트위터 Z세대 브랜드", "네이버 뉴스(최신순) · 트위터 Z세대 브랜드 계정", naver_news("트위터 Z세대 브랜드 계정"), 1800),
    ("03 네이버 X 트위터 이용자", "네이버 통합 · X 트위터 이용자 수 연령", naver("X 트위터 이용자 수 연령"), 1800),
    ("04 네이버 와이즈앱 X 사용자", "네이버 통합 · 와이즈앱 X 트위터 월간 사용자", naver("와이즈앱 X 트위터 월간 사용자"), 1800),
    ("05 네이버 트위터 인장 뜻", "네이버 통합 · 트위터 인장 뜻", naver("트위터 인장 뜻"), 1800),
    ("06 네이버 트위터 헤더 규격", "네이버 통합 · 트위터 헤더 사이즈 모바일 잘림", naver("트위터 헤더 사이즈 모바일 잘림"), 1800),
    ("07 네이버 트위터 아이디 짓기", "네이버 통합 · 트위터 아이디 닉네임 짓기", naver("트위터 아이디 닉네임 짓기"), 1800),
    ("08 네이버 다꾸 트위터", "네이버 통합 · 다꾸 트위터 계정", naver("다꾸 트위터 계정"), 1800),
    ("09 네이버 트친소", "네이버 통합 · 트친소 양식", naver("트친소 양식"), 1800),
    ("10 네이버 알티 이벤트", "네이버 통합 · 트위터 알티 이벤트 브랜드", naver("트위터 알티 이벤트 브랜드"), 1800),
    ("11 네이버뉴스 기업 트위터 논란", "네이버 뉴스(최신순) · 기업 트위터 논란 사과", naver_news("기업 트위터 논란 사과"), 1800),
    ("12 네이버 디오 트위터", "네이버 통합 · 디오 트위터", naver("디오 트위터"), 1800),
    ("13 네이버 DIO 죠죠", "네이버 통합 · DIO 죠죠 디오 브란도", naver("DIO 죠죠 디오 브란도"), 1800),
    ("14 네이버 공유 다이어리 앱", "네이버 통합 · 공유 다이어리 앱", naver("공유 다이어리 앱"), 1800),
    ("15 네이버뉴스 트위터 AI 이미지", "네이버 뉴스(최신순) · 트위터 AI 이미지 논란", naver_news("AI 이미지 논란 일러스트 트위터"), 1800),
    ("16 유튜브 트위터 브랜드 계정", "유튜브 · 트위터 브랜드 계정 운영", youtube("트위터 브랜드 계정 운영"), 1800),
    ("17 구글 트위터 마케팅 1020", "구글 · 트위터 마케팅 1020 여성", google("트위터 마케팅 1020 여성"), 1800),
]

# X 공개 프로필 (핸들 · 설명). 핸들은 공식 사이트 · 기사로 확인한 것만 쓴다. 아래는 화면에서 이름 · 인증 마크로 다시 확인한다.
PROFILES = [
    ("P01 duolingo", "Duolingo — 캐릭터 말투 브랜드 계정의 해외 기준점", "duolingo"),
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


def shoot_profile(slug, desc, handle, crop_h=640):
    """x.com/<handle> 맨 위 가운데 열(600px) 을 2배로 찍어 잘라 저장한다."""
    OUT.mkdir(exist_ok=True)
    png = OUT / f"{slug}.png"
    jpg = OUT / f"{slug}.jpg"
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--lang=ko-KR", "--force-device-scale-factor=2",
           "--window-size=1280,900", "--virtual-time-budget=20000", f"--user-agent={UA}",
           f"--screenshot={png}", f"https://x.com/{handle}"]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    if not png.exists():
        print("  FAIL", slug, r.stderr[-300:])
        return False
    im = Image.open(png).convert("RGB")
    # 가운데 열: 1280px 창에서 x 270~871 (X 웹 레이아웃)
    im.crop((270 * 2, 0, 872 * 2, crop_h * 2)).save(jpg, quality=88, optimize=True)
    png.unlink()
    print(f"  ok  {slug}  {jpg.stat().st_size // 1024} KB  - {desc}")
    return True


if __name__ == "__main__":
    args = sys.argv[1:]
    only_profiles = "--profiles" in args
    only = {a for a in args if not a.startswith("--")}
    if not only_profiles:
        for slug, desc, url, height in SHOTS:
            if only and slug[:2] not in only:
                continue
            shoot(slug, desc, url, height)
    for slug, desc, handle in PROFILES:
        if only and slug[:3] not in only and not only_profiles:
            continue
        shoot_profile(slug, desc, handle)
