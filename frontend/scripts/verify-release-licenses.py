"""Verify offline legal/source files and the code provenance of final build artifacts."""
import argparse
import importlib.util
import json
from pathlib import Path
import struct
import zipfile

spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare-release-licenses.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
ROOT=audit.ROOT

def elf_build_id(data):
    if data[:4]!=b'\x7fELF': return None
    order='<' if data[5]==1 else '>'
    wide=data[4]==2
    offset=struct.unpack_from(order+('Q' if wide else 'I'),data,40 if wide else 32)[0]
    size,count=struct.unpack_from(order+'HH',data,58 if wide else 46)
    for index in range(count):
        at=offset+index*size
        if struct.unpack_from(order+'I',data,at+4)[0]!=7: continue
        start,length=struct.unpack_from(order+('QQ' if wide else 'II'),data,at+(24 if wide else 16))
        end=start+length
        while start+12<=end:
            names,desc,kind=struct.unpack_from(order+'III',data,start);start+=12
            name=data[start:start+names].rstrip(b'\0');start+=(names+3)&~3
            value=data[start:start+desc];start+=(desc+3)&~3
            if name==b'GNU' and kind==3: return value.hex()
    return None

def check_catalog(platform,maps,js_root):
    catalog=json.loads(audit.read(ROOT/f'src/licenses/generated/{platform}.json'))
    if catalog['dependencyLockSha256']!=audit.digest((ROOT/'pnpm-lock.yaml').read_bytes()): raise ValueError('Stale license catalog: dependency lock changed')
    actual,evidence=audit.metro_packages(maps,js_root)
    known={record['id'] for record in catalog['components']}
    missing=set(actual)-known
    if missing: raise ValueError('Bundled JS lacks notice: '+str(sorted(missing)))
    for value in catalog['components']:
        if not value['text'].strip(): raise ValueError('Empty legal text: '+value['id'])
    return catalog,{'includedJavascriptPackages':len(actual),'sourceMaps':evidence,'noticeComponents':len(known)}

def check_web(folder,catalog):
    code=b''.join(file.read_bytes() for file in (folder/'_expo/static/js/web').glob('*.js'))
    if catalog['contentSha256'].encode() not in code: raise ValueError('Web UI embeds an outdated license catalog')
    prepared=ROOT/'public/licenses'
    for file in prepared.rglob('*'):
        if file.is_file():
            actual=folder/'licenses'/file.relative_to(prepared)
            if not actual.is_file() or audit.digest(actual.read_bytes())!=audit.digest(file.read_bytes()): raise ValueError('Web legal/source file missing or changed: '+str(file.relative_to(prepared)))
    vendor=folder/'vendor/heic-to/1.6.6/heic-to.mjs'
    if audit.digest(vendor.read_bytes())!=audit.digest((ROOT/'node_modules/heic-to/dist/csp/heic-to.js').read_bytes()): raise ValueError('External HEIC code changed without source review')
    if list((folder/'_expo/static/js/web').glob('heic-to-*.js')): raise ValueError('LGPL HEIC code is still embedded by Metro')
    for value in catalog['components']:
        for source in value.get('sourceArchives',[]):
            if audit.digest((folder/source['url']).read_bytes())!=source['sha256']: raise ValueError('Web source download mismatch')
    return {'replaceableHeicModule':True,'sourceFilesBundled':True,'vendorSha256':audit.digest(vendor.read_bytes())}

def native_reference(inventory,ndk,js_root=None):
    reference={}
    for artifact in inventory['artifacts']:
        with zipfile.ZipFile(artifact['file']) as archive:
            for name in archive.namelist():
                if not name.startswith('jni/') or not name.endswith('.so'): continue
                key='/'.join(name.split('/')[1:]);data=archive.read(name)
                reference.setdefault(key,[]).append({'artifact':artifact['coordinate'],'buildId':elf_build_id(data),'sha256':audit.digest(data)})
    for abi,triple in [('arm64-v8a','aarch64-linux-android'),('x86_64','x86_64-linux-android')]:
        file=ndk/'toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib'/triple/'libc++_shared.so'
        data=file.read_bytes()
        reference.setdefault(abi+'/libc++_shared.so',[]).append({'artifact':'Android NDK '+ndk.name+' libc++ runtime','buildId':elf_build_id(data),'sha256':audit.digest(data)})
    if js_root:
        # SDK58 extracts additional Expo prebuilt libraries into the local npm
        # project instead of publishing them as releaseRuntimeClasspath AARs.
        package=js_root/'node_modules/expo-modules-core'
        version=json.loads(audit.read(package/'package.json'))['version']
        for folder,kind in [('android/build/expo-prebuilt-natives','prebuilt'),('android/build/intermediates/cxx/RelWithDebInfo','local release build')]:
            for file in (package/folder).rglob('libexpo-modules-*.so'):
                abi=file.parent.name
                if abi not in ('arm64-v8a','x86_64'):continue
                data=file.read_bytes()
                reference.setdefault(abi+'/'+file.name,[]).append({'artifact':'npm expo-modules-core@'+version+' '+kind,'buildId':elf_build_id(data),'sha256':audit.digest(data)})
    return reference

