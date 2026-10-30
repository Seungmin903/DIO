package com.f106.DIO.push.service;

import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import static org.assertj.core.api.Assertions.*;

class PushKeyDeploymentReporterTests {
    @Test void reportsActualLoadedIdsWithoutKeyMaterial() {
        String key=Base64.getEncoder().encodeToString(new byte[32]);
        var installations=new PushInstallationService(null,null,"","development","dio");
        installations.setActiveKeyId("new");installations.setConfiguredKeys("new="+key);
        var reporter=new PushKeyDeploymentReporter(installations,"instance-a","development","dio","new=version-2");
        var logger=(Logger)LoggerFactory.getLogger(PushKeyDeploymentReporter.class);var appender=new ListAppender<ILoggingEvent>();appender.start();logger.addAppender(appender);
        try {
            reporter.report();
            assertThat(appender.list).hasSize(1);
            assertThat(appender.list.get(0).getFormattedMessage()).contains("instance-a","active=new","new=version-2").doesNotContain(key);
        } finally {logger.detachAppender(appender);appender.stop();}
    }
}
