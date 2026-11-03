package com.f106.DIO.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.sql.Timestamp;
import java.time.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import com.f106.DIO.notification.repository.NotificationRepository;

class NotificationRetentionCleanupTests {
    static final Instant NOW=Instant.parse("2026-11-03T00:00:00Z");

    @SuppressWarnings("unchecked")
    NotificationRetentionCleanup cleanup(NotificationRepository repository) {
        ObjectProvider<Clock> clocks=mock(ObjectProvider.class);
        when(clocks.getIfAvailable(any())).thenReturn(Clock.fixed(NOW,ZoneOffset.UTC));
        return new NotificationRetentionCleanup(repository,clocks);
    }

    @Test void repeatsFullBatchesUntilBacklogIsDrained() {
        var repository=mock(NotificationRepository.class);
        Instant cutoff=NOW.minus(Duration.ofDays(7));
        when(repository.purgeDeletedBefore(eq(cutoff),eq(NotificationRetentionCleanup.BATCH_SIZE))).thenReturn(500,500,7);
        assertThat(cleanup(repository).purgeExpired()).isEqualTo(1007);
        verify(repository,times(3)).purgeDeletedBefore(cutoff,NotificationRetentionCleanup.BATCH_SIZE);
    }

    @Test void stopsAfterMaximumBatchesPerRun() {
        var repository=mock(NotificationRepository.class);
        when(repository.purgeDeletedBefore(any(),anyInt())).thenReturn(NotificationRetentionCleanup.BATCH_SIZE);
        cleanup(repository).purgeExpired();
        verify(repository,times(NotificationRetentionCleanup.MAX_BATCHES)).purgeDeletedBefore(any(),anyInt());
    }

    @Test void deletesOnlyNotificationsHiddenAtLeastSevenDays() throws Exception {
        var source=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa","");
        try(var connection=source.getConnection()){ScriptUtils.executeSqlScript(connection,new ClassPathResource("notification-core-h2.sql"));}
        var jdbc=new JdbcTemplate(source);
        jdbc.update("insert into users(user_id,nickname) values(1,'member')");
        Instant cutoff=NOW.minus(Duration.ofDays(7));
        String insert="insert into notifications(notification_id,user_id,notification_type,deleted_at,created_at) values(?,1,'NOTICE',?,?)";
        jdbc.update(insert,1,Timestamp.from(cutoff.minusSeconds(1)),Timestamp.from(NOW.minus(Duration.ofDays(30))));
        jdbc.update(insert,2,Timestamp.from(cutoff),Timestamp.from(NOW.minus(Duration.ofDays(30))));
        jdbc.update(insert,3,Timestamp.from(cutoff.plusSeconds(1)),Timestamp.from(NOW.minus(Duration.ofDays(30))));
        jdbc.update(insert,4,null,Timestamp.from(NOW.minus(Duration.ofDays(30))));
        assertThat(cleanup(new NotificationRepository(jdbc)).purgeExpired()).isEqualTo(2);
        assertThat(jdbc.queryForList("select notification_id from notifications order by notification_id",Long.class)).containsExactly(3L,4L);
    }
}
