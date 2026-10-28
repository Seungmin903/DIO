package com.f106.DIO.diary.trash;

import java.util.UUID;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;

/** All relational cleanup joins the caller transaction; never deletes user-global media or storage objects. */
@Component
public class DiaryChildCleanup {
    private final NamedParameterJdbcTemplate jdbc;
    public DiaryChildCleanup(NamedParameterJdbcTemplate jdbc){this.jdbc=jdbc;}
    @Transactional(propagation=Propagation.MANDATORY)
    public void remove(UUID id) {
        var p=new MapSqlParameterSource("id",id);
        String pages="select page_id from pages where diary_id=:id";
        // Preserve notification history, releasing only the nullable links to deleted records.
        jdbc.update("update notifications set page_id=null where page_id in ("+pages+")",p);
        jdbc.update("update notifications set diary_id=null where diary_id=:id",p);
        jdbc.update("update diary_members set last_opened_page_id=null where last_opened_page_id in ("+pages+")",p);
        jdbc.update("delete from element_strokes where element_id in (select element_id from canvas_elements where page_id in ("+pages+"))",p);
        jdbc.update("delete from canvas_history_operations where page_id in ("+pages+")",p);
        jdbc.update("delete from canvas_elements where page_id in ("+pages+")",p);
        jdbc.update("delete from diary_handwriting_fonts where diary_id=:id",p);
        jdbc.update("delete from diary_media_library where diary_id=:id",p);
        jdbc.update("delete from diary_invites where diary_id=:id",p);
        jdbc.update("delete from diary_members where diary_id=:id",p);
        jdbc.update("delete from pages where diary_id=:id",p);
    }
}
