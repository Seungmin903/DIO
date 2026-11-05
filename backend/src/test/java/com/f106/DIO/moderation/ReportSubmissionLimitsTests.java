package com.f106.DIO.moderation;

import com.f106.DIO.moderation.exception.ModerationException;
import com.f106.DIO.moderation.repository.UserReportRepository;
import com.f106.DIO.moderation.service.ReportSubmissionLimits;
import java.time.Instant;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReportSubmissionLimitsTests {
    private final UserReportRepository reports=mock(UserReportRepository.class);
    private final ReportSubmissionLimits limits=new ReportSubmissionLimits(reports);
    private final Instant now=Instant.parse("2026-11-05T00:00:00Z");

    @Test void boundsProcessingAttemptsAndResetsHourWithoutBlockingAnotherActor(){
        for(int i=0;i<30;i++)limits.reserveAttempt(1,now);
        assertThatThrownBy(()->limits.reserveAttempt(1,now.plusMillis(100))).isInstanceOfSatisfying(ModerationException.class,e->{
            assertThat(e.code).isEqualTo("REPORT_ATTEMPT_RATE_LIMITED");assertThat(e.retryAfter).isEqualTo(3600L);
        });
        limits.reserveAttempt(2,now);
        limits.reserveAttempt(1,now.plusSeconds(3600));
    }
    @Test void boundsProcessingAcrossMultipleHoursAndResetsDay(){
        for(int i=0;i<100;i++)limits.reserveAttempt(1,now.plusSeconds((i/30)*3600L));
        assertThatThrownBy(()->limits.reserveAttempt(1,now.plusSeconds(4*3600))).isInstanceOfSatisfying(ModerationException.class,e->assertThat(e.retryAfter).isEqualTo(20*3600L));
        limits.reserveAttempt(1,now.plusSeconds(86400));
    }
    @Test void durableHourlyQuotaUsesExistingRowsAndSurvivesNewLimiter(){
        when(reports.recentByActor(eq(1L),eq(now.minusSeconds(3600)),any())).thenReturn(Collections.nCopies(10,now.minusSeconds(60)));
        assertThatThrownBy(()->new ReportSubmissionLimits(reports).checkAccepted(1,2,now)).isInstanceOfSatisfying(ModerationException.class,e->assertThat(e.retryAfter).isEqualTo(3540L));
    }
    @Test void durableDailyQuotaAndTargetQuotaAreIndependent(){
        when(reports.recentByActor(eq(1L),eq(now.minusSeconds(86400)),any())).thenReturn(Collections.nCopies(30,now.minusSeconds(7200)));
        assertThatThrownBy(()->limits.checkAccepted(1,2,now)).isInstanceOfSatisfying(ModerationException.class,e->assertThat(e.retryAfter).isEqualTo(79200L));
        reset(reports);
        when(reports.recentByTarget(eq(1L),eq(2L),any(),any())).thenReturn(Collections.nCopies(3,now.minusSeconds(10)));
        assertThatThrownBy(()->limits.checkAccepted(1,2,now)).isInstanceOfSatisfying(ModerationException.class,e->assertThat(e.retryAfter).isEqualTo(86390L));
        limits.checkAccepted(1,3,now);
    }
}
