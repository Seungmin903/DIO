package com.f106.DIO.moderation;
import static org.assertj.core.api.Assertions.assertThat;import static org.mockito.ArgumentMatchers.*;import static org.mockito.Mockito.*;
import com.f106.DIO.media.storage.MediaFiles;import com.f106.DIO.moderation.domain.*;import com.f106.DIO.moderation.repository.*;import com.f106.DIO.moderation.service.ReportRetentionCleanup;import java.time.*;import java.util.*;import org.junit.jupiter.api.Test;import org.springframework.test.util.ReflectionTestUtils;import org.springframework.transaction.*;import org.springframework.transaction.support.SimpleTransactionStatus;import tools.jackson.databind.json.JsonMapper;
class ReportRetentionCleanupTests {
 @Test void queuesEvidenceAndDeletesExpiredReports(){var reports=mock(UserReportRepository.class);var tasks=mock(ReportEvidenceDeletionTaskRepository.class);var cleanup=new ReportRetentionCleanup(reports,tasks,mock(MediaFiles.class),JsonMapper.builder().build(),noOpTransactions(),Duration.ofDays(30),100);var report=new UserReport(1,2,UUID.randomUUID(),UUID.randomUUID(),"a".repeat(64),ReportReason.OTHER,"reason","[{\"storageKey\":\"media/image/2026/11/123e4567-e89b-12d3-a456-426614174000.jpg\"}]");ReflectionTestUtils.setField(report,"reportId",7L);when(reports.retentionExpired(any(),any())).thenReturn(List.of(report),List.of());assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);verify(tasks).save(argThat(task->task.getReportId()==7&&task.getStorageKey().endsWith(".jpg")));verify(reports).delete(report);}
 @Test void removesQueueRowAfterEvidenceDeletion(){var reports=mock(UserReportRepository.class);var tasks=mock(ReportEvidenceDeletionTaskRepository.class);var files=mock(MediaFiles.class);var cleanup=new ReportRetentionCleanup(reports,tasks,files,JsonMapper.builder().build(),noOpTransactions(),Duration.ofDays(30),100);var task=new ReportEvidenceDeletionTask(9,"media/image/2026/11/123e4567-e89b-12d3-a456-426614174000.jpg");when(tasks.findDueUnlocked(any(),anyInt())).thenReturn(List.of(task));assertThat(cleanup.retryEvidenceDeletes()).isEqualTo(1);verify(files).delete(task.getStorageKey());verify(tasks).delete(task);}
 private UserReport report(String evidence){var r=new UserReport(1,2,UUID.randomUUID(),UUID.randomUUID(),"a".repeat(64),ReportReason.OTHER,"reason",evidence);ReflectionTestUtils.setField(r,"reportId",10L);ReflectionTestUtils.setField(r,"resolvedAt",Instant.now().minus(Duration.ofDays(31)));return r;}
 @Test void malformedEvidencePreservesReportAndQueuesNothing(){
  for(String raw:List.of("{broken","{}","null","[{}]","[{\"storageKey\":\"../escape\"}]","[{\"storageKey\":\"media/image/2026/11/123e4567-e89b-12d3-a456-426614174000.jpg\"},{}]")){
   var reports=mock(UserReportRepository.class);var tasks=mock(ReportEvidenceDeletionTaskRepository.class);var r=report(raw);
   when(reports.retentionExpired(any(),any())).thenReturn(List.of(r));
   var cleanup=new ReportRetentionCleanup(reports,tasks,mock(MediaFiles.class),JsonMapper.builder().build(),noOpTransactions(),Duration.ofDays(30),100);
   assertThat(cleanup.queueExpiredReports(Instant.now())).isZero();verify(reports,never()).delete(any());verifyNoInteractions(tasks);
  }
 }
 @Test void heldReportIsNeverDeletedEvenIfReturnedByRepository(){
  var reports=mock(UserReportRepository.class);var tasks=mock(ReportEvidenceDeletionTaskRepository.class);var r=report("[]");ReflectionTestUtils.setField(r,"retentionHold",true);
  when(reports.retentionExpired(any(),any())).thenReturn(List.of(r));
  var cleanup=new ReportRetentionCleanup(reports,tasks,mock(MediaFiles.class),JsonMapper.builder().build(),noOpTransactions(),Duration.ofDays(30),100);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isZero();verify(reports,never()).delete(any());verifyNoInteractions(tasks);
 }
 @Test void corruptFirstPageDoesNotStarveLaterValidReports(){
  var reports=mock(UserReportRepository.class);var tasks=mock(ReportEvidenceDeletionTaskRepository.class);var bad=report("{}");var good=report("[]");ReflectionTestUtils.setField(good,"reportId",11L);
  when(reports.retentionExpired(any(),any())).thenReturn(List.of(bad));when(reports.retentionExpiredAfter(any(),any(),eq(10L),any())).thenReturn(List.of(good));
  var cleanup=new ReportRetentionCleanup(reports,tasks,mock(MediaFiles.class),JsonMapper.builder().build(),noOpTransactions(),Duration.ofDays(30),1);
  assertThat(cleanup.queueExpiredReports(Instant.now())).isEqualTo(1);verify(reports,never()).delete(bad);verify(reports).delete(good);
 }
 @Test void transientDeleteFailureKeepsQueueForRetry(){
  var reports=mock(UserReportRepository.class);var tasks=mock(ReportEvidenceDeletionTaskRepository.class);var files=mock(MediaFiles.class);
  var task=new ReportEvidenceDeletionTask(9,"media/image/2026/11/123e4567-e89b-12d3-a456-426614174000.jpg");when(tasks.findDueUnlocked(any(),anyInt())).thenReturn(List.of(task));doThrow(new IllegalStateException("temporary")).when(files).delete(any());
  var cleanup=new ReportRetentionCleanup(reports,tasks,files,JsonMapper.builder().build(),noOpTransactions(),Duration.ofDays(30),100);
  assertThat(cleanup.retryEvidenceDeletes()).isZero();assertThat(task.getAttemptCount()).isEqualTo(1);verify(tasks,never()).delete(any());
 }
 private PlatformTransactionManager noOpTransactions(){return new PlatformTransactionManager(){@Override public TransactionStatus getTransaction(TransactionDefinition definition){return new SimpleTransactionStatus();}@Override public void commit(TransactionStatus status){}@Override public void rollback(TransactionStatus status){}};}
}
