# -*- coding: utf-8 -*-
"""머지 반영 디자인 비교 PDF 빌드: 이미지(이미지/) + 아래 본문 → HTML → 크롬 헤드리스 PDF(A4 가로).
실행: PYTHONIOENCODING=utf-8 python 빌드.py   (크롬 경로는 CHROME)
"""
import html, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
OUT_HTML = os.path.join(HERE, '머지 반영 디자인 비교.html')
OUT_PDF = os.path.join(HERE, '머지 반영 디자인 비교.pdf')
e = html.escape


def fig(name, label):
    return f'<figure><img src="이미지/{e(name)}"><figcaption>{e(label)}</figcaption></figure>'


def side(title, tag, figs, klass=''):
    return f'<section class="side {klass}"><h3><span class="tag {tag}">{e(title[0])}</span>{e(title[1])}</h3><div class="figs">{"".join(figs)}</div></section>'


def notes(items):
    return '<ul class="notes">' + ''.join(f'<li>{i}</li>' for i in items) + '</ul>'


def page(title, sub, body):
    return f'<div class="page"><header><h2>{e(title)}</h2><p>{e(sub)}</p></header>{body}</div>'


def pair(mine, theirs, note=None):
    return f'<div class="pair">{mine}{theirs}</div>' + (notes(note) if note else '')


MINE = ('내 안', '병합 전 내 작업')
THEIRS = ('팀원 안', 'develop · 지금 적용됨')

pages = []

# ── 1. 요약 ──
pages.append(page('머지 반영 · 디자인 비교', '2026-11-02 · develop d6b84143(!274 스티커 제작 화면 포함)까지 받음', '''
<div class="lead">
  <p><b>규칙</b> · 기능은 모두 팀원 것을 받았고, 디자인이 겹친 곳은 지금 작업 트리에 <b>팀원 안</b>을 두었다. 내 안은 <code>refs/dio-backup/before-pull-1102</code>에 그대로 있다. 아래에서 고르면 그쪽으로 맞춘다.</p>
  <p class="muted">비교 화면은 같은 가짜 데이터(스티커 시트 6개 · 사용자 소연)로 웹에서 그린 것이다. 팀원 안은 develop 그대로, 내 안은 병합 직전 작업 상태. 실기기 화면은 아니다.</p>
</div>
<table class="sum">
<tr><th>영역</th><th>내 안</th><th>팀원 안</th><th>고르는 포인트</th></tr>
<tr><td><b>스티커 제작 (시트 분리)</b></td><td>제목 “스티커 시트 분리” · 3단계(분리 설정 → 다듬기 → 저장) · 하단 이전/다음</td><td>제목 “스티커 만들기” · 4탭(배경 조정 · 포함·제외 · 객체 묶기 · 스티커 확인) · 도구 줄 · 되돌리기</td><td>순서를 이끄는 화면 vs 탭을 오가는 작업대</td></tr>
<tr><td><b>마이페이지(내 공간)</b></td><td>“내 공간” · 옅은 면 한 장 + 알림 스위치 · 모아 얼굴 기본 사진</td><td>“마이페이지” · 남색 프로필 카드 + 그룹 목록 · 사람 아이콘 기본 사진</td><td>이름 · 색 비중 · 목록 vs 스위치 · 기본 사진</td></tr>
<tr><td><b>회원정보 수정</b></td><td>두 구역(프로필 정보 · 계정 정보) · 하단 고정 저장 바</td><td>흰 카드 한 장 · 라벨 / 값 두 열 · 카드 안 저장 줄</td><td>폭 · 저장 위치 · 탈퇴 버튼 노출</td></tr>
<tr><td>새 화면(팀원만)</td><td>—</td><td>알림 설정 · 비밀번호 재설정(4단계)</td><td>디자인 확인만 필요</td></tr>
</table>'''))

