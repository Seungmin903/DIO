# pg_dump 클라이언트 버전은 운영 PostgreSQL(17)과 맞춘다.
FROM postgres:17-alpine

COPY pg-backup.sh /usr/local/bin/pg-backup.sh
RUN chmod 755 /usr/local/bin/pg-backup.sh

ENTRYPOINT ["/usr/local/bin/pg-backup.sh"]
