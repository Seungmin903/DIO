"""Generate offline notices from shipped Metro sources and Android runtime artifacts.

No model weights, diary data, references, or personal fonts are read by this tool.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import hashlib
import html
import io
import json
import os
from pathlib import Path
import re
import shutil
import tarfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
if os.name == 'nt' and not str(ROOT).startswith('\\\\?\\'):
    ROOT = Path('\\\\?\\' + str(ROOT))
CACHE = ROOT / 'third-party/cache'
GRADLE = Path.home() / '.gradle/caches/modules-2/files-2.1'
LEGAL_NAME = re.compile(r'^(?:licen[sc]e|copying|notice|third.?party.?notices|copyright|patents)(?:[._-].*)?$', re.I)
GOOGLE_SDK_ARTIFACTS = {
    'com.android.installreferrer:installreferrer:2.2': False,
    'com.google.android.gms:play-services-base:18.1.0': True,
    'com.google.android.gms:play-services-basement:18.3.0': True,
    'com.google.android.gms:play-services-cloud-messaging:17.2.0': True,
    'com.google.android.gms:play-services-stats:17.0.2': True,
    'com.google.android.gms:play-services-tasks:18.1.0': True,
    'com.google.firebase:firebase-iid-interop:17.1.0': True,
    'com.google.firebase:firebase-measurement-connector:19.0.0': True,
}

def digest(data): return hashlib.sha256(data).hexdigest()
def artifact_path(path):
    value=str(path)
    if os.name=='nt' and not value.startswith('\\\\?\\'):
        value='\\\\?\\'+str(Path(value).resolve())
    return Path(value)
def read(path): return Path(path).read_text(encoding='utf-8-sig', errors='replace')
def dump(path, data):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def clean_url(url):
    if isinstance(url, dict): url=url.get('url','')
    value=re.sub(r'^(?:git\+|scm:git:)', '', url or '').replace('git://','https://').removesuffix('.git')
    if value.startswith('github:'): value='https://github.com/'+value[7:]
    return value if value.startswith(('https://','http://')) else ''

def canonical(expression):
    return read(CACHE / (expression + '.txt'))

def root_texts(folder):
    texts=[]
    for path in sorted(Path(folder).iterdir()):
        if path.is_file() and LEGAL_NAME.match(path.name) and path.stat().st_size < 2_000_000:
            texts.append((path.name, read(path)))
    return texts

def archive_texts(data, depth=0):
    texts=[]
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for entry in archive.infolist():
                if LEGAL_NAME.match(Path(entry.filename).name) and 0 < entry.file_size < 2_000_000:
                    texts.append((entry.filename, archive.read(entry).decode('utf-8',errors='replace')))
                elif depth == 0 and entry.filename == 'classes.jar':
                    texts += [(entry.filename+'!/'+name,text) for name,text in archive_texts(archive.read(entry),1)]
    except zipfile.BadZipFile: pass
    return texts

def google_sdk_notices(coordinate, artifact, pom):
    """Preserve POM SDK terms and bundled OSS notices without treating them as one license."""
    if coordinate not in GOOGLE_SDK_ARTIFACTS or not pom:
        raise ValueError('Unreviewed Android SDK artifact: '+coordinate)
    xml=ET.parse(pom).getroot()
    licenses=xml.findall('./{*}licenses/{*}license')
    if len(licenses)!=1 or licenses[0].findtext('{*}name')!='Android Software Development Kit License' or licenses[0].findtext('{*}url')!='https://developer.android.com/studio/terms.html':
        raise ValueError('Unexpected Android SDK POM terms: '+coordinate)
    texts=[('SDK terms reference in original Maven POM', 'Android Software Development Kit License\nhttps://developer.android.com/studio/terms.html\nThe SDK contract and bundled third-party open-source notices are separate.')]
    with zipfile.ZipFile(artifact) as archive:
        names=set(archive.namelist()); present={'third_party_licenses.json','third_party_licenses.txt'} & names
        if bool(present)!=GOOGLE_SDK_ARTIFACTS[coordinate] or (present and len(present)!=2):
            raise ValueError('Unexpected bundled Google notices: '+coordinate)
        if present:
            raw=archive.read('third_party_licenses.txt'); index=json.loads(archive.read('third_party_licenses.json'))
            if not isinstance(index,dict) or not index: raise ValueError('Empty Google notice index: '+coordinate)
            for name,span in index.items():
                start,length=span.get('start'),span.get('length')
                if not isinstance(name,str) or not isinstance(start,int) or not isinstance(length,int) or start<0 or length<=0 or start+length>len(raw) or not raw[start:start+length].strip():
                    raise ValueError('Invalid Google notice index: '+coordinate)
            texts.append(('Original AAR third_party_licenses.txt (upstream component superset)',raw.decode('utf-8',errors='strict')))
    return texts

def dedup_texts(texts):
    seen=set(); result=[]
    for name,text in texts:
        key=digest(text.encode())
        if key not in seen and text.strip(): result.append((name,text)); seen.add(key)
    return result

def entry(identifier,name,version,license,source,texts,kind):
    texts=dedup_texts(texts)
    if not texts: raise ValueError('Missing license text: '+identifier)
    return dict(id=identifier,name=name,version=version,license=license,creator='See original copyright notices below',
                sourceUrl=source,licenseUrl=source,usage=kind,changes='Original notices retained; no license terms translated.',
                notice='',text='\n\n'.join('--- '+n+' ---\n'+t for n,t in texts))

@lru_cache(maxsize=None)
def package_folder(path):
    path=Path(path)
    for parent in (path,*path.parents):
        if (parent/'package.json').is_file():
            package=json.loads(read(parent/'package.json'))
            if package.get('name') and package.get('version'): return parent
    raise ValueError('Cannot resolve npm source: '+str(path))

@lru_cache(maxsize=None)
def npm_entry(folder):
    package=json.loads(read(folder/'package.json'))
    expression=package.get('license','UNKNOWN')
    if isinstance(expression,dict): expression=expression.get('type','UNKNOWN')
    texts=root_texts(folder)
    if not texts and package['name'].startswith('@react-native/'):
        owner=ROOT/'node_modules/react-native'
        texts=[('React Native monorepo LICENSE',read(owner/'LICENSE'))]
        for source_file in folder.glob('*.js'):
            match=re.match(r'\s*(/\*.*?\*/)',read(source_file),re.S)
            if match and 'copyright' in match[1].lower(): texts.append((source_file.name+' copyright',match[1]))
    if not texts and package['name']=='omggif':
        lines=read(folder/'omggif.js').splitlines()
        header=[]
        for line in lines:
            if not line.startswith('//'): break
            header.append(line)
        texts=[('omggif.js embedded permission notice','\n'.join(header))]
    if not texts and package['name']=='metro-runtime':
        texts=[('Metro monorepo LICENSE',read(CACHE/'metro-LICENSE.txt'))]
    if expression == 'UNKNOWN': raise ValueError('Unknown npm license: '+package['name'])
    source=clean_url(package.get('repository')) or package.get('homepage') or 'https://www.npmjs.com/package/'+package['name']
    value=entry('npm:'+package['name']+'@'+package['version'],package['name'],package['version'],expression,source,texts,'JavaScript / native module')
    value['evidence']={'packageJsonSha256':digest((folder/'package.json').read_bytes())}
    return value

def npm_source(name,version):
    candidates=[ROOT/'node_modules'/name]
    candidates += list((ROOT/'node_modules/.pnpm').glob(name.replace('/','+')+'@*/node_modules/'+name))
    for folder in candidates:
        if (folder/'package.json').is_file() and json.loads(read(folder/'package.json')).get('version')==version: return folder
    return None

def source_paths(source_map):
    # Expo 58 can emit inline indexed maps. Every section belongs to the same
    # audited bundle; external URL sections require an explicit separate audit.
    if 'sections' in source_map:
        for section in source_map['sections']:
            if 'map' not in section: raise ValueError('External indexed source map section is unsupported')
            yield from source_paths(section['map'])
    else:
        prefix=source_map.get('sourceRoot','')
        for source in source_map.get('sources',[]):
            yield prefix.rstrip('/')+'/'+source if prefix and not source.startswith(('/','\\')) and not re.match(r'^[A-Za-z]:',source) else source

def metro_packages(maps, js_root):
    found={}; evidence=[]; unresolved=[]
    for map_file in maps:
        content=Path(map_file).read_bytes(); source_map=json.loads(content)
        sources=list(source_paths(source_map))
        evidence.append({'file':Path(map_file).name,'sha256':digest(content),'sources':len(sources)})
        for source in sources:
            if 'node_modules/' not in source.replace('\\','/'): continue
            normalized=source.replace('\\','/')
            candidate=Path(normalized) if re.match(r'^[A-Za-z]:/',normalized) else js_root / normalized.lstrip('/')
            if not candidate.exists():
                # Android maps can contain project-root-relative paths.
                candidate=js_root / normalized.lstrip('./')
            if not candidate.exists(): unresolved.append(source); continue
            folder=package_folder(candidate.parent)
            item=npm_entry(folder)
            found[item['id']]=item
    if unresolved: raise ValueError('Unresolved shipped JS sources: '+str(unresolved[:5]))
    return found,evidence

def remote_file(url, target, optional=False):
    if not target.exists():
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'DIO-license-audit/1.0'})
            with urllib.request.urlopen(req,timeout=45) as response: data=response.read()
            target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
        except urllib.error.HTTPError as error:
            if optional and error.code in (404,403): return None
            raise
    return target

def maven_inputs(artifact):
    group,name,version=artifact['group'],artifact['name'],artifact['version']
    prefix=group.replace('.','/')+'/'+name+'/'+version+'/'+name+'-'+version
    cached=GRADLE/group/name/version
    pom_files=list(cached.glob('*/*.pom'))
    sources=list(cached.glob('*/*-sources.jar'))
    google_repository = group.startswith(('androidx.', 'com.google.android.gms', 'com.google.firebase',
                                          'com.google.android.datatransport', 'com.android.installreferrer'))
    base='https://dl.google.com/dl/android/maven2/' if google_repository else 'https://repo.maven.apache.org/maven2/'
    dest=CACHE/'maven'/group/name/version
    pom=pom_files[0] if pom_files else remote_file(base+prefix+'.pom',dest/(name+'.pom'),True)
    source=sources[0] if sources else remote_file(base+prefix+'-sources.jar',dest/(name+'-sources.jar'),True)
    return pom,source

def license_name(name):
    lower=name.lower()
    if 'apache' in lower or lower == 'apache-2': return 'Apache-2.0'
    if 'mit' in lower: return 'MIT'
    if 'simplified bsd' in lower or 'bsd 2' in lower: return 'BSD-2-Clause'
    if 'bsd' in lower: return 'BSD-3-Clause'
    if 'gpl' in lower and 'classpath' in lower: return 'GPL-2.0-with-classpath-exception'
    raise ValueError('Unclassified Maven license: '+name)

def source_headers(source):
    texts=archive_texts(source.read_bytes()) if source else []
    if not source: return texts
    # Preserve actual source copyright/permission headers when an artifact drops them.
    with zipfile.ZipFile(source) as archive:
        headers=set()
        for info in archive.infolist():
            if not info.filename.endswith(('.java','.kt')) or info.file_size > 1_000_000: continue
            text=archive.read(info).decode('utf-8',errors='replace')[:8000]
            match=re.match(r'\s*(/\*.*?\*/)',text,re.S)
            if match and 'copyright' in match[1].lower(): headers.add(match[1])
        for index,header in enumerate(sorted(headers)): texts.append(('Source copyright header '+str(index+1),header))
    return texts

def native_entries(inventory):
    values={}; binaries=[]; pom_evidence=[]
    artifacts={item['coordinate']:item for item in inventory['artifacts']}
    # Expo publishes precompiled modules; the matching installed npm source owns the MIT notice.
    expo_packages={}
    for folder in (ROOT/'node_modules').iterdir():
        if folder.name.startswith('expo') and (folder/'package.json').is_file():
            package=json.loads(read(folder/'package.json'));expo_packages[package['name']]=folder
    requested=[item for item in artifacts.values() if not (item['group'].startswith('expo.modules') or item['group']=='host.exp.exponent')]
    with ThreadPoolExecutor(max_workers=8) as pool:
        fetched=dict(zip((item['coordinate'] for item in requested),pool.map(maven_inputs,requested)))
    for coordinate,artifact in sorted(artifacts.items()):
        text_items=archive_texts(artifact_path(artifact['file']).read_bytes())
        if artifact['group'].startswith('expo.modules') or artifact['group']=='host.exp.exponent':
            stem=artifact['name'].replace('expo.modules.','')
            npm='expo-'+{'filesystem':'file-system','imageloader':'image-loader','imagemanipulator':'image-manipulator','imagepicker':'image-picker',
                'documentpicker':'document-picker','keepawake':'keep-awake','medialibrary':'media-library','screenorientation':'screen-orientation',
                'statusbar':'status-bar','navigationbar':'navigation-bar','splashscreen':'splash-screen','systemui':'system-ui','securestore':'secure-store'}.get(stem,stem)
            if stem=='webview': npm='@expo/dom-webview'
            folder=npm_source(npm,artifact['version'])
            if not folder: raise ValueError('Unknown Expo native source: '+coordinate+' / '+npm)
            package=json.loads(read(folder/'package.json'))
            if package['version'] != artifact['version']: raise ValueError('Expo binary/source version mismatch: '+coordinate)
            text_items += root_texts(folder); expression='MIT'; source=clean_url(package.get('repository'))
        elif coordinate in GOOGLE_SDK_ARTIFACTS:
            pom,source_jar=fetched[coordinate]
            text_items += google_sdk_notices(coordinate,artifact_path(artifact['file']),pom)
            expression='Android-SDK-License / bundled third-party notices'
            source='https://developer.android.com/studio/terms.html'
            pom_evidence.append({'coordinate':coordinate,'pomSha256':digest(pom.read_bytes()),'sourcesSha256':digest(source_jar.read_bytes()) if source_jar else None})
        else:
            pom,source_jar=fetched[coordinate]
            xml=ET.parse(pom).getroot() if pom else None
            raw_names=[node.text for node in xml.findall('.//{*}licenses/{*}license/{*}name')] if xml is not None else []
            names=[license_name(name) for name in raw_names]
            # checker-compat-qual ships the MIT-licensed qualifiers, not the GPL compiler.
            if coordinate.startswith('org.checkerframework:checker-compat-qual:'): expression='MIT'
            elif names: expression=' AND '.join(dict.fromkeys(names))
            elif artifact['group'].startswith('androidx.') or artifact['group'] in ('javax.inject','org.jspecify') or artifact['group'].startswith(('com.google.','org.jetbrains.','org.jetbrains.kotlinx','org.jetbrains.kotlin')) or artifact['group'] in ('commons-codec','commons-io'):
                expression='Apache-2.0'
            elif artifact['group']=='org.brotli' or artifact['group']=='org.codehaus.mojo': expression='MIT'
            else: raise ValueError('Missing Maven license: '+coordinate)
            if 'GPL' in expression: raise ValueError('Review copyleft Maven component before inclusion: '+coordinate)
            text_items += source_headers(source_jar)
            if artifact['group'].startswith('com.github.bumptech.glide'):
                text_items.append(('Glide upstream LICENSE',read(CACHE/'glide-LICENSE.txt')))
            for term in expression.split(' AND '):
                if term not in ('MIT','BSD-2-Clause','BSD-3-Clause','Apache-2.0'): raise ValueError('Review Maven expression: '+expression)
                text_items.append((term+' license',canonical(term)))
            source_node=xml.find('.//{*}scm/{*}url') if xml is not None else None
            source=clean_url(source_node.text) if source_node is not None else ''
            if not source: source='https://central.sonatype.com/artifact/'+artifact['group']+'/'+artifact['name']+'/'+artifact['version']
            pom_evidence.append({'coordinate':coordinate,'pomSha256':digest(pom.read_bytes()) if pom else None,'sourcesSha256':digest(source_jar.read_bytes()) if source_jar else None})
        value=entry('maven:'+coordinate,coordinate,artifact['version'],expression,source,text_items,'Android release runtime')
        values[value['id']]=value
    for artifact in inventory['artifacts']:
        file=artifact_path(artifact['file'])
        try:
            with zipfile.ZipFile(file) as archive:
                for info in archive.infolist():
                    if info.filename.startswith('jni/') and info.filename.endswith('.so'):
                        binaries.append({'artifact':artifact['coordinate'],'path':info.filename,'sha256':digest(archive.read(info))})
        except zipfile.BadZipFile: pass
    for project in inventory['projects']:
        directory=project.get('directory')
        if directory and 'node_modules' in directory:
            item=npm_entry(package_folder(Path(directory)));values[item['id']]=item
    return values,binaries,pom_evidence

def approve_terms(records):
    for value in records:
        if re.search(r'CC-BY-NC|non.?commercial|SSPL|BUSL|UNKNOWN|UNLICENSED',value['license'],re.I):
            raise ValueError('Unapproved distribution terms: '+value['id'])
        if re.search(r'GPL|MPL|EPL|CDDL|CPL',value['license']) and value['name']!='heic-to':
            raise ValueError('New copyleft component requires a source-provision review: '+value['id'])

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform',choices=['android','web'],required=True)
    parser.add_argument('--maps',type=Path,nargs='+',required=True)
    parser.add_argument('--js-root',type=Path,default=ROOT)
    parser.add_argument('--native-inventory',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    values,maps=metro_packages(args.maps,args.js_root)
    binary_evidence=[]; poms=[]
    if args.platform=='android':
        if not args.native_inventory: raise ValueError('Android runtime inventory required')
        extra,binary_evidence,poms=native_entries(json.loads(read(args.native_inventory)));values.update(extra)
    records=sorted(values.values(),key=lambda value:value['id'])
    approve_terms(records)
    report=dict(schema=1,platform=args.platform,weightsRightsExcluded=True,sourceMaps=maps,components=records,nativeBinaries=binary_evidence,pomEvidence=poms)
    dump(args.output,report)
    print(json.dumps({'platform':args.platform,'components':len(records),'nativeBinaries':len(binary_evidence),'output':str(args.output)}))

if __name__=='__main__': main()