# ── 2. 기능으로 받은 것 ──
pages.append(page('기능으로 받은 것', '팀원 develop 그대로 (디자인 비교 대상 아님)', '''
<div class="two">
<div><h3>로그인 · 계정</h3><ul class="notes">
<li><b>체험 계정 · 게스트 진입 제거</b>: 앱은 로그인 화면으로 시작한다. 내가 만든 “일반 사용자 / 개발자 모드 시작 화면 · 기능에서만 로그인(loginGate)”은 앱에서 이어지지 않는다(코드는 남아 있고 연결만 끊김).</li>
<li>마이페이지 서버 회원정보 조회 · 닉네임 · 프로필 사진 저장 · 회원 탈퇴</li>
<li>비밀번호 재설정 4단계(이메일 → 인증번호 → 새 비밀번호 → 완료)</li>
<li>알림 설정(서비스 알림 · 마케팅 수신, 이 기기 · 계정별 저장)</li>
<li>개발 서버 접속 정보를 기기 보안 저장소(<code>expo-secure-store</code>)에 보관 → <b>새 패키지 · 네이티브 모듈이라 개발 빌드 다시 필요</b>(설치 · 빌드 완료)</li></ul></div>
<div><h3>편집기</h3><ul class="notes">
<li>스티커 브러시 부분 분리 · 포함/제외 · 객체 묶기 · 영역 조정(!274)</li>
<li>필기 뒤 도구 전환 지연 개선 · 영역 지우기 표시 캐시</li>
<li>완료 필기 획 캐시 계획(<code>completedStrokePlan</code>)</li></ul>
<h3>백엔드 쪽</h3><ul class="notes">
<li>회원정보 · 탈퇴 계층 분리, 같은 닉네임 수정 시 수정 시각 유지, 편집 원본 다운로드 파일명, 초대 메일 발송 제거(앱 알림만)</li></ul>
<h3>합치면서 같이 손본 것</h3><ul class="notes">
<li>App.js: 로그인 필수 흐름은 팀원 것, 내 로딩 화면(BootSplash)은 유지</li>
<li>테스트 모의(mock)에 새 모듈 이름 추가 · 게스트 전제 테스트는 팀원 판으로 교체</li></ul></div>
</div>'''))

# ── 스티커 ──
S = lambda n, who, w: f'스티커-{who}-{n}-{w}.png'
pages.append(page('① 스티커 제작 — 시작 화면 (태블릿 1280×800)', '배경 정하기 · 분리하기 직전', pair(
    side(MINE, 'mine', [fig(S('1설정', '내안', '태블릿'), '분리 설정 (1단계)')]),
    side(THEIRS, 'theirs', [fig(S('1설정', '팀원', '태블릿'), '배경 조정 탭')]),
    ['<b>내 안</b> — 단계 표시(1 분리 설정 · 2 다듬기 · 3 저장)가 헤더 오른쪽에 있고, 지금 단계에서 할 일은 “배경”과 “분리하기” 두 가지뿐이다. 원본이 크게 보이고 잘라낼 영역 테두리를 바로 잡는다.',
     '<b>팀원 안</b> — 헤더에 되돌리기 · 다시 실행 · 닫기가 있고, 가운데 세로선으로 좌 미리보기 · 우 설정을 나눈다. 상단에 4개 탭이 항상 보이고 영역 조정 · 이동 · 화면 맞춤 도구 줄이 미리보기 아래에 붙는다.',
     '<b>판단 포인트</b> — 처음 쓰는 사람에게 순서를 알려 주는 쪽(내 안) vs 되돌리기와 도구를 늘 손 닿는 곳에 두는 쪽(팀원 안).'])))
pages.append(page('② 스티커 제작 — 결과 확인 (태블릿)', '분리 결과를 보고 저장할 스티커 고르기', pair(
    side(MINE, 'mine', [fig(S('2다듬기', '내안', '태블릿'), '다듬기 · 고르기 (2단계)')]),
    side(THEIRS, 'theirs', [fig(S('2확인', '팀원', '태블릿'), '스티커 확인 탭')]),
    ['<b>내 안</b> — 결과 칩이 원본 아래 한 줄 가로 목록. 도구(하나씩 고르기 · 담기/빼기 브러시)는 오른쪽 위, 저장은 다음 단계로 넘어가야 한다. 이전 · 다음이 하단에 고정.',
     '<b>팀원 안</b> — 결과 카드가 오른쪽 격자(체크 · 번호). 총 개수 칩과 “저장할 스티커” 제목, 아래에 “내 스티커 · 총 n개 · 저장” 줄이 고정되어 한 화면에서 바로 저장한다.',
     '<b>판단 포인트</b> — 저장까지 단계가 짧은 쪽은 팀원 안, 화면이 덜 붐비는 쪽은 내 안.'])))
pages.append(page('③ 스티커 제작 — 묶기 (태블릿)', '조각을 한 스티커로 합치기', pair(
    side(MINE, 'mine', [fig(S('3합치기', '내안', '태블릿'), '다듬기 · 합치기 탭')]),
    side(THEIRS, 'theirs', [fig(S('3묶기', '팀원', '태블릿'), '객체 묶기 탭')]),
    ['두 화면 모두 같은 가짜 시트라 결과는 같고, 도구 배치만 다르다. 내 안은 “고르기 / 합치기” 두 탭, 팀원 안은 네 탭 중 하나.'])))
