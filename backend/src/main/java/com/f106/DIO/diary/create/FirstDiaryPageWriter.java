package com.f106.DIO.diary.create;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Initial blank page only; joins the caller's transaction, never starts an independent commit. */
@Component
public class FirstDiaryPageWriter {
    private final JdbcTemplate jdbc;
    public FirstDiaryPageWriter(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public UUID insert(UUID diary, AccountDiaryCreateRequest.FirstPage input, Instant now) {
        UUID page=UUID.randomUUID();
        jdbc.update("insert into pages(page_id,diary_id,sort_key,canvas_width,canvas_height,version,created_at,updated_at) values(?,?,1,?,?,1,?,?)",
            page,diary,input.width(),input.height(),Timestamp.from(now),Timestamp.from(now));
        return page;
    }
}
