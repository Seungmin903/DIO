FROM node:22-bookworm-slim

ARG CLAUDE_CODE_VERSION=2.1.296
RUN npm install --global "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    && npm cache clean --force
