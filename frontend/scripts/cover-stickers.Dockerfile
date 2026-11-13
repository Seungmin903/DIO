FROM node:24-bookworm@sha256:9d266751ca3d7fdbe651c878ffd5ad0a42fed49a18c283509267c97f025b7496
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# OS 의존성과 브라우저는 이미지 빌드 시 설치한다. 테스트 자체는 비root로 실행한다.
COPY package.json /opt/qa/package.json
RUN PLAYWRIGHT_VERSION="$(node -e "const v=require('/opt/qa/package.json').devDependencies.playwright;if(!/^\d+\.\d+\.\d+$/.test(v))throw Error('Pin Playwright to an exact version');process.stdout.write(v)")" \
    && PNPM_VERSION="$(node -p "require('/opt/qa/package.json').packageManager.split('@')[1]")" \
    && npm install --global "pnpm@$PNPM_VERSION" \
    && pnpm dlx "playwright@$PLAYWRIGHT_VERSION" install --with-deps chromium \
    && printf '%s' "$PLAYWRIGHT_VERSION" > /ms-playwright/package-version \
    && chmod -R a+rX /ms-playwright
WORKDIR /workspace/frontend
RUN chmod 1777 /workspace/frontend
ENV HOME=/tmp
