package com.f106.DIO.diary.trash;

import com.f106.DIO.diary.read.DiaryReadException;
import java.sql.Timestamp;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
public class AccountDiaryPurgeService {
    private final AccountDiaryTrashService access;
    private final DiaryChildCleanup cleanup;
    private final NamedParameterJdbcTemplate jdbc;
    private final DiaryTime time;
    public AccountDiaryPurgeService(AccountDiaryTrashService access,DiaryChildCleanup cleanup,NamedParameterJdbcTemplate jdbc,DiaryTime time){this.access=access;this.cleanup=cleanup;this.jdbc=jdbc;this.time=time;}
    @Transactional(isolation=Isolation.READ_COMMITTED)
    public void purge(long user,String id) {
        AccountDiaryTrashService.Locked row;
        try{row=access.owner(user,id);}
        catch(DiaryReadException error){
            // The locking read may have waited for a concurrent purge to commit. Read its tombstone afterward.
            if(error.status==404 && !jdbc.queryForList("select diary_id from diary_purge_receipts where diary_id=:id and owner_user_id=:user",
                new MapSqlParameterSource("id",UUID.fromString(id)).addValue("user",user)).isEmpty())return;
            throw error;
        }
        if(row.deleted()==null)throw new DiaryReadException(409,"DIARY_NOT_TRASHED","휴지통으로 먼저 이동한 뒤 영구 삭제해 주세요.");
        UUID uuid=UUID.fromString(id);cleanup.remove(uuid);
        jdbc.update("insert into diary_purge_receipts(diary_id,owner_user_id,completed_at) values(:id,:user,:now)",row.params().addValue("now",Timestamp.from(time.now())));
        if(jdbc.update("delete from diaries where diary_id=:id and owner_user_id=:user and deleted_at is not null",row.params())!=1)
            throw new DiaryReadException(409,"VERSION_CONFLICT","다이어리 상태가 변경됐어요. 목록을 새로고침해 주세요.");
    }
}