def check_android(file,catalog,inventory,reference,bundle):
    is_bundle=file.suffix=='.aab';prefix='base/' if is_bundle else ''
    prepared=ROOT/'modules/dio-handwriting/android/src/main/assets/dio_licenses'
    results=[]
    with zipfile.ZipFile(file) as archive:
        if catalog['contentSha256'].encode() not in archive.read(prefix+'assets/index.android.bundle'): raise ValueError('Android UI embeds an outdated license catalog')
        if audit.digest(archive.read(prefix+'assets/index.android.bundle'))!=audit.digest(bundle.read_bytes()): raise ValueError('Android bytecode differs from the audited source map build')
        for source in prepared.rglob('*'):
            if not source.is_file(): continue
            name=prefix+'assets/dio_licenses/'+source.relative_to(prepared).as_posix()
            if audit.digest(archive.read(name))!=audit.digest(source.read_bytes()): raise ValueError('Android legal/source file mismatch: '+name)
        for name in archive.namelist():
            if not name.startswith(prefix+'lib/') or not name.endswith('.so'): continue
            key=name[len(prefix+'lib/'):];data=archive.read(name);build_id=elf_build_id(data);sha=audit.digest(data)
            candidates=reference.get(key,[])
            match=next((value for value in candidates if value['sha256']==sha or build_id and value['buildId']==build_id),None)
            if match: owner=match['artifact']
            elif key.split('/')[-1] in ('libappmodules.so','libexpo-modules-core.so','libreact_codegen_rnsvg.so','libreact_codegen_safeareacontext.so'):
                owners={'libappmodules.so':'React Native app and autolinked modules','libexpo-modules-core.so':'expo-modules-core','libreact_codegen_rnsvg.so':'react-native-svg','libreact_codegen_safeareacontext.so':'react-native-safe-area-context'}
                dependency=owners[key.split('/')[-1]]
                if dependency in ('react-native-svg','react-native-safe-area-context') and not any(v['id'].startswith('npm:'+dependency+'@') for v in catalog['components']):raise ValueError('Local codegen owner lacks notice: '+dependency)
                owner='Local native project code: '+dependency
            else: raise ValueError('Unmapped shipped native library: '+name+' buildId='+str(build_id))
            results.append({'path':name,'owner':owner,'buildId':build_id,'sha256':sha})
        for value in catalog['components']:
            for source in value.get('sourceArchives',[]):
                name=prefix+'assets/dio_licenses/sources/'+source['fileName']
                if audit.digest(archive.read(name))!=source['sha256']: raise ValueError('Android source download mismatch')
        if any('snapshot.json' in name or '/baseline/' in name for name in archive.namelist()): raise ValueError('Private test fixtures in release')
    covered={value['id'].removeprefix('maven:') for value in catalog['components'] if value['id'].startswith('maven:')}
    expected={value['coordinate'] for value in inventory['artifacts']}
    if expected-covered: raise ValueError('Native Maven artifact lacks notice')
    return {'file':file.name,'sha256':audit.digest(file.read_bytes()),'bytes':file.stat().st_size,'nativeLibraries':results,'nativeMavenComponents':len(expected),'sourceFilesBundled':True}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web',type=Path,required=True);parser.add_argument('--web-map-root',type=Path)
    parser.add_argument('--android-map',type=Path,nargs='+',required=True);parser.add_argument('--android-bundle',type=Path,required=True)
    parser.add_argument('--android-js-root',type=Path,required=True);parser.add_argument('--native-inventory',type=Path,required=True)
    parser.add_argument('--apk',type=Path,required=True);parser.add_argument('--aab',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--ndk',type=Path,required=True)
    args=parser.parse_args();native=json.loads(audit.read(args.native_inventory))
    android,android_evidence=check_catalog('android',args.android_map,args.android_js_root)
    web_map_root=args.web_map_root or args.web
    web_maps=list((web_map_root/'_expo/static/js/web').glob('*.map'))
    if not web_maps: raise ValueError('Web source maps are required as private audit evidence')
    for source_map in web_maps:
        relative=source_map.relative_to(web_map_root).as_posix().removesuffix('.map')
        if audit.digest((args.web/relative).read_bytes())!=audit.digest((web_map_root/relative).read_bytes()): raise ValueError('Web bundle differs from the audited source map build')
    web,web_evidence=check_catalog('web',web_maps,ROOT)
    web_evidence.update(check_web(args.web,web));reference=native_reference(native,args.ndk,args.android_js_root)
    result={'status':'passed','scope':'Code, notices and source availability for these exact Android/web artifacts; pretrained weight rights excluded',
            'weightsRightsReviewed':False,'web':web_evidence,'android':android_evidence,
            'artifacts':[check_android(file,android,native,reference,args.android_bundle) for file in (args.apk,args.aab)],
            'signing':'Local release-variant audit build; template debug signing key. Not a store publication.',
            'limitations':['License obligations are checked as engineering evidence, not a determination of all commercial rights','Pretrained model weights, training data, trademarks and codec patents are outside this review']}
    audit.dump(args.output,result);print(json.dumps({'status':'passed','webPackages':web_evidence['includedJavascriptPackages'],'androidPackages':android_evidence['includedJavascriptPackages'],'nativeLibraries':[len(value['nativeLibraries']) for value in result['artifacts']]}))

if __name__=='__main__':main()
