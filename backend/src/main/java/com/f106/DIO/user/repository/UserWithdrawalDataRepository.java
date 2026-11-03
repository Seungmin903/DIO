package com.f106.DIO.user.repository;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class UserWithdrawalDataRepository {
    private final JdbcTemplate jdbc;
    private final String unreferenced;
    public UserWithdrawalDataRepository(JdbcTemplate jdbc,com.f106.DIO.media.config.MediaSqlDialect dialect){this.jdbc=jdbc;this.unreferenced=dialect.unreferenced();}
    public void erasePrivate(long actor,Instant now){
        jdbc.update("delete from user_terms_agreements where user_id=?",actor);
        jdbc.update("delete from notifications where user_id=?",actor);
        jdbc.update("delete from diary_handwriting_fonts where granted_by_user_id=?",actor);
        // 공유 작업·미디어의 참조는 유지한다. 참조 없는 개인 파일만 기존 보존·정리 경로로 보낸다.
        jdbc.update("update media_files set deleted_at=? where owner_user_id=? and deleted_at is null "
            + unreferenced,java.sql.Timestamp.from(now),actor);
    }
}
