package com.f106.DIO.collaboration.service;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.collaboration.exception.CollaborationException;
import org.springframework.http.HttpStatus;
@Service
public class CollaborationAccess {
    private final JdbcTemplate jdbc;
    public CollaborationAccess(JdbcTemplate jdbc){this.jdbc=jdbc;}
    // Acquire the same aggregate lock as sharing mutations before reading current membership.
    public UUID lockPage(UUID page,long actor){
        if(!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Canvas mutation requires a transaction");
        var ids=jdbc.queryForList("select diary_id from pages where page_id=? and deleted_at is null",UUID.class,page);
        if(ids.isEmpty())throw missing();UUID diary=ids.get(0);
        if(jdbc.queryForList("select diary_id from diaries where diary_id=? and deleted_at is null for update",UUID.class,diary).isEmpty())throw missing();
        requireDiary(diary,actor);
        if(jdbc.queryForList("select page_id from pages where page_id=? and diary_id=? and deleted_at is null for update",UUID.class,page,diary).isEmpty())throw missing();
        return diary;
    }
    @Transactional(readOnly=true) public UUID readPage(UUID page,long actor){
        var ids=jdbc.queryForList("select diary_id from pages where page_id=? and deleted_at is null",UUID.class,page);
        if(ids.isEmpty())throw missing();requireDiary(ids.get(0),actor);return ids.get(0);
    }
    @Transactional(readOnly=true) public void requireDiary(UUID diary,long actor){
        boolean allowed=Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from diaries d join users u on u.user_id=? and u.status='ACTIVE' and u.deleted_at is null where d.diary_id=? and d.deleted_at is null and (d.owner_user_id=u.user_id or exists(select 1 from diary_members m where m.diary_id=d.diary_id and m.user_id=u.user_id and m.left_at is null and m.role in ('OWNER','EDITOR'))))",Boolean.class,actor,diary));
        if(!allowed)throw new CollaborationException(HttpStatus.FORBIDDEN,"COLLABORATION_ACCESS_DENIED","다이어리 편집 권한이 없어요.");
    }
    private CollaborationException missing(){return new CollaborationException(HttpStatus.NOT_FOUND,"PAGE_NOT_FOUND","페이지를 찾을 수 없어요.");}
}
