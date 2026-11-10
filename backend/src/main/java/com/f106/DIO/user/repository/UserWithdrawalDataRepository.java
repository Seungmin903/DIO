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
        // 탈퇴자가 공유한 손글씨 폰트는 개인 정보라 공유 연결을 지운다. 그 폰트로 쓴 글자는 남고 앱이 기본 고딕으로 그린다.
        jdbc.update("delete from diary_handwriting_fonts where granted_by_user_id=?",actor);
        // 꾸미기 공방 스티커 보관함은 개인 데이터라 지운다. 참조가 없어진 스티커 이미지는 아래에서 정리 경로로 간다
        jdbc.update("delete from user_sticker_library_media where user_id=?",actor);
        jdbc.update("delete from user_sticker_libraries where user_id=?",actor);
        // 내 표지 보관함도 같은 이유로 지운다
        jdbc.update("delete from user_cover_library_media where user_id=?",actor);
        jdbc.update("delete from user_cover_libraries where user_id=?",actor);
        // 그 밖의 공유 작업·미디어 참조는 유지한다. 참조가 없어진 개인 파일(위 폰트 포함)만 기존 보존·정리 경로로 보낸다.
        jdbc.update("update media_files set deleted_at=? where owner_user_id=? and deleted_at is null "
            + unreferenced,java.sql.Timestamp.from(now),actor);
    }
}
