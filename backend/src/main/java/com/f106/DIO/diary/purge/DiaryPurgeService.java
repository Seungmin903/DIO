package com.f106.DIO.diary.purge;

import java.util.UUID;
import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.detail.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** DB 대상과 연결만 제거한다. 미디어 원본·외부 객체 저장소에는 삭제를 요청하지 않는다. */
@Service
public class DiaryPurgeService {
    private final JdbcTemplate jdbc;
    private final DiaryRequestIdentity identity;
    private final DiaryDetailRepository diaries;
    private final DiaryMembershipAccess memberships;
    public DiaryPurgeService(JdbcTemplate jdbc, DiaryRequestIdentity identity,
            DiaryDetailRepository diaries, DiaryMembershipAccess memberships) {
        this.jdbc=jdbc; this.identity=identity; this.diaries=diaries; this.memberships=memberships;
    }

    @Transactional
    public void purge(UUID id) {
        long user=identity.requireUserId(DiaryDetailException::unauthorized);
        if(!diaries.lockActiveUser(user)) throw DiaryDetailException.unauthorized();
        // Completion records authorize only the original owner; the active-user lock prevents account revocation.
        if(completed(user,id)) return;
        // 생성 재전송은 영수증→다이어리 순서로 잠근다. 영구 삭제도 그 순서를 지킨다.
        // 잠그기 전의 소유자 확인은 권한 부여가 아니며 아래 잠금 안에서 다시 검증한다.
        if(jdbc.queryForList("SELECT diary_id FROM diaries WHERE diary_id=?",UUID.class,id).isEmpty()) {
            if(completed(user,id)) return;
            throw DiaryDetailException.notFound();
        }
        jdbc.queryForList("SELECT key_hash FROM diary_creation_receipts WHERE diary_id=? ORDER BY user_id,key_hash FOR UPDATE",String.class,id);
        var locked=diaries.lock(id,true);
        // A concurrent purge may commit while this statement waits for its receipt/diary lock.
        // Under READ COMMITTED the following statement sees that completion, without changing its timestamp.
        if(locked.isEmpty()) {
            if(completed(user,id)) return;
            throw DiaryDetailException.notFound();
        }
        var diary=locked.get();
        var role=memberships.requireActiveRole(user,id,diary.ownerUserId());
        if(diary.ownerUserId()!=null && diary.ownerUserId()!=user && role==DiaryMembershipAccess.Role.EDITOR)
            throw new DiaryDetailException(HttpStatus.FORBIDDEN,"DIARY_OWNER_REQUIRED","소유자만 영구 삭제할 수 있어요.");
        if(diary.ownerUserId()==null || diary.ownerUserId()!=user || role!=DiaryMembershipAccess.Role.OWNER)
            throw DiaryDetailException.notFound();
        if(diary.deletedAt()==null) throw new DiaryDetailException(HttpStatus.CONFLICT,"DIARY_NOT_TRASHED","휴지통으로 이동한 다이어리만 영구 삭제할 수 있어요.");

        // 부모를 먼저 잠가 FK를 통한 새 페이지/요소/이력 삽입이 삭제와 경합하지 않게 한다.
        jdbc.queryForList("SELECT page_id FROM pages WHERE diary_id=? ORDER BY page_id FOR UPDATE",UUID.class,id);
        jdbc.queryForList("SELECT element_id FROM canvas_elements WHERE page_id IN (SELECT page_id FROM pages WHERE diary_id=?) ORDER BY element_id FOR UPDATE",UUID.class,id);
        String pages="SELECT page_id FROM pages WHERE diary_id=?";
        String elements="SELECT element_id FROM canvas_elements WHERE page_id IN ("+pages+")";

        // 다른 다이어리 멤버가 잘못 가리키는 마지막 페이지도 포인터만 해제한다.
        jdbc.update("UPDATE diary_members SET last_opened_page_id=NULL WHERE last_opened_page_id IN ("+pages+")",id);
        // 수신자 알림 자체는 보존하되 삭제된 대상과 임의 payload의 민감 내용을 남기지 않는다.
        jdbc.update("UPDATE notifications SET diary_id=NULL,page_id=NULL,payload_json=NULL WHERE diary_id=? OR page_id IN ("+pages+")",id,id);
        // 최초 생성 키는 남겨 재전송이 새 다이어리를 만들지 못하게 한다. 응답 스냅샷은 제거한다.
        jdbc.update("UPDATE diary_creation_receipts SET diary_id=NULL,response_body=NULL WHERE diary_id=?",id);
        jdbc.update("DELETE FROM canvas_history_operations WHERE page_id IN ("+pages+")",id);
        jdbc.update("DELETE FROM element_strokes WHERE element_id IN ("+elements+")",id);
        jdbc.update("DELETE FROM canvas_elements WHERE page_id IN ("+pages+")",id);
        jdbc.update("DELETE FROM diary_invites WHERE diary_id=?",id);
        jdbc.update("DELETE FROM diary_media_library WHERE diary_id=?",id);
        jdbc.update("DELETE FROM diary_handwriting_fonts WHERE diary_id=?",id);
        jdbc.update("DELETE FROM diary_members WHERE diary_id=?",id);
        jdbc.update("DELETE FROM pages WHERE diary_id=?",id);
        // Completion and deletion commit together. No diary FK: the owner-only tombstone outlives its target.
        jdbc.update("INSERT INTO diary_purge_receipts(diary_id,owner_user_id,completed_at) VALUES (?,?,CURRENT_TIMESTAMP)",id,user);
        if(jdbc.update("DELETE FROM diaries WHERE diary_id=?",id)!=1)
            throw new IllegalStateException("Locked diary disappeared");
    }
    private boolean completed(long user,UUID id) {
        return !jdbc.queryForList("SELECT diary_id FROM diary_purge_receipts WHERE diary_id=? AND owner_user_id=?",UUID.class,id,user).isEmpty();
    }
}
