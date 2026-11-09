"""Legal document contracts; run with Python's standard library, without editing source files."""
import contextlib
import hashlib
import io
import json
import os
from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

LEGAL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(LEGAL))
import build_app_release as candidate
import build_final as final


class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.parts, self.tag = [], [], None

    def handle_starttag(self, tag, attrs):
        if tag in ('h1', 'h2', 'h3', 'p'):
            self.tag, self.parts = tag, []

    def handle_data(self, data):
        if self.tag:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if self.tag == tag:
            self.rows.append(''.join(self.parts))
            self.tag = None


class LegalBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ.get('DIO_LEGAL_TEST_TMP'))
        self.addCleanup(self.temp.cleanup)
        self.repository = Path(self.temp.name)
        self.base = self.repository / 'docs/legal'
        self.app = self.repository / 'frontend/src/shared/legalContent.json'
        self.app.parent.mkdir(parents=True)
        for folder in ('final', 'app-release-20261103'):
            shutil.copytree(LEGAL / folder, self.base / folder)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(final, 'BASE', self.base))
        self.stack.enter_context(patch.object(final, 'ROOT', self.base / 'final'))
        self.stack.enter_context(patch.object(candidate, 'ROOT', self.base / 'app-release-20261103'))
        self.stack.enter_context(contextlib.redirect_stdout(io.StringIO()))

    def read_bundle(self):
        return json.loads((final.ROOT / 'app-documents.json').read_text(encoding='utf-8'))

    def test_sources_html_json_and_app_have_identical_complete_content(self):
        final.build()
        bundle = self.read_bundle()
        self.assertFalse(bundle['publicationReady'])
        self.assertEqual(len(bundle['documents']), 7)
        self.assertEqual(len(bundle['supportDocuments']), 1)
        self.assertEqual(json.loads(self.app.read_text(encoding='utf-8'))['documents'], bundle['documents'])
        for doc in bundle['documents'] + bundle['supportDocuments']:
            source = (final.ROOT / doc['source']).read_text(encoding='utf-8')
            self.assertEqual(doc['blocks'], [b for b, _ in candidate.blocks(source)])
            self.assertEqual(doc['sourceSha256'], hashlib.sha256(source.encode()).hexdigest())
            html = (final.ROOT / doc['html']).read_text(encoding='utf-8')
            parser = Paragraphs()
            parser.feed(html)
            expected = [(f'{b["number"]}. ' if 'number' in b else '• ' if b['type'] == 'listItem' else '') + b['text'] for b in doc['blocks']]
            self.assertEqual(parser.rows, expected, doc['id'])
            self.assertIn('charset="utf-8"', html)
            self.assertNotIn('<script', html)
        # Compare complete body against the checked-in offline bundle, not just two regenerated files.
        checked_in = json.loads((LEGAL.parent.parent / 'frontend/src/shared/legalContent.json').read_text(encoding='utf-8'))
        self.assertEqual(bundle['documents'], checked_in['documents'])

    def test_versions_dates_and_signup_contract(self):
        final.build()
        docs = self.read_bundle()['documents']
        self.assertIn(final.EFFECTIVE_LABEL, (final.ROOT / 'index.html').read_text(encoding='utf-8'))
        expected = {key: version for key, _, _, version in candidate.DOCUMENTS}
        for doc in docs:
            self.assertEqual(doc['termsVersion'], expected[doc['id']])
            self.assertEqual(doc['effectiveDate'], '2026-11-09')
            self.assertIn('문서 버전: ' + doc['termsVersion'], [b['text'] for b in doc['blocks']])
            self.assertIn(final.EFFECTIVE_LABEL, [b['text'] for b in doc['blocks']])
        repo = LEGAL.parent.parent
        policy = (repo / 'frontend/src/auth/signupPolicy.js').read_text(encoding='utf-8')
        self.assertRegex(policy, r"SERVICE: 'v2', PRIVACY: 'v2'")
        settings = (repo / 'backend/src/main/resources/application.yml').read_text(encoding='utf-8')
        self.assertIn('${SIGNUP_SERVICE_TERMS_VERSION:v2}', settings)
        self.assertIn('${SIGNUP_PRIVACY_TERMS_VERSION:v2}', settings)
        for name in ('dev', 'prod'):
            env = (repo / f'infra/compose/{name}.env.example').read_text(encoding='utf-8')
            self.assertIn('SIGNUP_SERVICE_TERMS_VERSION=v2', env)
            self.assertIn('SIGNUP_PRIVACY_TERMS_VERSION=v2', env)

    def test_policy_has_all_fourteen_sections_in_both_sets(self):
        for root in (final.ROOT, candidate.ROOT):
            text = (root / 'privacy-policy.md').read_text(encoding='utf-8')
            sections = re.findall(r'^## (\d+)\.', text, re.MULTILINE)
            self.assertEqual(sections, [str(i) for i in range(1, 15)])
            self.assertIn('이전 방침과 적용 기간', text)
            self.assertGreater(len(candidate.blocks(text)), 80)

    def test_regeneration_is_stable_and_does_not_create_archive(self):
        for build, root in ((candidate.build, candidate.ROOT), (final.build, final.ROOT)):
            committed = {p.name: p.read_text(encoding='utf-8') for p in root.iterdir() if p.suffix in ('.html', '.json')}
            build()
            self.assertEqual(committed, {p.name: p.read_text(encoding='utf-8') for p in root.iterdir() if p.suffix in ('.html', '.json')}, root.name)
            first = {p.name: p.read_bytes() for p in root.iterdir() if p.suffix in ('.html', '.json')}
            build()
            self.assertEqual(first, {p.name: p.read_bytes() for p in root.iterdir() if p.suffix in ('.html', '.json')})
        self.assertEqual(list(self.base.rglob('*.zip')), [])

    def approval(self):
        return {'approvedBy': 'test-only', 'approvedAt': '2026-11-03',
                'checks': {key: True for key in final.RELEASE_CHECKS},
                'sourceHashes': {d['id']: d['sourceSha256'] for d in self.read_bundle()['documents'] + self.read_bundle()['supportDocuments']}}

    def save_approval(self, value):
        path = self.base / 'test-approval.json'
        path.write_text(json.dumps(value), encoding='utf-8')
        return path

    def test_each_missing_release_condition_prevents_any_public_output(self):
        final.build()
        for key in final.RELEASE_CHECKS:
            approval = self.approval()
            approval['checks'][key] = False
            output = self.repository / '.local-data' / key
            with self.assertRaisesRegex(ValueError, key):
                final.export_public(output, self.save_approval(approval))
            self.assertFalse(output.exists())

    def test_changed_source_or_incomplete_hash_approval_is_rejected(self):
        final.build()
        approval = self.approval()
        del approval['sourceHashes']['privacy']
        with self.assertRaisesRegex(ValueError, 'privacy'):
            final.export_public(self.repository / '.local-data/missing', self.save_approval(approval))
        approval = self.approval()
        path = final.ROOT / 'privacy-policy.md'
        path.write_text(path.read_text(encoding='utf-8') + '\nChanged body\n', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'policy'):
            final.export_public(self.repository / '.local-data/stale', self.save_approval(approval))

    def test_approved_export_contains_only_nine_public_pages_and_cannot_overwrite(self):
        final.build()
        path = self.save_approval(self.approval())
        output = self.repository / '.local-data/public'
        final.export_public(output, path)
        self.assertEqual(sorted(p.name for p in output.iterdir()), sorted(final.PUBLIC_FILES))
        for item in output.iterdir():
            self.assertEqual(item.read_bytes(), (final.ROOT / item.name).read_bytes())
        with self.assertRaises(ValueError):
            final.export_public(output, path)
        with self.assertRaises(ValueError):
            final.export_public(final.ROOT, path)


if __name__ == '__main__':
    unittest.main()
