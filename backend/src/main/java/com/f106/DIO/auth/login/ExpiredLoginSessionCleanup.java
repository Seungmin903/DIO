package com.f106.DIO.auth.login;

import java.time.Instant;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ExpiredLoginSessionCleanup {
    static final int BATCH_SIZE = 500;
    private final RefreshTokenRepository sessions;
    private final RefreshTokenHistoryRepository history;
    ExpiredLoginSessionCleanup(RefreshTokenRepository sessions, RefreshTokenHistoryRepository history) {
        this.sessions = sessions; this.history = history;
    }
    @Transactional
    public int purgeExpired() {
        Instant cutoff = Instant.now();
        int count = 0;
        for (Long id : sessions.findExpiredIds(cutoff, PageRequest.of(0, BATCH_SIZE))) {
            // 재발급과 동일하게 세션 행을 먼저 잠근다. 여러 인스턴스가 동시에 정리해도 재확인한다.
            var session = sessions.findForUpdate(id).orElse(null);
            if (session == null || session.expiresAt.isAfter(cutoff)) continue;
            history.deleteForSession(id);
            sessions.delete(session);
            count++;
        }
        return count;
    }
}
