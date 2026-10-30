package com.f106.DIO.sharing.service;
import com.f106.DIO.user.service.UserWithdrawalDiaries;
import com.f106.DIO.user.exception.UserException;
import com.f106.DIO.sharing.repository.DiaryPermanentDeletionRepository;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
@Component @Transactional(propagation=Propagation.MANDATORY)
public class UserWithdrawalDiaryAdapter implements UserWithdrawalDiaries {
    private final JdbcTemplate jdbc;
    private final DiaryPermanentDeletionRepository deletion;
    public UserWithdrawalDiaryAdapter(JdbcTemplate jdbc,DiaryPermanentDeletionRepository deletion){this.jdbc=jdbc;this.deletion=deletion;}
    public void remove(long actor,Instant now){
        var ids=jdbc.queryForList("select diary_id from diaries where owner_user_id=? or diary_id in (select diary_id from diary_members where user_id=? and left_at is null) order by diary_id",UUID.class,actor,actor);
        var owned=new ArrayList<UUID>();
        // 모든 대상의 소유권을 먼저 확인한다. 하나라도 양도가 필요하면 전체 트랜잭션을 취소한다.
        for(var id:ids){
            var rows=jdbc.queryForList("select owner_user_id from diaries where diary_id=? for update",id);
            if(rows.isEmpty())continue;
            if(Objects.equals(rows.get(0).get("owner_user_id"),actor)){
                if(jdbc.queryForObject("select count(*) from diary_members where diary_id=? and user_id<>? and left_at is null",Long.class,id,actor)>0)
                    throw UserException.conflict("OWNER_TRANSFER_REQUIRED","다른 멤버가 있는 다이어리의 소유권을 양도한 뒤 탈퇴해 주세요.");
                owned.add(id);
            }
        }
        for(var id:owned)deletion.delete(id);
        jdbc.update("update diary_members set left_at=coalesce(left_at,?),member_nickname=null,member_profile_photo_id=null,last_opened_page_id=null,is_favorite=false where user_id=?",java.sql.Timestamp.from(now),actor);
        jdbc.update("update diary_invites set revoked_at=?,invite_type=case when invite_type='EMAIL' then 'EMAIL_CANCELLED' else invite_type end where revoked_at is null and ((invite_type='LINK' and inviter_user_id=?) or ((inviter_user_id=? or invitee_user_id=?) and use_count=0))",java.sql.Timestamp.from(now),actor,actor,actor);
    }
}
