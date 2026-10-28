package com.f106.DIO.diary.trash;

import com.f106.DIO.diary.read.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AccountDiaryTrashService {
    private final NamedParameterJdbcTemplate jdbc;
    private final DiaryReadService reads;
    private final DiaryTime time;
    public AccountDiaryTrashService(NamedParameterJdbcTemplate jdbc,DiaryReadService reads,DiaryTime time) { this.jdbc=jdbc;this.reads=reads;this.time=time; }
    record Locked(MapSqlParameterSource params,Instant deleted,long version) {}
    Locked owner(long user,String id) {
        UUID uuid;
        try {uuid=UUID.fromString(id);if(!uuid.toString().equalsIgnoreCase(id))throw new IllegalArgumentException();}
        catch(IllegalArgumentException e){throw new DiaryReadException(400,"INVALID_DIARY_ID","다이어리 ID를 확인해 주세요.");}
        var params=new MapSqlParameterSource("id",uuid).addValue("user",user);
        var rows=jdbc.query("select owner_user_id,deleted_at,version from diaries where diary_id=:id for update",params,
            (rs,n)->new Object[]{rs.getObject("owner_user_id",Long.class),rs.getTimestamp("deleted_at"),rs.getLong("version")});
        if(rows.isEmpty() || rows.get(0)[0]==null)throw missing();
        var member=jdbc.query("select role,left_at from diary_members where diary_id=:id and user_id=:user for update",params,
            (rs,n)->new Object[]{rs.getString("role"),rs.getTimestamp("left_at")});
        boolean isOwner=((Long)rows.get(0)[0])==user;
        boolean active=!member.isEmpty() && member.get(0)[1]==null && Set.of("OWNER","EDITOR").contains(member.get(0)[0]);
        if(isOwner && (!member.isEmpty()&&!active))throw missing();
        if(!isOwner) {
            if(!active || !"EDITOR".equals(member.get(0)[0]))throw missing();
            throw new DiaryReadException(403,"DIARY_OWNER_REQUIRED","소유자만 휴지통 이동과 복원을 할 수 있어요.");
        }
        Timestamp deleted=(Timestamp)rows.get(0)[1];return new Locked(params,deleted==null?null:deleted.toInstant(),(Long)rows.get(0)[2]);
    }
    private static DiaryReadException missing(){return new DiaryReadException(404,"DIARY_NOT_FOUND","다이어리를 찾을 수 없어요.");}
    private void transition(Locked row,Instant deleted,Instant now) {
        if(row.version==Long.MAX_VALUE)throw new DiaryReadException(409,"VERSION_EXHAUSTED","더 이상 변경할 수 없어요. 지원팀에 문의해 주세요.");
        row.params.addValue("deleted",deleted==null?null:deleted.atOffset(java.time.ZoneOffset.UTC),java.sql.Types.TIMESTAMP_WITH_TIMEZONE)
            .addValue("now",Timestamp.from(now)).addValue("version",row.version);
        int changed=jdbc.update("""
            update diaries set deleted_at=:deleted,updated_at=:now,version=version+1
            where diary_id=:id and owner_user_id=:user and version=:version
            """,row.params);
        if(changed!=1)throw new DiaryReadException(409,"VERSION_CONFLICT","다이어리가 변경됐어요. 목록을 새로고침해 주세요.");
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void trash(long user,String id) {
        var row=owner(user,id);
        if(row.deleted!=null)return; // Preserve first deletion timestamp, updated_at and version on retries.
        Instant now=time.now().truncatedTo(ChronoUnit.MICROS);transition(row,now,now);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public DiaryReadDtos.Detail restore(long user,String id) {
        var row=owner(user,id);
        if(row.deleted!=null) {
            Instant now=time.now(); // Read time after acquiring the row lock; waiting cannot extend the deadline.
            if(!now.isBefore(row.deleted.plus(30,ChronoUnit.DAYS)))throw new DiaryReadException(410,"DIARY_RESTORE_EXPIRED","30일 복원 기한이 지났어요. 더 이상 복원할 수 없어요.");
            transition(row,null,now.truncatedTo(ChronoUnit.MICROS));
        }
        return reads.detail(user,id);
    }
}
