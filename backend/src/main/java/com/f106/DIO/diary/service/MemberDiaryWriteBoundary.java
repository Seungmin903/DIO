package com.f106.DIO.diary.service;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import com.f106.DIO.diary.support.DiaryNotFoundException;

/** Member-created diaries must use the versioned metadata and retention endpoints. */
@Component
public class MemberDiaryWriteBoundary {
    private final JdbcTemplate jdbc;
    public MemberDiaryWriteBoundary(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public void requireLegacyWrite(UUID id) {
        // Expiry removes only the response; the live diary link remains until atomic purge.
        if(!jdbc.queryForList("select diary_id from diary_creation_receipts where diary_id=?",UUID.class,id).isEmpty())
            throw new DiaryNotFoundException();
    }
}
