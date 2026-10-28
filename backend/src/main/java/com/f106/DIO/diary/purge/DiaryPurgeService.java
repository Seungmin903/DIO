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
    private final DiaryPurgeGraph graph;
    private final DiaryRequestIdentity identity;
    private final DiaryDetailRepository diaries;
    private final DiaryMembershipAccess memberships;
    public DiaryPurgeService(JdbcTemplate jdbc, DiaryRequestIdentity identity,
            DiaryDetailRepository diaries, DiaryMembershipAccess memberships) {
        this.jdbc=jdbc; this.graph=new DiaryPurgeGraph(jdbc); this.identity=identity; this.diaries=diaries; this.memberships=memberships;
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
        graph.lockReceipts(id);
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

        // Preserve owner retry completion atomically with the shared graph deletion.
        jdbc.update("INSERT INTO diary_purge_receipts(diary_id,owner_user_id,completed_at) VALUES (?,?,CURRENT_TIMESTAMP)",id,user);
        graph.deleteLocked(id);
    }
    private boolean completed(long user,UUID id) {
        return !jdbc.queryForList("SELECT diary_id FROM diary_purge_receipts WHERE diary_id=? AND owner_user_id=?",UUID.class,id,user).isEmpty();
    }
}
