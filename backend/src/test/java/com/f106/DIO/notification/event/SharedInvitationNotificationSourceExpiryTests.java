package com.f106.DIO.notification.event;

import java.sql.Timestamp;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;
import com.f106.DIO.notification.event.InvitationNotificationSource.Eligibility;
import com.f106.DIO.sharing.service.SharingAccessService;

/** 이메일 초대 알림 원본의 7일 만료 판정. 잠금은 공유 서비스 몫이라 대역으로 둔다. */
class SharedInvitationNotificationSourceExpiryTests {
    static final Instant LEGACY_EXPIRY=Instant.parse("9999-12-31T23:59:59Z");
    final UUID diary=UUID.randomUUID();
    JdbcTemplate jdbc;
    SharedInvitationNotificationSource source;

    @BeforeEach void setup() {
        jdbc=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa",""));
        jdbc.execute("create table users(user_id bigint primary key,status varchar(20),deleted_at timestamp with time zone)");
        jdbc.execute("create table diary_members(diary_id uuid,user_id bigint,left_at timestamp with time zone)");
        jdbc.execute("create table diary_invites(invite_id bigint primary key,diary_id uuid,inviter_user_id bigint,invitee_user_id bigint,invite_type varchar(30),revoked_at timestamp with time zone,use_count integer,expires_at timestamp with time zone,created_at timestamp with time zone)");
        jdbc.update("insert into users values(7,'ACTIVE',null)");
        source=new SharedInvitationNotificationSource(jdbc,mock(SharingAccessService.class));
    }
    void invite(Instant createdAt,Instant expiresAt) {
        jdbc.update("delete from diary_invites");
        jdbc.update("insert into diary_invites values(10,?,3,7,'EMAIL',null,0,?,?)",diary,Timestamp.from(expiresAt),Timestamp.from(createdAt));
    }

    @Test void legacyFarFutureExpiryIsCappedAtSevenDaysAfterCreation() {
        // DB가 나노초를 반올림하지 않도록 마이크로초로 맞춰 넣는다.
        Instant created=Instant.now().minus(Duration.ofDays(6)).truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        invite(created,LEGACY_EXPIRY);
        var snapshot=source.findForNotification(10,7).orElseThrow();
        assertThat(snapshot.eligibility()).isEqualTo(Eligibility.NOTIFIABLE);
        assertThat(snapshot.expiresAt()).isEqualTo(created.plus(Duration.ofDays(7)));
    }
    @Test void pendingEmailPastSevenDaysIsExpired() {
        invite(Instant.now().minus(Duration.ofDays(8)),LEGACY_EXPIRY);
        assertThat(source.findForNotification(10,7).orElseThrow().eligibility()).isEqualTo(Eligibility.EXPIRED);
        invite(Instant.now().minusSeconds(60),Instant.now().minusSeconds(1));
        assertThat(source.findForNotification(10,7).orElseThrow().eligibility()).isEqualTo(Eligibility.EXPIRED);
    }
    @Test void revokedEmailStaysRevokedRegardlessOfExpiry() {
        invite(Instant.now().minus(Duration.ofDays(8)),LEGACY_EXPIRY);
        jdbc.update("update diary_invites set revoked_at=current_timestamp");
        assertThat(source.findForNotification(10,7).orElseThrow().eligibility()).isEqualTo(Eligibility.REVOKED);
    }
}
