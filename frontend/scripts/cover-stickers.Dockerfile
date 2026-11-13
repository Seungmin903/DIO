FROM node:24-bookworm
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# OS 의존성과 브라우저는 이미지 빌드 시 설치한다. MR 테스트 자체는 비root로 실행한다.
RUN npm install --global pnpm@11.25.0 \
    && pnpm dlx playwright@1.64.1 install --with-deps chromium \
    && chmod -R a+rX /ms-playwright
WORKDIR /workspace/frontend
RUN chmod 1777 /workspace/frontend
ENV HOME=/tmp