pages.append(page('④ 스티커 제작 — 폰 (414×896)', '같은 순서로 나란히', pair(
    side(MINE, 'mine', [fig(S('1설정', '내안', '폰'), '설정'), fig(S('2다듬기', '내안', '폰'), '다듬기'), fig(S('3합치기', '내안', '폰'), '합치기')], 'phone'),
    side(THEIRS, 'theirs', [fig(S('1설정', '팀원', '폰'), '배경 조정'), fig(S('2확인', '팀원', '폰'), '스티커 확인'), fig(S('3묶기', '팀원', '폰'), '객체 묶기')], 'phone'),
    ['<b>내 안</b> — 폰에서도 단계 표시가 맨 위, 미리보기 · 도구 · 결과가 세로로 쌓이고 이전/다음이 맨 아래.',
     '<b>팀원 안</b> — 미리보기 아래 4탭이 가로로 스크롤(첫 탭이 잘려 보임)되고 저장 줄이 맨 아래.'])))

# ── 마이페이지 ──
P = lambda n, who, w: f'마이페이지-{who}-{n}-{w}.png'
pages.append(page('⑤ 마이페이지 · 내 공간 — 태블릿 (1280)', '로그인한 사용자의 첫 화면', pair(
    side(MINE, 'mine', [fig(P('1홈', '내안', '태블릿'), '내 공간')]),
    side(THEIRS, 'theirs', [fig(P('1홈', '팀원', '태블릿'), '마이페이지')]),
    ['<b>이름</b> — 내 공간 vs 마이페이지(내 안은 사이드 메뉴의 이름과 맞춤).',
     '<b>프로필 영역</b> — 내 안: 옅은 면 한 장 · 모아 얼굴 기본 사진 · 92×32 프로필 수정 테두리 버튼. 팀원 안: 남색 큰 카드 · 사람 아이콘 · 카드 전체가 눌리는 “회원정보 수정 &gt;”.',
     '<b>본문</b> — 내 안: 알림 · 앱 잠금 스위치가 바로 보임. 팀원 안: 계정 · 서비스 · 앱 정보 그룹 목록(알림은 별도 화면). 팀원 안에는 나만의 폰트 만들기 입구와 앱 정보(문의 이메일 복사)가 있다.',
     '<b>색</b> — 팀원 안의 남색 카드(navy)는 이 화면에서 가장 무거운 면이다. 내 안과 다른 화면은 옅은 면(surfaceMuted)을 큰 판으로 써 왔으니, 앱 안에서 어울리는지 정하면 된다(규칙 위반은 아니다: 큰 면 금지는 노랑에만 걸려 있다).'])))
pages.append(page('⑥ 마이페이지 · 내 공간 — 폰 (414)', '같은 내용, 폰 폭', pair(
    side(MINE, 'mine', [fig(P('1홈', '내안', '폰'), '내 공간')], 'phone'),
    side(THEIRS, 'theirs', [fig(P('1홈', '팀원', '폰'), '마이페이지'), fig(P('3알림', '팀원', '폰'), '알림 설정 (팀원만)')], 'phone'),
    ['팀원 안은 알림 설정이 별도 화면이라 홈이 짧고, 내 안은 홈 한 화면에서 스위치로 끝난다.'])))
pages.append(page('⑦ 회원정보 수정 — 태블릿 (1280)', '닉네임 · 사진 · 계정 정보', pair(
    side(MINE, 'mine', [fig(P('2수정', '내안', '태블릿'), '회원정보 수정')]),
    side(THEIRS, 'theirs', [fig(P('2수정', '팀원', '태블릿'), '회원정보 수정')]),
    ['<b>내 안</b> — 가운데 좁은 단 · 두 구역(프로필 정보 · 계정 정보) · 저장 · 취소가 화면 아래 선 위에 고정. 회원 탈퇴는 작은 붉은 글자.',
     '<b>팀원 안</b> — 흰 카드 한 장 안에 라벨 / 값 두 열 · 비밀번호는 버튼 · 카드 아래쪽에 회원 탈퇴(붉은 테두리) · 취소 · 저장.',
     '<b>판단 포인트</b> — 태블릿에서 라벨 열이 있는 폼(팀원 안)이 읽기 쉬운지, 고정 저장 바(내 안)가 실수를 줄이는지.'])))
pages.append(page('⑧ 회원정보 수정 — 폰 (414)', '비밀번호 재설정 화면(팀원만) 포함', pair(
    side(MINE, 'mine', [fig(P('2수정', '내안', '폰'), '회원정보 수정')], 'phone'),
    side(THEIRS, 'theirs', [fig(P('2수정', '팀원', '폰'), '회원정보 수정'), fig('마이페이지-팀원-4비밀번호-태블릿.png', '비밀번호 재설정 (팀원만 · 1280)')], 'phone'))))

