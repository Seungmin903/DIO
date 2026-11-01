package com.f106.DIO.push.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 호출자는 먼저 해당 로그인 세션 행을 잠가야 한다. */
@Repository
public class PushSessionRevocation {
    private final JdbcTemplate jdbc;
    public PushSessionRevocation(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(propagation = Propagation.MANDATORY)
    public int revokeLockedSession(UUID sessionId, long userId, Instant now) {
        // 계정 전환이 선행됐다면 현재 세션에 결합된 행만 처리한다.
        var ids = jdbc.query("select installation_id from push_installations where session_id=? and user_id=? order by installation_id for update",
            (rs, n) -> rs.getObject(1, UUID.class), sessionId, userId);
        int changed = 0;
        for (UUID id : ids) {
            jdbc.update("update push_deliveries set status='CANCELLED', lease_id=null, lease_until=null where installation_id=? and binding_version=(select binding_version from push_installations where installation_id=?) and status in ('PENDING','LEASED')", id, id);
            changed += jdbc.update("update push_installations set enabled=false, disabled_at=?, updated_at=? where installation_id=? and session_id=? and user_id=? and disabled_at is null", Timestamp.from(now), Timestamp.from(now), id, sessionId, userId);
        }
        return changed;
    }
}
