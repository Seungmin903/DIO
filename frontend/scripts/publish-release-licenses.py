"""Package offline notices, original sources and a replaceable web HEIC decoder."""
import argparse
import base64
import gzip
import hashlib
import html
import importlib.util
import json
from pathlib import Path
import re
import shutil
import struct
import tarfile
import zipfile

spec=importlib.util.spec_from_file_location('license_prepare',Path(__file__).with_name('prepare-release-licenses.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
ROOT,CACHE=audit.ROOT,audit.CACHE

def zip_files(target, files):
    target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(2026,10,27,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,data)

def tar_notices(filename, predicate=lambda name:True):
    texts=[]
    with tarfile.open(CACHE/filename) as archive:
        for member in archive.getmembers():
            if member.isfile() and member.size<2_000_000 and audit.LEGAL_NAME.match(Path(member.name).name) and predicate(member.name):
                texts.append((member.name,archive.extractfile(member).read().decode('utf-8',errors='replace')))
    return texts

def input_files(*names): return {name:(CACHE/name).read_bytes() for name in names}
def component(name,version,license,url,texts): return audit.entry('embedded:'+name+'@'+version,name,version,license,url,texts,'Embedded runtime component')

def source_info(path):
    return dict(fileName=path.name,bytes=path.stat().st_size,sha256=audit.digest(path.read_bytes()),
                url='licenses/sources/'+path.name,asset='asset:///dio_licenses/sources/'+path.name)

def heic_sources():
    files=input_files('heic-to-source.tar.gz','libheif-source.tar.gz','libde265-source.tar.gz','GPL-3.0-only.txt','LGPL-3.0-only.txt','emscripten-LICENSE.txt','emscripten-musl-COPYRIGHT.txt','emscripten-libcxx-LICENSE.txt')
    files['SOURCE_MANIFEST.json']=json.dumps(json.loads(audit.read(ROOT/'third-party/inputs.json')),indent=2).encode()
    files['REBUILD-AND-RELINK.txt']=b'''DIO HEIC source and replacement kit (2026-10-27)

Included unmodified upstream source: heic-to v1.6.6; libheif v1.23.6;
libde265 v1.0.16. Original COPYING/LICENSE files remain in each archive.
The installed package's original prebuilt libheif JavaScript is also in the
heic-to archive. It identifies the same libheif/libde265 versions and CSP flags.

Preferred C/C++ source rebuild (Linux/macOS): install CMake, pkg-config, make,
autoconf/automake/libtool and an Emscripten SDK; activate that SDK's environment.
Unpack libheif-source.tar.gz and libde265-source.tar.gz. Create libheif/buildjs,
place the original libde265 archive there named libde265-1.0.16.tar.gz, then run:
  LIBDE265_VERSION=1.0.16 USE_UNSAFE_EVAL=0 USE_WASM=0 ../build-emscripten.sh ..
Use the upstream README's llvm-nm path adjustment if the SDK layout needs it.
This enables libde265 and leaves optional AOM/OpenJPEG/WebCodecs disabled.
The original heic-to README and build-emscripten.sh supply the build commands.
The exact upstream compiler version was not published; byte-identical compiler
output is not claimed. The original preferred sources and build scripts are
provided, along with the original prebuilt JavaScript used in this distribution.

Wrapper rebuild: unpack heic-to-source.tar.gz, replace
src/lib/libheif-without-unsafe-eval.js with the compatible rebuilt library
(keep its default ESM factory export), run npm install and npm run build.
Copy dist/csp/heic-to.js to vendor/heic-to/1.6.6/heic-to.mjs in a local copy
of the delivered web distribution. Serve the web directory over HTTP locally
and reload with the browser cache disabled. DIO's compiled application JS does
not need recompilation, a signing key, or the upstream library's original hash.
register.mjs imports that file and exposes the heicTo/isHeic interface.
You can also set DIO_HEIC_DECODER_URL before application startup to a same-origin
replacement registration module exposing globalThis.DIOHeic.heicTo.
The application object code is the delivered web JavaScript; the loader source
and registration module are included below for recombination/debugging.

No additional restriction is imposed on modifying these libraries or reverse
engineering the combined work for debugging library modifications. Original
license terms govern the third-party sources. No model weights or private
handwriting materials are included in this source kit.
'''
    files['dio/heicDecoder.web.js']=(ROOT/'src/editor/utils/heicDecoder.web.js').read_bytes()
    files['dio/LICENSE']=(ROOT/'third-party/SOURCE_KIT_LICENSE.txt').read_bytes()
    target=CACHE/'heic-decoder-sources.zip';zip_files(target,files);return target

def suffix_sources(native_inventory):
    artifact=next(a for a in native_inventory['artifacts'] if a['coordinate']=='com.squareup.okhttp3:okhttp:4.9.2')
    with zipfile.ZipFile(artifact['file']) as archive:
        encoded=archive.read('okhttp3/internal/publicsuffix/publicsuffixes.gz')
        notice=archive.read('okhttp3/internal/publicsuffix/NOTICE')
    raw=gzip.decompress(encoded); count=struct.unpack('>I',raw[:4])[0]
    rules=raw[4:4+count]; offset=4+count; exceptions_size=struct.unpack('>I',raw[offset:offset+4])[0]
    exceptions=raw[offset+4:offset+4+exceptions_size]
    assert offset+4+exceptions_size==len(raw)
    # Expose the preferred editable data, not just its gzip object representation.
    dat=b'// MPL-2.0: https://mozilla.org/MPL/2.0/\n// Public Suffix List contributors; https://publicsuffix.org/\n// DIO 2026-10-27: reconstructed text from OkHttp 4.9.2 publicsuffixes.gz.\n// Matching rules unchanged; source comments were not present in the binary.\n'+rules+b''.join(b'!'+line+b'\n' for line in exceptions.splitlines())
    rebuild=b'''import gzip,struct,pathlib
rows=[r for r in pathlib.Path('public_suffix_list.dat').read_bytes().splitlines() if r and not r.startswith(b'//')]
rules=b''.join(r+b'\\n' for r in sorted(r for r in rows if not r.startswith(b'!')))
exceptions=b''.join(r[1:]+b'\\n' for r in sorted(r for r in rows if r.startswith(b'!')))
payload=struct.pack('>I',len(rules))+rules+struct.pack('>I',len(exceptions))+exceptions
pathlib.Path('publicsuffixes.gz').write_bytes(gzip.compress(payload,mtime=0))
'''
    files={'public_suffix_list.dat':dat,'original/publicsuffixes.gz':encoded,'NOTICE':notice,
           'MPL-2.0.txt':(CACHE/'MPL-2.0.txt').read_bytes(),'rebuild.py':rebuild,
           'README.txt':b'Editable source for the exact rules in the shipped OkHttp 4.9.2 resource. Run python rebuild.py to recreate the uncompressed payload; gzip container bytes may differ. The parser is Apache-2.0 OkHttp; the list data is MPL-2.0. No DIO diary data is included.'}
    files['DIO-BUILD-UTILITIES-LICENSE.txt']=(ROOT/'third-party/SOURCE_KIT_LICENSE.txt').read_bytes()
    # Round-trip the actual rule payload before distributing the reconstructed source.
    assert b''.join(r+b'\n' for r in sorted(r for r in dat.splitlines() if r and not r.startswith((b'//',b'!'))))==rules
    target=CACHE/'okhttp-publicsuffix-sources.zip';zip_files(target,files);return target,notice.decode()

def additions(platform, native_inventory, ndk):
    records=[]; sources=[]
    for folder,name in [('gowundodum','Gowun Dodum'),('gowunbatang','Gowun Batang')]:
        records.append(component(name,'bundled font files','OFL-1.1','https://github.com/google/fonts/tree/main/ofl/'+folder,[('Bundled original OFL.txt',audit.read(ROOT/'assets/fonts'/folder/'OFL.txt'))]))
    if platform=='web':
        archive=heic_sources();sources.append(archive)
        for name,version,file in [('libheif','1.23.6','libheif-source.tar.gz'),('libde265','1.0.16','libde265-source.tar.gz')]:
            texts=tar_notices(file,lambda path:'/examples/' not in path and '/dec265/' not in path and '/sherlock265/' not in path and '/enc265/' not in path)
            value=component(name,version,'LGPL-3.0-or-later','https://github.com/strukturag/'+name,texts)
            value['sourceArchives']=[source_info(archive)];records.append(value)
        records.append(component('Emscripten runtime','upstream generated runtime; reference notices 3.1.72','MIT / NCSA / runtime subcomponent terms','https://github.com/emscripten-core/emscripten',[(f,audit.read(CACHE/f)) for f in ['emscripten-LICENSE.txt','emscripten-musl-COPYRIGHT.txt','emscripten-libcxx-LICENSE.txt']]))
    else:
        coordinates={a['group']+':'+a['name']:a['version'] for a in native_inventory['artifacts']}
        rn=coordinates['com.facebook.react:react-android']
        hermes=next(v for k,v in coordinates.items() if k.endswith(':hermes-android'))
        fresco=coordinates['com.facebook.fresco:fresco']
        runtime_sources={
            ('0.86.3','250829098.0.17','3.6.0'):('hermes-source.tar.gz','fresco-source.tar.gz','boost-LICENSE.txt'),
            ('0.88.0','260318099.0.4','3.7.0'):('hermes-source-sdk58-v4.tar.gz','fresco-source-sdk58.tar.gz','boost-sdk58-LICENSE.txt'),
        }
        if (rn,hermes,fresco) not in runtime_sources:raise ValueError('Review native runtime source revisions before publishing notices: '+str((rn,hermes,fresco)))
        hermes_source,fresco_source,boost_notice=runtime_sources[(rn,hermes,fresco)]
        eigen=CACHE/'eigen-source.zip'
        # This is the source archive hash pinned by the ORT release's own deps.txt.
        if hashlib.sha1(eigen.read_bytes()).hexdigest()!='05b19b49e6fbb91246be711d801160528c135e34': raise ValueError('ORT Eigen source identity mismatch')
        sources.append(eigen)
        value=component('Eigen','1d8b82b0740839c0de7f1242a3585e3390ff5f33','MPL-2.0','https://github.com/eigen-mirror/eigen/tree/1d8b82b0740839c0de7f1242a3585e3390ff5f33',[('MPL-2.0',audit.canonical('MPL-2.0'))])
        value['sourceArchives']=[source_info(eigen)];records.append(value)
        suffix,notice=suffix_sources(native_inventory);sources.append(suffix)
        value=component('Public Suffix List','OkHttp 4.9.2 resource','MPL-2.0','https://publicsuffix.org/',[('Original resource NOTICE',notice),('MPL-2.0',audit.canonical('MPL-2.0'))])
        value['changes']='Editable rule data reconstructed from shipped gzip; matching rules unchanged.'
        value['sourceArchives']=[source_info(suffix)];records.append(value)
        records.append(component('ONNX Runtime embedded notices','1.23.2','Upstream multi-license notices','https://github.com/microsoft/onnxruntime/tree/v1.23.2',[('LICENSE',audit.read(CACHE/'onnxruntime-LICENSE.txt')),('ThirdPartyNotices.txt (upstream feature superset)',audit.read(CACHE/'onnxruntime-ThirdPartyNotices.txt'))]))
        records.append(component('Hermes runtime and vendored notices',hermes,'MIT / BSD / NCSA / Unicode / BSL','https://github.com/facebook/hermes/tree/hermes-v'+hermes,tar_notices(hermes_source,lambda path:all(x not in path for x in ['/benchmarks/','/tests/','/test/','/utils/']))))
        records.append(component('Fresco native codecs',fresco,'MIT / BSD / IJG / Zlib','https://github.com/facebook/fresco/tree/v'+fresco,tar_notices(fresco_source,lambda path:'/docs/' not in path)+tar_notices('giflib-source.tar.gz')+[(f,audit.read(CACHE/f)) for f in ['jpeg-turbo-LICENSE.txt','jpeg-turbo-IJG.txt','libpng-LICENSE.txt','webp-COPYING.txt','webp-PATENTS.txt','webp-AUTHORS.txt']]))
        records[-1]['notice']='This software is based in part on the work of the Independent JPEG Group.'
        records.append(component('React Native linked C++ dependencies',rn,'BSL-1.0 / BSD / MIT / Apache-2.0','https://github.com/facebook/react-native/tree/v'+rn,[(f,audit.read(CACHE/f)) for f in [boost_notice,'double-conversion-LICENSE.txt','fast-float-LICENSE.txt','fmt-LICENSE.txt','folly-LICENSE.txt','glog-LICENSE.txt']]))
        avif_text=tar_notices('libavif-source.tar.gz',lambda path:path.count('/')==1)
        avif_text += [('dav1d 1.4.3 COPYING',audit.read(CACHE/'dav1d-COPYING.txt'))]
        avif_text += [(f,base64.b64decode((CACHE/f).read_bytes()).decode()) for f in ['libyuv-LICENSE.txt','libyuv-PATENTS.txt','libyuv-AUTHORS.txt']]
        records.append(component('libavif linked decoder dependencies','14d8e3c4 / dav1d 1.4.3 / libyuv 464c51a0','BSD-2-Clause / BSD-3-Clause / patent grants','https://github.com/AOMediaCodec/libavif/tree/14d8e3c4',avif_text))
        records[-1]['notice']='Original libavif copyright and patent notices retained. JNI CMake enables dav1d/libyuv; both names are present in the shipped binary. Dependency revisions follow this upstream commit build scripts.'
        records.append(component('APNG4Android native GIF decoder','3.0.5','Apache-2.0','https://github.com/penfeizhou/APNG4Android/tree/v3.0.5',tar_notices('apng4android-source.tar.gz')))
        records.append(component('Zstandard linked into zstd-kmp','1dbc2e09084e843f6c0dcc2d0791610015c50979','BSD-3-Clause','https://github.com/facebook/zstd/tree/1dbc2e09084e843f6c0dcc2d0791610015c50979',[('Zstandard original BSD license (selected from BSD/GPL dual terms)',audit.read(CACHE/'zstd-LICENSE.txt'))]+tar_notices('zstd-kmp-source.tar.gz')))
        if not ndk or not (ndk/'NOTICE').exists(): raise ValueError('Actual Android NDK runtime NOTICE required')
        records.append(component('Android NDK runtime notices',ndk.name,'NDK component license notices','https://android.googlesource.com/platform/ndk/',[('NDK NOTICE (upstream component superset)',audit.read(ndk/'NOTICE'))]))
        records.append(component('DM-Font inference code','488a8e823920d94ea3f544bad9fe8e34929d8c04','MIT','https://github.com/clovaai/dmfont',[(f,audit.read(ROOT/'model-tools/dio_dmfont'/f)) for f in ['UPSTREAM_LICENSE']]+[('Inference code provenance NOTICE',audit.read(ROOT/'model-tools/NOTICE'))]))
    return records,sources

def publish(args, platform, report, native):
    records=report['components']
    extra,sources=additions(platform,native,args.ndk);records+=extra
    if platform=='web':
        if not any(value['id'].startswith('npm:heic-to@') for value in records):
            records.append(audit.npm_entry(ROOT/'node_modules/heic-to'))
        for value in records:
            if value['id'].startswith('npm:heic-to@'):
                value['sourceArchives']=[source_info(CACHE/'heic-decoder-sources.zip')]
                value['usage']='웹 HEIC 변환기 · 앱과 분리된 교체 가능 모듈'
    if platform=='android':
        for value in records:
            if value['id'].startswith('maven:org.checkerframework:checker-compat-qual:'):
                original=audit.read(CACHE/'checker-framework-LICENSE.txt')
                match=re.search(r'(?m)^(?:The )?MIT License',original)
                if not match: raise ValueError('Cannot locate original qualifier MIT notice')
                value['text']=original[:original.index('Some external libraries')]+original[match.start():]
                value['notice']='MIT applies to the qualifier annotations; the GPL compiler is not included.'
    records.sort(key=lambda value:value['id'])
    fingerprint=audit.digest(json.dumps(records,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode())
    catalog=dict(schema=1,platform=platform,contentSha256=fingerprint,dependencyLockSha256=audit.digest((ROOT/'pnpm-lock.yaml').read_bytes()),components=records)
    audit.dump(ROOT/f'src/licenses/generated/{platform}.json',catalog)
    folder=ROOT/'public/licenses' if platform=='web' else ROOT/'modules/dio-handwriting/android/src/main/assets/dio_licenses'
    folder.mkdir(parents=True,exist_ok=True)
    for source in sources:
        dest=folder/'sources'/source.name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
    all_notices='DIO THIRD-PARTY SOFTWARE NOTICES\n\nOriginal copyright notices and terms follow. These notices cover software components, not model weights. Third-party components remain under their respective terms. Nothing in DIO terms restricts modification or reverse engineering for debugging library modifications where the respective license grants those rights.\n\n'
    all_notices+='\n\n'.join('===== '+v['name']+' '+v['version']+' / '+v['license']+' =====\nSource: '+v['sourceUrl']+'\n'+v['notice']+'\n'+v['text'] for v in records)
    content=json.loads(audit.read(ROOT/'src/diary/data/contentLicenses.json'))
    all_notices+='\n\nCONTENT AND FONT NOTICES\n\n'+'\n\n'.join(v['name']+'\n'+v['notice']+'\n'+v['text'] for v in content)
    (folder/'THIRD_PARTY_NOTICES.txt').write_text(all_notices,encoding='utf-8')
    public_inventory={k:v for k,v in report.items() if k!='components'}
    public_inventory['components']=[{k:v for k,v in item.items() if k!='text'} for item in records]
    audit.dump(folder/'inventory.json',public_inventory)
    if platform=='web':
        links=''.join('<li><a download href="sources/'+s.name+'">'+html.escape(s.name)+'</a></li>' for s in sources)
        (folder/'index.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DIO 오픈소스 고지와 소스</title><main style="max-width:60rem;margin:3rem auto;padding:1rem;font:1rem/1.6 sans-serif"><h1>DIO 오픈소스 고지와 소스</h1><p><a href="THIRD_PARTY_NOTICES.txt">전체 저작권·라이선스 전문</a> · <a href="inventory.json">구성 요소 목록</a></p><h2>라이브러리 소스</h2><ul>'+links+'</ul><p>소스 묶음의 REBUILD-AND-RELINK.txt에서 라이브러리 재빌드·교체 방법을 확인할 수 있습니다. 해당 라이브러리의 수정과 그 수정의 디버깅을 위한 역공학에 추가 제한을 두지 않습니다.</p><p>이 고지는 소프트웨어 구성 요소를 대상으로 하며 모델 가중치의 권리를 판정하지 않습니다.</p></main></html>',encoding='utf-8')
    return {'platform':platform,'components':len(records),'noticeSha256':audit.digest((folder/'THIRD_PARTY_NOTICES.txt').read_bytes()),'sourceArchives':[source_info(s) for s in sources]}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web',type=Path,required=True);parser.add_argument('--android',type=Path,required=True)
    parser.add_argument('--native-inventory',type=Path,required=True);parser.add_argument('--ndk',type=Path,required=True)
    parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    pinned=json.loads(audit.read(ROOT/'third-party/inputs.json'))
    for item in pinned['inputs']:
        if not item['sha256'] or audit.digest((CACHE/item['file']).read_bytes())!=item['sha256']: raise ValueError('Unverified input: '+item['file'])
    native=json.loads(audit.read(args.native_inventory))
    result=[publish(args,'web',json.loads(audit.read(args.web)),native),publish(args,'android',json.loads(audit.read(args.android)),native)]
    vendor=ROOT/'public/vendor/heic-to/1.6.6';vendor.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/'node_modules/heic-to/dist/csp/heic-to.js',vendor/'heic-to.mjs')
    (vendor/'register.mjs').write_text("import * as decoder from './heic-to.mjs';\nglobalThis.DIOHeic = decoder;\n",encoding='utf-8')
    shutil.copyfile(ROOT/'node_modules/heic-to/LICENSE',vendor/'LICENSE')
    audit.dump(args.report,dict(schema=1,weightsExcluded=True,platforms=result,heicVendorSha256=audit.digest((vendor/'heic-to.mjs').read_bytes())))
    print(json.dumps([{'platform':v['platform'],'components':v['components']} for v in result]))

if __name__=='__main__':main()
