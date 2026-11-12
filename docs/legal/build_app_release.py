"""Build the 2026-11-03 legal release candidate without changing older sources.

Run from the repository root: python docs/legal/build_app_release.py
Markdown is the only editable source. HTML and the native text bundle are generated.
"""
import hashlib
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).parent / 'app-release-20261103'
DOCUMENTS = [
    ('service', 'service', 'SERVICE', 'v2'),
    ('privacy', 'privacy-consent', 'PRIVACY', 'v2'),
    ('policy', 'privacy-policy', None, 'v2'),
    ('marketingPrivacy', 'marketing-privacy-consent', 'MARKETING_PRIVACY', 'v1'),
    ('adEmail', 'ad-email-consent', 'AD_EMAIL', 'v1'),
    ('adPush', 'ad-push-consent', 'AD_PUSH', 'v1'),
    ('adNightPush', 'ad-night-push-consent', 'AD_NIGHT_PUSH', 'v1'),
]
LINK = re.compile(r'\[([^\]]+)\]\(((?:https://|mailto:)[^ )]+)\)')
CSS = '''
:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:#fff;color:#20232a}
main{max-width:46rem;margin:auto;padding:1.25rem;padding-bottom:max(3rem,env(safe-area-inset-bottom))}
h1{font-size:1.6rem;line-height:1.5}h2{font-size:1.25rem;margin-top:2.2rem}h3{font-size:1.1rem;margin-top:1.8rem}
p,li{font-size:1rem;line-height:1.9}p,h1,h2,h3,a,li{overflow-wrap:anywhere;word-break:normal}
ul,ol{padding-inline-start:1.5rem}a{color:#245b94;text-underline-offset:.2em}
a:focus-visible{outline:3px solid currentColor;outline-offset:4px}li+li{margin-top:.65rem}
nav{border-bottom:1px solid #aaa;padding-bottom:1rem}nav a{display:inline-block;padding:.5rem 0}
.notice{border:1px solid #aaa;border-radius:.5rem;padding:1rem;line-height:1.8}
@media(prefers-color-scheme:dark){body{background:#17191c;color:#f1f2f4}a{color:#9dcaff}}
@media(min-width:48rem){main{padding:2.5rem}}
@media print{body{background:#fff;color:#000}nav,.notice{display:none}a{color:inherit}main{max-width:none}}
'''


def plain(value):
    return LINK.sub(lambda m: m[1], value).replace('**', '').replace('`', '')


def inline(value):
    # Never interpret Markdown as raw HTML; allow only HTTPS/mailto links.
    value = escape(value)
    value = LINK.sub(lambda m: '<a href="' + m[2] + '">' + m[1] + '</a>', value)
    value = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', value)
    return re.sub(r'`([^`]+)`', r'<code>\1</code>', value)


def blocks(source):
    result = []
    for raw in source.splitlines():
        line = raw.strip()
        if not line or line == '---':
            continue
        if line.startswith('|'):
            raise ValueError('Use paragraph/card sections instead of horizontally scrolling tables')
        heading = re.match(r'^(#{1,3}) (.+)$', line)
        item = re.match(r'^(\d+)\. (.+)$', line)
        value = heading[2] if heading else item[2] if item else line[2:] if line.startswith('- ') else line
        block = {'type': 'heading' if heading else 'listItem' if item or line.startswith('- ') else 'paragraph',
                 'text': plain(value)}
        if heading:
            block['level'] = len(heading[1])
        if item:
            block['number'] = int(item[1])
        links = [{'label': m[1], 'url': m[2]} for m in LINK.finditer(value)]
        if links:
            block['links'] = links
        result.append((block, value))
    return result


def page(title, body):
    return f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta name="color-scheme" content="light dark">
<title>{escape(title)}</title><style>{CSS}</style></head>
<body><main><nav aria-label="문서 탐색"><a href="index.html">문서 목록</a></nav>
<p class="notice" role="note">게시 전 확인용 개정안입니다. 실제 적용일과 운영 준비 확인은 문서 목록을 참고해 주세요.</p>
{body}</main></body></html>'''


def build():
    documents = []
    for key, name, terms_type, version in DOCUMENTS:
        source = (ROOT / f'{name}.md').read_text(encoding='utf-8')
        parsed = blocks(source)
        title = next(b['text'] for b, _ in parsed if b.get('level') == 1)
        rendered = []
        for block, value in parsed:
            if block['type'] == 'heading':
                level = block['level']
                rendered.append(f'<h{level}>{inline(value)}</h{level}>')
            else:
                prefix = str(block['number']) + '. ' if 'number' in block else '• ' if block['type'] == 'listItem' else ''
                rendered.append('<p>' + escape(prefix) + inline(value) + '</p>')
        (ROOT / f'{name}.html').write_text(page(title, '\n'.join(rendered)), encoding='utf-8')
        documents.append({'id': key, 'title': title, 'termsType': terms_type, 'termsVersion': version,
                          'revision': '2026-11-03', 'effectiveDate': None,
                          'sourceSha256': hashlib.sha256(source.encode()).hexdigest(),
                          'source': name + '.md', 'html': name + '.html',
                          'blocks': [b for b, _ in parsed]})
    bundle = {'schemaVersion': 1, 'status': 'release-candidate', 'publicationReady': False,
              'documents': documents}
    (ROOT / 'app-documents.json').write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Store-required web resource, separate from the seven consent/policy documents.
    deletion = blocks((ROOT / 'account-deletion.md').read_text(encoding='utf-8'))
    deletion_body = []
    for block, value in deletion:
        tag = 'h' + str(block['level']) if block['type'] == 'heading' else 'p'
        deletion_body.append(f'<{tag}>{inline(value)}</{tag}>')
    (ROOT / 'account-deletion.html').write_text(
        page('DIO 계정·데이터 삭제 요청', '\n'.join(deletion_body)), encoding='utf-8')
    content = '''<h1>DIO 법적 고지·동의 문서</h1>
<p>2026년 11월 3일 작성한 개정안입니다. 문서의 목표 정책에 맞춘 구현·배포와 실제 시행일 확정 후 공개합니다.</p>
<p>이용약관·필수 개인정보 동의는 v2, 선택 동의 4종은 v1입니다. 개인정보처리방침 열람을 별도의 필수 동의로 취급하지 않습니다.</p>
<p>Gmail·기기 푸시의 구체적인 국외 처리 안내, 실제 백업 구성, 로그 보존 상한·접속기록 관리와 삭제 정책 적용을 확인한 뒤 게시 상태를 변경해야 합니다.</p><ul>'''
    content += ''.join('<li><a href="' + d['html'] + '">' + escape(d['title']) + '</a></li>' for d in documents)
    content += '</ul><p><a href="account-deletion.html">DIO 계정·데이터 삭제 요청</a></p><p>이 HTML은 외부 글꼴·스크립트·이미지를 사용하지 않으며 인터넷 없이 본문을 표시합니다. 확대를 제한하지 않습니다.</p>'
    (ROOT / 'index.html').write_text(page('DIO 법적 고지·동의 문서', content), encoding='utf-8')
    print('Generated 7 legal HTML documents, account-deletion.html, index.html and app-documents.json')


if __name__ == '__main__':
    build()
