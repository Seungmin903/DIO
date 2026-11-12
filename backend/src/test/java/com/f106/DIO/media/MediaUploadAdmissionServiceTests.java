package com.f106.DIO.media;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import com.f106.DIO.media.domain.MediaStorageDeletionTask;
import com.f106.DIO.media.service.*;
import com.f106.DIO.media.storage.MediaFiles;
import com.f106.DIO.media.support.MediaRequestException;
class MediaUploadAdmissionServiceTests {
 @Test void rejectedRequestDoesNotReadFileOrReserveDatabaseAndFailureReleasesPermit() {
  var gate=new MediaUploadAdmission(5,0,0);var files=mock(MediaFiles.class);var transactions=mock(MediaFileTransactionService.class);var queue=mock(MediaStorageDeletionQueueService.class);var guarded=mock(GuardedMediaOperations.class);
  var service=new MediaService(files,transactions,queue,guarded,gate, org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class));var input=mock(MultipartFile.class);
  try(var held=gate.acquire(25L*1024*1024)) {assertThatThrownBy(()->service.upload(input,null,1L)).isInstanceOfSatisfying(MediaRequestException.class,e->assertThat(e.status().value()).isEqualTo(503));verify(input).getSize();verifyNoMoreInteractions(input);verifyNoInteractions(queue,guarded);}
  when(queue.reserveUploadCleanup(any(),any())).thenAnswer(call->new MediaStorageDeletionTask(call.getArgument(0),call.getArgument(1)));
  when(guarded.upload(any(),any(),any(),any())).thenThrow(new IllegalStateException("storage failed"));
  var gif=new MockMultipartFile("file","ok.gif","image/gif","GIF89a".getBytes());assertThatThrownBy(()->service.upload(gif,null,1L)).isInstanceOf(IllegalStateException.class);
  try(var again=gate.acquire()){assertThat(again).isNotNull();}
 }

 @Test void interruptedActiveUploadReleasesAdmission() throws Exception {
  var gate=new MediaUploadAdmission(5,0,0);var files=mock(MediaFiles.class);var transactions=mock(MediaFileTransactionService.class);var queue=mock(MediaStorageDeletionQueueService.class);var guarded=mock(GuardedMediaOperations.class);
  var service=new MediaService(files,transactions,queue,guarded,gate, org.mockito.Mockito.mock(com.f106.DIO.inventory.InventoryLimits.class));when(queue.reserveUploadCleanup(any(),any())).thenAnswer(call->new MediaStorageDeletionTask(call.getArgument(0),call.getArgument(1)));
  var started=new java.util.concurrent.CountDownLatch(1);var exited=new java.util.concurrent.CountDownLatch(1);
  when(guarded.upload(any(),any(),any(),any())).thenAnswer(call->{started.countDown();try{new java.util.concurrent.CountDownLatch(1).await();}catch(InterruptedException error){Thread.currentThread().interrupt();throw new IllegalStateException(error);}finally{exited.countDown();}return null;});
  var executor=java.util.concurrent.Executors.newSingleThreadExecutor();try {
   var gif=new MockMultipartFile("file","ok.gif","image/gif","GIF89a".getBytes());var task=executor.submit(()->service.upload(gif,null,1L));assertThat(started.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();task.cancel(true);assertThat(exited.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
   long until=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(2);boolean acquired=false;
   while(System.nanoTime()<until&&!acquired){try(var permit=gate.acquire()){acquired=true;}catch(MediaRequestException busy){Thread.yield();}}
   assertThat(acquired).isTrue();
  } finally {executor.shutdownNow();}
 }
}
