"""Download public, pinned license/source inputs; never read private app data."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record-hashes', action='store_true', help='Initial reviewed input registration only')
    args = parser.parse_args()
    path = ROOT / 'third-party/inputs.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    cache = ROOT / 'third-party/cache'; cache.mkdir(parents=True, exist_ok=True)
    def get(entry):
        target = cache / entry['file']
        if not entry['sha256'] and not args.record_hashes:
            raise ValueError('Unpinned input: ' + entry['file'])
        if not target.exists():
            for attempt in range(3):
                try:
                    request = urllib.request.Request(entry['url'], headers={'User-Agent':'DIO-license-audit/1.0'})
                    with urllib.request.urlopen(request, timeout=90) as source:
                        body = source.read()
                    temporary = target.with_suffix(target.suffix + '.pending')
                    temporary.write_bytes(body); temporary.replace(target)
                    break
                except Exception:
                    if attempt == 2: raise
                    time.sleep(1)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if entry['sha256'] and entry['sha256'] != digest:
            raise ValueError('Source input hash mismatch: ' + entry['file'])
        entry['sha256'] = digest
        entry['bytes'] = target.stat().st_size
        print(entry['file'] + ': verified', flush=True)
    failures=[]
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures=[(entry,pool.submit(get,entry)) for entry in manifest['inputs']]
        for entry,future in futures:
            try: future.result()
            except Exception as error: failures.append((entry['file'],str(error)))
    if args.record_hashes:
        path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    if failures: raise RuntimeError(str(failures))

if __name__ == '__main__': main()
