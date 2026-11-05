package com.f106.DIO.moderation;
import com.f106.DIO.moderation.config.ReportMailSchedule;import com.f106.DIO.moderation.repository.UserReportRepository;import com.f106.DIO.moderation.service.ReportMailDelivery;
import org.junit.jupiter.api.Test;import java.util.*;import java.util.concurrent.*;import static org.mockito.Mockito.*;import static org.assertj.core.api.Assertions.*;
class ReportMailScheduleTests {
 @Test void smtpRunsOffSharedSchedulerAndTicksDoNotAccumulate(){
  var reports=mock(UserReportRepository.class);var delivery=mock(ReportMailDelivery.class);var queued=new ArrayList<Runnable>();
  when(reports.due(any(),any())).thenReturn(List.of(1L));var schedule=new ReportMailSchedule(reports,delivery,queued::add);
  schedule.dispatch();schedule.dispatch();assertThat(queued).hasSize(1);verifyNoInteractions(delivery);queued.remove(0).run();verify(delivery).deliver(1L);
  schedule.dispatch();assertThat(queued).hasSize(1);
 }
 @Test void rejectedWorkerCanBeRetriedOnNextTick(){
  var executor=mock(Executor.class);var schedule=new ReportMailSchedule(mock(UserReportRepository.class),mock(ReportMailDelivery.class),executor);
  doThrow(new RejectedExecutionException()).doNothing().when(executor).execute(any());schedule.dispatch();schedule.dispatch();verify(executor,times(2)).execute(any());
 }
}
