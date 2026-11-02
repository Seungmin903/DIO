package com.f106.DIO.push.config;

import com.f106.DIO.push.service.PushQueueRetention;
import java.sql.Timestamp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="dio.push.queue-retention.enabled", havingValue="true")
public class PushQueueRetentionSchedule {
    private static final Logger log=LoggerFactory.getLogger(PushQueueRetentionSchedule.class);
    private final PushQueueRetention retention;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    public PushQueueRetentionSchedule(PushQueueRetention retention,org.springframework.jdbc.core.JdbcTemplate jdbc) {this.retention=retention;this.jdbc=jdbc;}
    @Scheduled(fixedDelayString="${dio.push.queue-retention.delay-ms:60000}", initialDelayString="${dio.push.queue-retention.initial-delay-ms:300000}", scheduler="pushDeliveryScheduler")
    public void run() {
        var result=retention.runBatch(jdbc.queryForObject("select clock_timestamp()",Timestamp.class).toInstant(),100);
        if(result.inspected()>0)log.info("push retention inspected={} cancelled={} deleted={} locked={}",result.inspected(),result.cancelled(),result.deleted(),result.locked());
    }
}
