"""Meaningful distribution gates; no personal samples or model inference."""
import gzip
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('prepare',ROOT/'scripts/prepare-release-licenses.py')
prepare=importlib.util.module_from_spec(spec);spec.loader.exec_module(prepare)

class ReleaseLicenses(unittest.TestCase):
    def test_google_sdk_terms_and_bundled_notices_are_kept_separate(self):
        coordinate='com.google.android.gms:play-services-cloud-messaging:17.2.0'
        with tempfile.TemporaryDirectory() as temp:
            pom=Path(temp,'artifact.pom');aar=Path(temp,'artifact.aar')
            pom.write_text('<project><licenses><license><name>Android Software Development Kit License</name><url>https://developer.android.com/studio/terms.html</url></license></licenses></project>',encoding='utf-8')
            with zipfile.ZipFile(aar,'w') as archive:
                archive.writestr('third_party_licenses.json',json.dumps({'part':{'start':0,'length':6}}))
                archive.writestr('third_party_licenses.txt','notice')
            texts=prepare.google_sdk_notices(coordinate,aar,pom)
            self.assertEqual(texts[1][1],'notice')
            self.assertIn('separate',texts[0][1])
            with self.assertRaisesRegex(ValueError,'Unreviewed'):
                prepare.google_sdk_notices('com.google.android.gms:play-services-cloud-messaging:99',aar,pom)
            with zipfile.ZipFile(aar,'w') as archive:
                archive.writestr('third_party_licenses.json',json.dumps({'part':{'start':0,'length':99}}))
                archive.writestr('third_party_licenses.txt','notice')
            with self.assertRaisesRegex(ValueError,'Invalid Google notice index'):
                prepare.google_sdk_notices(coordinate,aar,pom)

    def test_indexed_source_map_sections_are_all_audited(self):
        data={'sections':[{'map':{'sources':['node_modules/first/a.js']}},{'map':{'sections':[{'map':{'sourceRoot':'src','sources':['node_modules/second/b.js']}}]}}]}
        self.assertEqual(list(prepare.source_paths(data)),['node_modules/first/a.js','src/node_modules/second/b.js'])
        with self.assertRaisesRegex(ValueError,'External indexed'):
            list(prepare.source_paths({'sections':[{'url':'https://external.invalid/map'}]}))
    def test_final_web_rejects_stale_ui_catalog_even_with_fresh_source_assets(self):
        spec=importlib.util.spec_from_file_location('verify',ROOT/'scripts/verify-release-licenses.py')
        verify=importlib.util.module_from_spec(spec);spec.loader.exec_module(verify)
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp);(folder/'_expo/static/js/web').mkdir(parents=True)
            (folder/'_expo/static/js/web/App.js').write_text('old catalog')
            with self.assertRaisesRegex(ValueError,'outdated license catalog'):
                verify.check_web(folder,{'contentSha256':'fresh catalog fingerprint'})

    def test_new_noncommercial_or_unreviewed_copyleft_cannot_silently_ship(self):
        for license in ['CC-BY-NC-SA-4.0','UNKNOWN','GPL-3.0-only','MPL-2.0']:
            with self.subTest(license=license),self.assertRaises(ValueError):
                prepare.approve_terms([dict(id='new-component',name='new-component',license=license)])
        prepare.approve_terms([dict(id='known',name='heic-to',license='LGPL-3.0')])

    def test_source_archives_match_every_offline_download_and_lock(self):
        for platform in ['android','web']:
            catalog=json.loads(prepare.read(prepare.ROOT/f'src/licenses/generated/{platform}.json'))
            self.assertEqual(catalog['dependencyLockSha256'],prepare.digest((prepare.ROOT/'pnpm-lock.yaml').read_bytes()))
            base=prepare.ROOT/('public/licenses' if platform=='web' else 'modules/dio-handwriting/android/src/main/assets/dio_licenses')
            for record in catalog['components']:
                self.assertTrue(record['text'].strip())
                for source in record.get('sourceArchives',[]):
                    data=(base/'sources'/source['fileName']).read_bytes()
                    self.assertEqual(len(data),source['bytes'])
                    self.assertEqual(prepare.digest(data),source['sha256'])

    def test_mpl_preferred_source_reconstructs_exact_shipped_rule_payload(self):
        file=prepare.ROOT/'third-party/cache/okhttp-publicsuffix-sources.zip'
        with tempfile.TemporaryDirectory() as temp,zipfile.ZipFile(file) as archive:
            for name in ['public_suffix_list.dat','rebuild.py']:
                Path(temp,name).write_bytes(archive.read(name))
            subprocess.run([sys.executable,'rebuild.py'],cwd=temp,check=True,capture_output=True)
            self.assertEqual(gzip.decompress(Path(temp,'publicsuffixes.gz').read_bytes()),gzip.decompress(archive.read('original/publicsuffixes.gz')))

    def test_lgpl_kit_contains_preferred_sources_and_relink_instructions(self):
        with zipfile.ZipFile(prepare.ROOT/'third-party/cache/heic-decoder-sources.zip') as archive:
            for name in ['heic-to-source.tar.gz','libheif-source.tar.gz','libde265-source.tar.gz','GPL-3.0-only.txt','LGPL-3.0-only.txt','REBUILD-AND-RELINK.txt','dio/heicDecoder.web.js']:
                self.assertIn(name,archive.namelist())
            self.assertIn(b'without',archive.read('REBUILD-AND-RELINK.txt'))
        with tarfile.open(prepare.ROOT/'third-party/cache/heic-to-source.tar.gz') as archive:
            for relative in ['src/index.js','src/worker.js','src/lib/libheif-without-unsafe-eval.js','esbuild.mjs']:
                member=next(m for m in archive.getmembers() if m.name.endswith('/'+relative))
                self.assertEqual(archive.extractfile(member).read(),(prepare.ROOT/'node_modules/heic-to'/relative).read_bytes())

    def test_unmodified_external_decoder_and_mpl_notice_are_present(self):
        self.assertEqual((prepare.ROOT/'public/vendor/heic-to/1.6.6/heic-to.mjs').read_bytes(),(prepare.ROOT/'node_modules/heic-to/dist/csp/heic-to.js').read_bytes())
        native=json.loads(prepare.read(prepare.ROOT/'src/licenses/generated/android.json'))
        for name in ['Eigen','Public Suffix List']:
            value=next(v for v in native['components'] if v['name']==name)
            self.assertEqual(value['license'],'MPL-2.0');self.assertTrue(value['sourceArchives'])

if __name__=='__main__':unittest.main()
