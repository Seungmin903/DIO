package com.f106.DIO.sharing.service;

import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import com.f106.DIO.sharing.repository.DiaryInviteRepository;

/** Email invitations are deleted after their seven-day pending or completed retention window. */
@Component
@EnableScheduling
@ConditionalOnProperty(name="dio.sharing.invitation-retention.enabled",havingValue="true",matchIfMissing=true)
public class InvitationRetentionCleanup {
    private final DiaryInviteRepository invites;
    public InvitationRetentionCleanup(DiaryInviteRepository invites){this.invites=invites;}
    @Transactional
    @Scheduled(fixedDelayString="${dio.sharing.invitation-retention.delay-ms:3600000}",initialDelayString="${dio.sharing.invitation-retention.initial-delay-ms:900000}")
    public void clean(){invites.deleteExpiredEmails(Instant.now());}
}
