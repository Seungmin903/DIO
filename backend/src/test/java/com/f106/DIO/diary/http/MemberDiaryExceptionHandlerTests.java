package com.f106.DIO.diary.http;

import java.sql.SQLException;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import static org.assertj.core.api.Assertions.*;

class MemberDiaryExceptionHandlerTests {
    @Test void logsOnlyExceptionTypeAndValidatedSqlState() {
        Logger logger=(Logger)LoggerFactory.getLogger(MemberDiaryExceptionHandler.class);
        var appender=new ListAppender<ILoggingEvent>(); appender.start(); logger.addAppender(appender);
        try {
            var handler=new MemberDiaryExceptionHandler();
            var sql=new SQLException("insert into private_data values ('secret token')","23505");
            var failed=handler.storage(new DataIntegrityViolationException("private request",sql));
            var unavailable=handler.storage(new DataAccessResourceFailureException("private connection"));
            handler.storage(new DataIntegrityViolationException("private request",new SQLException("secret","invalid private state")));
            assertThat(failed.getStatusCode().value()).isEqualTo(500);
            assertThat(unavailable.getStatusCode().value()).isEqualTo(503);
            assertThat(appender.list).hasSize(3);
            assertThat(appender.list.get(0).getFormattedMessage()).contains("DataIntegrityViolationException","sqlState=23505");
            assertThat(appender.list.get(1).getFormattedMessage()).contains("DataAccessResourceFailureException","sqlState=unknown");
            assertThat(appender.list.get(2).getFormattedMessage()).contains("sqlState=unknown");
            for (var event:appender.list) {
                assertThat(event.getFormattedMessage()).doesNotContain("private","secret","insert into");
                assertThat(event.getThrowableProxy()).isNull();
            }
        } finally { logger.detachAppender(appender); appender.stop(); }
    }
}
