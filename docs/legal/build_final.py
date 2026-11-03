"""Build the handoff document pack; preserve historical legal drafts.

Run: python docs/legal/build_final.py
Edit final/*.md, then rerun. The first run seeds sources from app-release-20261103.
"""
import hashlib
import json
import zipfile
from html import escape
from pathlib import Path

from build_app_release import CSS, DOCUMENTS, blocks, inline

BASE = Path(__file__).parent
ROOT = BASE / 'final'
EFFECTIVE_DATE = '2026-11-04'
EFFECTIVE_LABEL = '시행일: 2026년 11월 4일'


def render(title, body, navigation=True):
    nav = '<nav aria-label="문서 탐색"><a href="index.html">문서 목록</a></nav>' if navigation else ''
    return f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>{escape(title)}</title>
<style>{CSS}</style></head><body><main>{nav}{body}</main></body></html>'''


def build():
    ROOT.mkdir(exist_ok=True)
    documents = []
    for key, name, terms_type, version in [*DOCUMENTS, ('accountDeletion', 'account-deletion', None, None)]:
        source = ROOT / f'{name}.md'
        if not source.exists():
            value = (BASE / 'app-release-20261103' / source.name).read_text(encoding='utf-8')
            value = value.replace('개정안 작성일:', '작성일:').replace('문서 버전: v2 개정안', '문서 버전: v2')
            value = value.replace('v1 (마케팅 문서 최초 초안, 기본 약관 v2와 별개)', 'v1')
            value = value.replace('개정안 작성일은 시행일이 아닙니다.', '작성일은 시행일이 아닙니다.')
            value = value.replace('개정안 작성일이나 파일 생성만으로', '문서 작성이나 파일 생성만으로')
            value = value.replace('작성일: 2026년 11월 3일\n\n', '')
            value = value.replace('시행일: 실제 게시 시 공지하는 적용일', EFFECTIVE_LABEL)
            if EFFECTIVE_LABEL not in value:
                title, rest = value.split('\n', 1)
                value = title + '\n\n' + EFFECTIVE_LABEL + '\n' + rest
            source.write_text(value, encoding='utf-8')
        text = source.read_text(encoding='utf-8')
        if EFFECTIVE_LABEL not in text:
            raise ValueError(f'{source.name}: effective date must match {EFFECTIVE_DATE}')
        parsed = blocks(text)
        title = next(b['text'] for b, _ in parsed if b.get('level') == 1)
        content = []
        for block, value in parsed:
            tag = f'h{block["level"]}' if block['type'] == 'heading' else 'p'
            prefix = f'{block["number"]}. ' if 'number' in block else '• ' if block['type'] == 'listItem' else ''
            content.append(f'<{tag}>{escape(prefix)}{inline(value)}</{tag}>')
        (ROOT / f'{name}.html').write_text(render(title, '\n'.join(content)), encoding='utf-8')
        documents.append({'id': key, 'title': title, 'termsType': terms_type,
                          'termsVersion': version, 'effectiveDate': EFFECTIVE_DATE,
                          'sourceSha256': hashlib.sha256(text.encode()).hexdigest(),
                          'source': source.name, 'html': f'{name}.html',
                          'blocks': [b for b, _ in parsed]})
    # Final wording is not proof of completed deployment or overseas-transfer compliance.
    bundle = {'schemaVersion': 1, 'status': 'handoff-final', 'publicationReady': False,
              'documents': documents[:7], 'supportDocuments': documents[7:]}
    (ROOT / 'app-documents.json').write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Keep the offline app copy generated from exactly the same document sources.
    app_bundle = BASE.parent.parent / 'frontend/src/shared/legalContent.json'
    app_bundle.write_text(json.dumps({'schemaVersion': 1, 'documents': documents[:7]},
                                     ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    index = '<h1>DIO 약관·개인정보 안내</h1><p>시행일: 2026년 11월 4일</p><p>운영자: 신승민 · 문의: <a href="mailto:dioapp.official@gmail.com">dioapp.official@gmail.com</a></p><ul>'
    index += ''.join(f'<li><a href="{d["html"]}">{escape(d["title"])}</a></li>' for d in documents)
    index += '</ul>'
    (ROOT / 'index.html').write_text(render('DIO 약관·개인정보 안내', index, navigation=False), encoding='utf-8')
    zip_path = BASE / 'DIO-legal-handoff-20261103.zip'
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(ROOT.iterdir()):
            if file.is_file():
                archive.write(file, 'DIO-legal/' + file.name)
    print('Built 8 documents, index.html, app-documents.json and ' + zip_path.name)


if __name__ == '__main__':
    build()
