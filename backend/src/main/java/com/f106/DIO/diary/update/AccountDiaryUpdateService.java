package com.f106.DIO.diary.update;

import com.f106.DIO.diary.read.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AccountDiaryUpdateService {
    private final NamedParameterJdbcTemplate jdbc;
    private final DiaryReadService reads;
    public AccountDiaryUpdateService(NamedParameterJdbcTemplate jdbc, DiaryReadService reads) { this.jdbc=jdbc; this.reads=reads; }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public DiaryReadDtos.Detail update(long user,String id,AccountDiaryUpdateRequest request) {
        UUID uuid;
        try { uuid=UUID.fromString(id); if (!uuid.toString().equalsIgnoreCase(id)) throw new IllegalArgumentException(); }
        catch (IllegalArgumentException e) { throw new DiaryReadException(400,"INVALID_DIARY_ID","다이어리 ID를 확인해 주세요."); }
        var params=new MapSqlParameterSource("id",uuid).addValue("user",user);
        var rows=jdbc.queryForList("select diary_id from diaries where diary_id=:id and deleted_at is null for update",params);
        if (rows.isEmpty()) throw new DiaryReadException(404,"DIARY_NOT_FOUND","다이어리를 찾을 수 없어요.");
        // Lock in diary -> membership order. Permission and version are checked inside the same transaction.
        jdbc.queryForList("select user_id from diary_members where diary_id=:id and user_id=:user for update",params);
        var current=reads.detail(user,id).diary();
        if (!current.permissions().canEditMetadata()) throw new DiaryReadException(403,"DIARY_OWNER_REQUIRED","소유자만 다이어리 정보를 수정할 수 있어요.");
        if (!current.version().equals(request.getExpectedVersion())) throw new DiaryReadException(409,"VERSION_CONFLICT","다이어리가 변경됐어요. 최신 정보를 확인해 주세요.");
        if (current.version().equals(Long.toString(Long.MAX_VALUE))) throw new DiaryReadException(409,"VERSION_EXHAUSTED","더 이상 수정할 수 없어요. 지원팀에 문의해 주세요.");
        params.addValue("version",Long.parseLong(current.version())).addValue("title",request.getDiaryTitle()==null?current.diaryTitle():request.getDiaryTitle())
            .addValue("color",request.getCoverColor()==null?current.coverColor():request.getCoverColor())
            .addValue("style",request.getCoverStyle()==null?current.coverStyle():request.getCoverStyle()).addValue("now",Timestamp.from(Instant.now()));
        int changed=jdbc.update("""
            update diaries set title=:title,cover_color=:color,cover_style=:style,version=version+1,updated_at=:now
            where diary_id=:id and version=:version and owner_user_id=:user and deleted_at is null
            """,params);
        if (changed!=1) throw new DiaryReadException(409,"VERSION_CONFLICT","다이어리가 변경됐어요. 최신 정보를 확인해 주세요.");
        return reads.detail(user,id);
    }
}
