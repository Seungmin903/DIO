FROM nginx:1.30.6-alpine

COPY default.conf /etc/nginx/conf.d/default.conf
# 앱 링크 확인 파일(.well-known)과 초대 안내 페이지(/invite/)
COPY public/ /usr/share/nginx/dio/
