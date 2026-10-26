# -*- coding: utf-8 -*-
"""레퍼런스 검색 스크린샷 — 네이버 · 구글 · 앱 스토어 페이지를 크롬 헤드리스로 찍어 스크린샷/ 에 저장

실행:  python "docs/캐릭터 디자인/스크립트/스크린샷찍기.py"          (어디서나)
       python "docs/캐릭터 디자인/스크립트/스크린샷찍기.py" 03 07     (번호만 다시 찍기)
결과:  스크린샷/NN-slug.jpg (폭 1280 · JPG 82). 2026-10-26 기준 검색 결과라 다시 찍으면 달라질 수 있다.
"""
import subprocess
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import urllib.parse
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "스크린샷"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


def naver(q, where="nexearch"):
    return f"https://search.naver.com/search.naver?where={where}&query={urllib.parse.quote(q)}"


def google(q, tbm=None):
    return f"https://www.google.com/search?q={urllib.parse.quote(q)}&hl=ko&gl=kr" + (f"&tbm={tbm}" if tbm else "")


def appstore(id_, slug="app"):
    return f"https://apps.apple.com/kr/app/{slug}/id{id_}"


def play(pkg):
    return f"https://play.google.com/store/apps/details?id={pkg}&hl=ko"


# (파일 slug, 설명, URL, 세로 높이)
SHOTS = [
    # A. 아이콘 레퍼런스 — 단색 바탕 + 흰 형체
    ("00 앱스토어 크레페", "App Store · 크레페 CREPE (커미션 플랫폼, 2026-10-21 iOS 출시) — 단색 바탕 + 흰 형체 아이콘", "https://apps.apple.com/kr/app/%ED%81%AC%EB%A0%88%ED%8E%98-crepe/id6753073065", 1900),
    ("01 크레페 홈", "crepe.cm · 크레페 홈", "https://crepe.cm/", 1700),
    ("02 구글이미지 크레페 아이콘", "구글 이미지 · 크레페 앱 아이콘", google("크레페 앱 아이콘 CREPE app icon", "isch"), 1500),
    ("03 네이버이미지 한국 앱 아이콘", "네이버 이미지 · 한국 앱 아이콘 모음", naver("앱 아이콘 디자인 모음 토스 당근 카카오톡", "image"), 1500),
    ("04 네이버 iOS26 아이콘", "네이버 통합 · iOS 26 앱 아이콘 리퀴드 글래스", naver("iOS 26 앱 아이콘 리퀴드 글래스 디자인"), 1700),
    ("05 애플 HIG 앱 아이콘", "Apple HIG · App icons", "https://developer.apple.com/design/human-interface-guidelines/app-icons", 2000),
    ("06 안드로이드 적응형 아이콘", "Android 개발자 · 적응형 아이콘", "https://developer.android.com/develop/ui/views/launch/icon_design_adaptive?hl=ko", 2000),
    # B. 마스코트가 감정을 말하는 앱
    ("07 앱스토어 무다", "App Store · MOODA 무다 (네모 얼굴 감정 일기)", appstore("6449689589", "mooda"), 1900),
    ("08 앱스토어 하루콩", "App Store · 하루콩 DailyBean (콩 얼굴 무드 트래커)", appstore("1553223828", "dailybean"), 1900),
    ("09 앱스토어 핀치", "App Store · Finch (새 키우는 셀프케어)", appstore("1528595748", "finch-self-care-pet"), 1900),
    ("10 앱스토어 듀오링고", "App Store · Duolingo (Duo 부엉이)", appstore("570060128", "duolingo"), 1900),
    ("11 네이버이미지 무다", "네이버 이미지 · 무다 MOODA 캐릭터", naver("무다 MOODA 감정일기 캐릭터", "image"), 1500),
    # C. 그림체 · 트렌드 레퍼런스
    ("12 네이버 치이카와", "네이버 통합 · 치이카와", naver("치이카와 캐릭터 인기"), 1700),
    ("13 네이버 망그러진곰", "네이버 통합 · 망그러진 곰", naver("망그러진 곰 캐릭터"), 1700),
    ("14 네이버이미지 최고심", "네이버 이미지 · 최고심", naver("최고심 캐릭터", "image"), 1500),
    ("15 네이버이미지 라인프렌즈", "네이버 이미지 · 라인프렌즈 샐리 (사물 · 동물 단순화)", naver("라인프렌즈 샐리 브라운 캐릭터", "image"), 1500),
    ("16 네이버이미지 산리오 점눈", "네이버 이미지 · 산리오 점 눈 캐릭터", naver("산리오 캐릭터 포챠코 시나모롤", "image"), 1500),
    ("17 네이버이미지 노트 캐릭터", "네이버 이미지 · 노트 · 다이어리 캐릭터", naver("노트 캐릭터 다이어리 마스코트 귀여운", "image"), 1500),
    ("18 네이버이미지 노트 마스코트", "네이버 이미지 · notebook mascot character", naver("notebook mascot character cute", "image"), 1500),
    ("19 구글이미지 목도리 캐릭터", "구글 이미지 · 목도리 두른 단순 캐릭터", google("목도리 캐릭터 일러스트 심플", "isch"), 1500),
    ("20 네이버이미지 턴어라운드", "네이버 이미지 · 캐릭터 턴어라운드 시트", naver("캐릭터 턴어라운드 시트 설정집", "image"), 1500),
    ("21 네이버 다꾸 캐릭터 굿즈", "네이버 쇼핑 · 다꾸 캐릭터 스티커 (경쟁 · 친화)", naver("다꾸 캐릭터 스티커 인기", "nexearch"), 1700),
    ("22 네이버이미지 당근이", "네이버 이미지 · 당근이 캐릭터", naver("당근이 캐릭터 당근 마스코트", "image"), 1500),
]


def shoot(slug, desc, url, height):
    OUT.mkdir(exist_ok=True)
    png = OUT / f"{slug}.png"
    jpg = OUT / f"{slug}.jpg"
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--lang=ko-KR",
           f"--window-size=1280,{height}", "--virtual-time-budget=16000",
           "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
           f"--screenshot={png}", url]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if not png.exists():
        print("  FAIL", slug, r.stderr[-300:], flush=True)
        return False
    Image.open(png).convert("RGB").save(jpg, quality=82, optimize=True)
    png.unlink()
    print(f"  ok  {slug}  {jpg.stat().st_size // 1024} KB  - {desc}", flush=True)
    return True


if __name__ == "__main__":
    only = set(sys.argv[1:])
    for slug, desc, url, height in SHOTS:
        if only and slug[:2] not in only:
            continue
        shoot(slug, desc, url, height)
