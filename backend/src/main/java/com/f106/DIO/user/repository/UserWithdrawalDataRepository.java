package com.f106.DIO.user.repository;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class UserWithdrawalDataRepository {
    private final JdbcTemplate jdbc;
    public UserWithdrawalDataRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public void erasePrivate(long actor,Instant now){
        jdbc.update("delete from user_terms_agreements where user_id=?",actor);
        jdbc.update("delete from notifications where user_id=?",actor);
        // 공유 작업·미디어의 참조는 유지한다. 참조 없는 개인 파일만 기존 보존·정리 경로로 보낸다.
        jdbc.update("update media_files set deleted_at=? where owner_user_id=? and deleted_at is null and not exists(select 1 from canvas_elements e where e.media_file_id=media_files.media_file_id) and not exists(select 1 from diary_media_library l where l.media_file_id=media_files.media_file_id) and not exists(select 1 from diary_handwriting_fonts f where f.font_media_file_id=media_files.media_file_id) and not exists(select 1 from diary_members m where m.member_profile_photo_id=media_files.media_file_id)",java.sql.Timestamp.from(now),actor);
    }
}
