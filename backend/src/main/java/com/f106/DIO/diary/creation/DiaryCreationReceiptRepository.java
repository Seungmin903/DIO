package com.f106.DIO.diary.creation;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Receipts intentionally have no TTL: expiring a key would allow an old retry
 * to create a second diary. V8 scrubs response_body on permanent diary deletion
 * and keeps the key tombstone; permanent user deletion cascades to receipts.
 * See docs/다이어리 저장/회원 생성 중복 방지.md for retention and capacity limits.
 */
@Repository
public class DiaryCreationReceiptRepository {
    private final JdbcTemplate jdbc;
    private final boolean postgres;
    private final int waitMs;
    @Autowired
    public DiaryCreationReceiptRepository(JdbcTemplate jdbc,@Value("${dio.diary.idempotency.lock-timeout-ms:5000}") int waitMs) {
        if(waitMs<100 || waitMs>10000) throw new IllegalArgumentException("Invalid idempotency wait time");
        this.jdbc=jdbc; this.waitMs=waitMs;
        postgres=Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>)c -> "PostgreSQL".equals(c.getMetaData().getDatabaseProductName())));
    }
    public Claim claim(long user,String key,String request) {
        String previous=null;
        if(postgres) {
            previous=jdbc.queryForObject("select current_setting('lock_timeout')",String.class);
            jdbc.queryForObject("select set_config('lock_timeout',?,true)",String.class,waitMs+"ms");
        }
        try {
            int inserted=jdbc.update("insert into diary_creation_receipts(user_id,key_hash,request_hash) values(?,?,?) on conflict do nothing",user,key,request);
            var receipt=lock(user,key);
            if(postgres) jdbc.queryForObject("select set_config('lock_timeout',?,true)",String.class,previous);
            return new Claim(inserted==1,receipt);
        } catch(org.springframework.dao.DataAccessException busy) {
            // PostgreSQL 실패 트랜잭션에서 추가 SQL을 실행하지 않고 호출 경계에서 롤백한다.
            if(busy instanceof org.springframework.dao.CannotAcquireLockException || busy instanceof org.springframework.dao.QueryTimeoutException
                    || lockTimeout(busy)) throw DiaryIdempotencyException.pending();
            throw busy;
        }
    }
    private boolean lockTimeout(Throwable error) {
        for(Throwable cause=error;cause!=null;cause=cause.getCause()) {
            if(cause instanceof java.sql.SQLException sql && ("55P03".equals(sql.getSQLState()) || "57014".equals(sql.getSQLState()))) return true;
        }
        return false;
    }
    private Receipt lock(long user,String key) {
        return jdbc.queryForObject("select request_hash,diary_id,response_body from diary_creation_receipts where user_id=? and key_hash=? for update",
            (rs,row) -> new Receipt(rs.getString("request_hash"),rs.getObject("diary_id",UUID.class),rs.getString("response_body")),user,key);
    }
    public boolean accessible(long user,UUID diary) {
        if(diary==null) return false;
        return !jdbc.queryForList("select diary_id from diaries where diary_id=? and owner_user_id=? and deleted_at is null for update",UUID.class,diary,user).isEmpty()
            && jdbc.queryForList("select user_id from diary_members where diary_id=? and user_id=? and role='OWNER' and left_at is null"+(postgres?" for share":" for update"),Long.class,diary,user).size()==1;
    }
    public void complete(long user,String key,UUID diary,String body) {
        String parameter=postgres?"cast(? as jsonb)":"? format json";
        if(jdbc.update("update diary_creation_receipts set diary_id=?,response_body="+parameter+",completed_at=? where user_id=? and key_hash=? and response_body is null",
            diary,body,Timestamp.from(Instant.now()),user,key)!=1) throw DiaryCreationException.invalidState();
    }
    public record Receipt(String requestHash,UUID diaryId,String body) {}
    public record Claim(boolean fresh,Receipt receipt) {}
}
