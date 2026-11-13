#!/usr/bin/env bash
set -euo pipefail
# 읽기 전용 체크아웃을 복사해 node_modules·Metro 캐시·root 소유 파일이 호스트에 남지 않게 한다.
tar -C /source --exclude=node_modules --exclude=.expo --exclude='.env*' -cf - . | tar -xf -
trap 'if [ -f .expo/cover-sticker-ci/metro.log ]; then cp .expo/cover-sticker-ci/metro.log /artifacts/metro.log; fi' EXIT
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
node --test tests/cover-sticker-controls.test.js
pnpm qa:cover-stickers
