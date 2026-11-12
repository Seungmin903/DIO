package com.f106.DIO.sharing;
import com.f106.DIO.sharing.domain.EmailInviteExpiry;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class EmailInviteExpiryTests {
    static final Instant CREATED=Instant.parse("2026-11-01T00:00:00Z"), LEGACY=Instant.parse("9999-12-31T23:59:59Z");
    @Test void earlierOfStoredExpiryAndSevenDaysAfterCreationWins() {
        assertThat(EmailInviteExpiry.expiresAt(CREATED,LEGACY)).isEqualTo(CREATED.plus(Duration.ofDays(7)));
        assertThat(EmailInviteExpiry.expiresAt(CREATED,CREATED.plus(Duration.ofDays(1)))).isEqualTo(CREATED.plus(Duration.ofDays(1)));
    }
    @Test void expiryBoundaryIsExclusive() {
        Instant limit=CREATED.plus(Duration.ofDays(7));
        assertThat(EmailInviteExpiry.expired(CREATED,LEGACY,limit.minusNanos(1000))).isFalse();
        assertThat(EmailInviteExpiry.expired(CREATED,LEGACY,limit)).isTrue();
        // SQL 조건(created_at > createdAfter)도 같은 경계를 쓴다.
        assertThat(CREATED.isAfter(EmailInviteExpiry.createdAfter(limit))).isFalse();
        assertThat(CREATED.isAfter(EmailInviteExpiry.createdAfter(limit.minusNanos(1000)))).isTrue();
        assertThat(EmailInviteExpiry.unexpiredSql("i")).isEqualTo("i.expires_at>:now and i.created_at>:createdAfter");
    }
}
