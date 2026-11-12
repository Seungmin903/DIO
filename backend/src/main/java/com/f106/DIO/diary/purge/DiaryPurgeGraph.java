package com.f106.DIO.diary.purge;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** 수동/만료 삭제가 공유하는 DB 참조 정리. 호출자가 동일 트랜잭션에서 다이어리 행을 잠그고 상태를 검증해야 한다. */
public class DiaryPurgeGraph {
    private final JdbcTemplate jdbc;
    public DiaryPurgeGraph(JdbcTemplate jdbc) {this.jdbc=jdbc;}
    public void lockReceipts(UUID id) {
        requireTransaction();
        jdbc.queryForList("SELECT key_hash FROM diary_creation_receipts WHERE diary_id=? ORDER BY user_id,key_hash FOR UPDATE",String.class,id);
    }
    public void deleteLocked(UUID id) {
        requireTransaction();
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
        if(jdbc.update("DELETE FROM diaries WHERE diary_id=?",id)!=1)
            throw new IllegalStateException("Locked diary disappeared");
    }
    private void requireTransaction() {
        if(!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Diary purge requires a transaction");
    }
}
