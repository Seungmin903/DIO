#!/usr/bin/env bash
set -euo pipefail
# 읽기 전용 체크아웃을 복사해 node_modules·Metro 캐시·root 소유 파일이 호스트에 남지 않게 한다.
# 이미지의 root 소유 WORKDIR 대신 실행 사용자가 소유한 폴더에서 압축 해제한다.
cd "$(mktemp -d /tmp/cover-stickers.XXXXXX)"
tar -C /source --exclude=node_modules --exclude=.expo --exclude=dist --exclude=dist-android --exclude='.env*' -cf - . | tar -xf -
trap 'if [ -f .expo/cover-sticker-ci/metro.log ]; then cp .expo/cover-sticker-ci/metro.log /artifacts/metro.log; fi' EXIT
pnpm install --frozen-lockfile
node -e "const fs=require('node:fs');const built=fs.readFileSync('/ms-playwright/package-version','utf8').trim();const installed=require('playwright/package.json').version;if(built!==installed)throw Error('Playwright image/project version mismatch: '+built+' / '+installed)"
node --test tests/cover-sticker-controls.test.js tests/cover-sticker-processes.test.js
pnpm qa:cover-stickers
