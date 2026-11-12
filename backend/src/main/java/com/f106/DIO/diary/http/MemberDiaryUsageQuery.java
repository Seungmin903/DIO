package com.f106.DIO.diary.http;

import java.util.List;
import java.util.UUID;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.DiaryDetailException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 내가 참여 중인 모든 다이어리(내 것 + 참여 중인 공유 다이어리)의 속지 수·요소 수를 한 번에 센다.
 * 다이어리·속지 개수 제한 안내용이며, 범위는 회원 다이어리 목록(MemberDiaryListQuery)과 같다.
 * 휴지통(삭제 표시)에 있는 다이어리·속지·요소는 세지 않는다.
 */
@Service
public class MemberDiaryUsageQuery {
    @io.swagger.v3.oas.annotations.media.Schema(name="MemberDiaryUsageItem")
    public record Item(UUID diaryId, boolean owned, long pageCount, long elementCount) {}
    @io.swagger.v3.oas.annotations.media.Schema(name="MemberDiaryUsage")
    public record Usage(long diaryCount, List<Item> diaries) {}

    private final JdbcTemplate jdbc;
    private final DiaryRequestIdentity identity;
    public MemberDiaryUsageQuery(JdbcTemplate jdbc, DiaryRequestIdentity identity) { this.jdbc=jdbc; this.identity=identity; }

    @Transactional(readOnly=true)
    public Usage get() {
        long user=identity.requireUserId(DiaryDetailException::unauthorized);
        List<Item> items=jdbc.query(
            "SELECT d.diary_id, m.role, "+
            "(SELECT COUNT(*) FROM pages p WHERE p.diary_id=d.diary_id AND p.deleted_at IS NULL) AS page_count, "+
            "(SELECT COUNT(*) FROM canvas_elements e JOIN pages p ON p.page_id=e.page_id "+
            " WHERE p.diary_id=d.diary_id AND p.deleted_at IS NULL AND e.deleted_at IS NULL) AS element_count "+
            "FROM diaries d JOIN diary_members m ON m.diary_id=d.diary_id AND m.user_id=? "+
            "WHERE d.deleted_at IS NULL AND m.left_at IS NULL AND d.owner_user_id IS NOT NULL "+
            "AND ((m.role='OWNER' AND d.owner_user_id=m.user_id) OR (m.role='EDITOR' AND d.owner_user_id<>m.user_id)) "+
            "ORDER BY d.created_at, d.diary_id",
            (rs,n) -> new Item(rs.getObject("diary_id",UUID.class),"OWNER".equals(rs.getString("role")),
                rs.getLong("page_count"),rs.getLong("element_count")),
            user);
        return new Usage(items.size(),items);
    }
}
