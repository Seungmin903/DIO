package com.f106.DIO.push.config;

import com.f106.DIO.push.service.PushQueueRetention;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.mockito.Mockito.*;

class PushQueueRetentionScheduleTests {
    @Test void scheduleUsesDatabaseTimeForRetentionBoundary() {
        var retention=mock(PushQueueRetention.class);var jdbc=mock(JdbcTemplate.class);
        Instant dbTime=Instant.parse("2026-10-31T00:00:00Z");
        when(jdbc.queryForObject("select clock_timestamp()",Timestamp.class)).thenReturn(Timestamp.from(dbTime));
        when(retention.runBatch(dbTime,100)).thenReturn(new PushQueueRetention.Result(0,0,0,0));
        new PushQueueRetentionSchedule(retention,jdbc).run();
        verify(retention).runBatch(dbTime,100);
    }
}