# ── 결정 ──
pages.append(page('정할 것 · 이어서 할 것', '이 문서에서 고르면 그쪽으로 맞춘다', '''
<div class="two">
<div><h3>고르기 (영역별 내 안 / 팀원 안 / 섞기)</h3>
<table class="sum"><tr><th>영역</th><th>선택</th></tr>
<tr><td>스티커 제작 화면 (3단계 vs 4탭)</td><td>☐ 내 안 ☐ 팀원 안 ☐ 섞기</td></tr>
<tr><td>마이페이지 홈 (이름 · 프로필 카드 · 목록/스위치)</td><td>☐ 내 안 ☐ 팀원 안 ☐ 섞기</td></tr>
<tr><td>기본 프로필 사진 (모아 얼굴 / 사람 아이콘)</td><td>☐ 내 안 ☐ 팀원 안</td></tr>
<tr><td>회원정보 수정 (고정 저장 바 / 카드 안 저장 줄)</td><td>☐ 내 안 ☐ 팀원 안 ☐ 섞기</td></tr></table></div>
<div><h3>이어서 할 것</h3><ul class="notes">
<li>내 안을 고른 영역은 백업 ref에서 해당 파일만 되살려 팀원 기능(API 연결 · 비밀번호 재설정 이동)을 그 위에 다시 얹는다.</li>
<li>게스트 제거로 쓰이지 않게 된 코드(<code>loginGate</code> · <code>StartModeScreen</code> · <code>devAccess</code> · 관련 테스트 · 개발자 모드 문서)를 지울지 정한다. 개발자 모드가 없어져 서버 없이 화면만 보는 길이 막혔다.</li>
<li>디자인 가이드의 마이페이지 · 스티커 제작 절은 이번에 팀원 문구가 들어왔다. 고른 안에 맞게 다시 쓴다.</li>
<li>커밋은 아직 하지 않았다(작업 트리에만 반영).</li></ul></div>
</div>'''))

CSS = '''
@page { size: A4 landscape; margin: 11mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Pretendard","Malgun Gothic","Noto Sans KR",sans-serif; color: #0B1766; font-size: 11pt; line-height: 1.5; }
.page { page-break-after: always; height: 188mm; overflow: hidden; display: flex; flex-direction: column; }
.page:last-child { page-break-after: auto; }
header h2 { margin: 0; font-size: 20pt; letter-spacing: -.3px; }
header p { margin: 2px 0 8px; color: #606BB2; font-size: 10pt; }
h3 { margin: 6px 0 4px; font-size: 11.5pt; display: flex; align-items: center; gap: 8px; }
.tag { display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 9.5pt; color: #fff; }
.tag.mine { background: #606BB2; } .tag.theirs { background: #0B1766; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; flex: 0 0 auto; }
.side { min-height: 0; display: flex; flex-direction: column; }
.figs { display: flex; gap: 4mm; align-items: flex-start; justify-content: center; }
figure { margin: 0; text-align: center; min-height: 0; max-width: 100%; }
figure img { max-width: 100%; max-height: 104mm; border: 1px solid #DBDCF9; border-radius: 6px; }
.phone figure img { max-height: 116mm; }
figcaption { font-size: 9pt; color: #606BB2; margin-top: 3px; }
.notes { margin: 10px 0 0; padding-left: 16px; font-size: 10.2pt; }
.notes li { margin: 0 0 3px; }
.lead p { margin: 0 0 6px; } .muted { color: #606BB2; font-size: 9.5pt; }
code { background: #F0F1FA; padding: 0 4px; border-radius: 4px; font-size: 9pt; }
table.sum { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 8px; }
table.sum th, table.sum td { border: 1px solid #DBDCF9; padding: 6px 8px; vertical-align: top; text-align: left; }
table.sum th { background: #F0F1FA; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
'''


def main():
    body = ''.join(pages)
    open(OUT_HTML, 'w', encoding='utf-8').write(f'<!doctype html><html lang="ko"><meta charset="utf-8"><title>머지 반영 디자인 비교</title><style>{CSS}</style><body>{body}</body></html>')
    cmd = [CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--window-size=1600,1000', f'--print-to-pdf={OUT_PDF}', 'file:///' + OUT_HTML.replace('\\', '/')]
    subprocess.run(cmd, check=True, timeout=180)
    print('PDF', OUT_PDF)


if __name__ == '__main__':
    main()
