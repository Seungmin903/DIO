package com.f106.DIO.push.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Scoped, bounded queue maintenance. Receipt history is never deleted here. */
@Service
public class PushQueueRetention {
    public static final int RETENTION_DAYS = 30;
    private final JdbcTemplate jdbc;
    private final PushInstallationService installations;
    public PushQueueRetention(JdbcTemplate jdbc, PushInstallationService installations) {
        this.jdbc=jdbc; this.installations=installations;
    }
    public record Result(int inspected,int cancelled,int deleted,int locked) {}

    @Transactional
    public Result runBatch(Instant now, int limit) {
        if(now==null || limit<1 || limit>100) throw new IllegalArgumentException("invalid queue retention batch");
        String environment=installations.environment(), app=installations.appId();
        if(environment==null || !environment.matches("[A-Za-z0-9_.-]{1,32}") || app==null || !app.matches("[A-Za-z0-9_.-]{1,160}")) throw new IllegalStateException("push scope not configured");
        Timestamp current=Timestamp.from(now), cutoff=Timestamp.from(now.minus(RETENTION_DAYS,ChronoUnit.DAYS));
        // Only invitation queues with their durable deduplication receipt are eligible.
        var parents=jdbc.query("""
            select o.outbox_id from push_outbox o
            where o.environment=? and o.app_id=? and o.event_type='DIARY_INVITE'
              and exists (select 1 from invitation_notification_receipts r where r.invite_id=case when o.reference_id ~ '^[0-9]{1,19}$' then
                case when o.reference_id::numeric <= 9223372036854775807 then o.reference_id::bigint end end
                and r.invite_id::text=o.reference_id and r.recipient_user_id=o.recipient_user_id and r.outcome='CREATED')
              and ((o.status='PENDING' and o.expires_at<=?)
                or (o.expires_at<=? and exists(select 1 from push_deliveries d where d.outbox_id=o.outbox_id and d.status='PENDING'))
                or (o.expires_at<=? and o.terminal_at<=? and not exists(select 1 from push_deliveries d where d.outbox_id=o.outbox_id and (d.terminal_at is null or d.terminal_at>?))))
            order by o.expires_at,o.outbox_id limit ? for update of o skip locked
            """,(rs,n)->rs.getObject(1,UUID.class),environment,app,current,current,current,cutoff,cutoff,limit);
        int cancelled=0,deleted=0,locked=0;
        for(UUID id:parents) {
            long expected=jdbc.queryForObject("select count(*) from push_deliveries where outbox_id=?",Long.class,id);
            List<UUID> acquired=jdbc.query("select installation_id from push_deliveries where outbox_id=? order by installation_id,binding_version for update skip locked",(rs,n)->rs.getObject(1,UUID.class),id);
            if(acquired.size()!=expected){locked++;continue;}
            cancelled+=jdbc.update("update push_deliveries d set status='CANCELLED',result_code='EXPIRED',next_attempt_at=null,lease_id=null,lease_until=null from push_outbox o where o.outbox_id=d.outbox_id and o.outbox_id=? and o.expires_at<=? and d.status='PENDING'",id,current);
            cancelled+=jdbc.update("update push_outbox set status='CANCELLED' where outbox_id=? and status='PENDING' and expires_at<=?",id,current);
            deleted+=jdbc.update("""
                delete from push_outbox o where o.outbox_id=? and o.status in ('COMPLETE','CANCELLED') and o.expires_at<=? and o.terminal_at<=?
                  and not exists(select 1 from push_deliveries d where d.outbox_id=o.outbox_id and (d.terminal_at is null or d.terminal_at>?))
                """,id,current,cutoff,cutoff);
        }
        return new Result(parents.size(),cancelled,deleted,locked);
    }
}
