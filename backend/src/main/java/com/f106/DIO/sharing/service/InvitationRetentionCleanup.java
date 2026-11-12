package com.f106.DIO.sharing.service;

import java.time.Instant;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import com.f106.DIO.sharing.repository.DiaryInviteRepository;

/** Email invitations are deleted after their seven-day pending or completed retention window. */
@Component
@EnableScheduling
@ConditionalOnProperty(name="dio.sharing.invitation-retention.enabled",havingValue="true",matchIfMissing=true)
public class InvitationRetentionCleanup {
    // 한 트랜잭션이 오래 잠그지 않도록 나눠 지우고, 한 번 실행에 지우는 양에도 상한을 둔다.
    static final int BATCH_SIZE=500, MAX_BATCHES=20;
    private static final Logger log=LoggerFactory.getLogger(InvitationRetentionCleanup.class);
    private final DiaryInviteRepository invites;
    private final TransactionTemplate tx;
    private final NamedParameterJdbcTemplate jdbc;
    public InvitationRetentionCleanup(DiaryInviteRepository invites,PlatformTransactionManager transactions,NamedParameterJdbcTemplate jdbc){
        this.invites=invites;this.tx=new TransactionTemplate(transactions);this.jdbc=jdbc;
    }
    @Scheduled(fixedDelayString="${dio.sharing.invitation-retention.delay-ms:3600000}",initialDelayString="${dio.sharing.invitation-retention.initial-delay-ms:900000}")
    public void clean(){clean(Instant.now());}
    public int clean(Instant now){
        int total=0;
        for(int batch=0;batch<MAX_BATCHES;batch++){
            Integer deleted=tx.execute(status->{
                var ids=invites.expiredEmailIds(now,PageRequest.of(0,BATCH_SIZE));
                if(ids.isEmpty())return 0;
                // diary_invites를 외래키로 참조하는 테이블은 없다. 알림 처리 이력만 초대 ID를 들고 있어 같이 지운다.
                // 사라진 초대를 가리키는 DIARY_INVITE 알림은 수신자의 알림으로 남고, 목록에서 invitation=null(열 수 없음)로 보인다.
                jdbc.update("delete from invitation_notification_receipts where invite_id in (:ids)",Map.of("ids",ids));
                return invites.deleteExpiredEmails(ids,now);
            });
            total+=deleted;
            if(deleted<BATCH_SIZE)break;
        }
        if(total>0)log.info("Deleted {} email invitations past retention",total);
        return total;
    }
}
