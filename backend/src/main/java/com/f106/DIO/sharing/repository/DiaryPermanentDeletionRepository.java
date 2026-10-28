package com.f106.DIO.sharing.repository;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
@Repository
public class DiaryPermanentDeletionRepository {
    private final JdbcTemplate jdbc;
    private final EntityManager entities;
    public DiaryPermanentDeletionRepository(JdbcTemplate jdbc,EntityManager entities){this.jdbc=jdbc;this.entities=entities;}
    public void delete(UUID diaryId) {
        entities.flush();
        // Remove dependent rows in FK order, in the caller's transaction. Never delete shared source media.
        String pages="select page_id from pages where diary_id=?";
        // Block concurrent inserts referencing pages/elements before deleting their dependants.
        jdbc.queryForList("select page_id from pages where diary_id=? order by page_id for update",diaryId);
        jdbc.queryForList("select element_id from canvas_elements where page_id in ("+pages+") order by element_id for update",diaryId);
        jdbc.update("update diary_members set last_opened_page_id=null where last_opened_page_id in ("+pages+")",diaryId);
        jdbc.update("delete from notifications where diary_id=? or page_id in ("+pages+")",diaryId,diaryId);
        jdbc.update("delete from canvas_history_operations where page_id in ("+pages+")",diaryId);
        jdbc.update("delete from element_strokes where element_id in (select element_id from canvas_elements where page_id in ("+pages+"))",diaryId);
        jdbc.update("delete from canvas_elements where page_id in ("+pages+")",diaryId);
        for(String table:new String[]{"diary_media_library","diary_handwriting_fonts","diary_invites","diary_members","pages"})
            jdbc.update("delete from "+table+" where diary_id=?",diaryId);
        jdbc.update("delete from diaries where diary_id=?",diaryId);
        entities.clear();
    }
    public boolean activePage(UUID diaryId,UUID pageId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from pages where diary_id=? and page_id=? and deleted_at is null)",Boolean.class,diaryId,pageId));
    }
}
