package com.f106.DIO.media.service;
import static org.assertj.core.api.Assertions.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;
import com.f106.DIO.media.support.MediaRequestException;
class MediaUploadAdmissionTests {
 private static void untilWaiting(Thread t) throws Exception { long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);while(System.nanoTime()<deadline){if(t.getState()==Thread.State.TIMED_WAITING||t.getState()==Thread.State.WAITING)return;Thread.yield();}throw new AssertionError("waiter did not block"); }
 @Test void capsWaitersAndReturns503AfterBoundedWait() throws Exception {
  var gate=new MediaUploadAdmission(5,1,200);var hold=gate.acquire(25L*1024*1024);var started=new CountDownLatch(1);var result=new CompletableFuture<MediaRequestException>();
  Thread waiter=new Thread(()->{started.countDown();try(var ignored=gate.acquire()){result.completeExceptionally(new AssertionError("unexpected permit"));}catch(MediaRequestException e){result.complete(e);}});waiter.start();assertThat(started.await(2,TimeUnit.SECONDS)).isTrue();untilWaiting(waiter);
  assertThatThrownBy(gate::acquire).isInstanceOfSatisfying(MediaRequestException.class,e->{assertThat(e.status().value()).isEqualTo(503);assertThat(e.code()).isEqualTo("MEDIA_UPLOAD_BUSY");});
  assertThat(result.get(2,TimeUnit.SECONDS).code()).isEqualTo("MEDIA_UPLOAD_BUSY");hold.close();try(var again=gate.acquire()){assertThat(again).isNotNull();}waiter.join();
 }
 @Test void interruptedWaiterIsRemovedAndInterruptFlagPreserved() throws Exception {
  var gate=new MediaUploadAdmission(5,1,5000);var hold=gate.acquire(25L*1024*1024);var result=new CompletableFuture<Boolean>();
  Thread waiter=new Thread(()->{try(var ignored=gate.acquire()){result.complete(false);}catch(MediaRequestException e){result.complete(Thread.currentThread().isInterrupted() && "MEDIA_UPLOAD_BUSY".equals(e.code()));}});waiter.start();untilWaiting(waiter);waiter.interrupt();assertThat(result.get(2,TimeUnit.SECONDS)).isTrue();waiter.join();
  hold.close();try(var again=gate.acquire()){assertThat(again).isNotNull();}
 }
 @Test void failureAndRepeatedCloseDoNotLeakOrDuplicatePermits() {
  var gate=new MediaUploadAdmission(5,0,0);assertThatThrownBy(()->{try(var permit=gate.acquire()){throw new IllegalStateException("failure");}}).isInstanceOf(IllegalStateException.class);
  var once=gate.acquire();once.close();once.close();try(var hold=gate.acquire(25L*1024*1024)){assertThatThrownBy(gate::acquire).isInstanceOf(MediaRequestException.class);}
 }
 @Test void weightsPermitsByUploadSizeToKeepTheByteBudgetBounded() {
  long mib=1024L*1024L;var gate=new MediaUploadAdmission(6,0,0);
  try(var first=gate.acquire(15*mib);var second=gate.acquire(15*mib)){assertThatThrownBy(()->gate.acquire(5*mib)).isInstanceOf(MediaRequestException.class);}
  try(var first=gate.acquire(5*mib);var second=gate.acquire(5*mib);var third=gate.acquire(5*mib)){assertThatThrownBy(()->gate.acquire(5*mib)).isInstanceOf(MediaRequestException.class);}
 }
 @Test void rejectsAConfigurationThatCannotAdmitTheLargestSupportedUpload() {
  assertThatThrownBy(()->new MediaUploadAdmission(4,0,0)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void resolvesNewAndLegacySettingsWithoutMakingSmallLegacyValuesUnavailable() {
  assertThat(MediaUploadAdmission.resolveUnits("7","3")).isEqualTo(7);
  assertThat(MediaUploadAdmission.resolveUnits(" ","1")).isEqualTo(5);
  assertThat(MediaUploadAdmission.resolveUnits("","2")).isEqualTo(5);
  assertThat(MediaUploadAdmission.resolveUnits("","")).isEqualTo(6);
  assertThatThrownBy(()->MediaUploadAdmission.resolveUnits("","0")).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->MediaUploadAdmission.resolveUnits("","-1")).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->MediaUploadAdmission.resolveUnits("abc","")).isInstanceOf(IllegalArgumentException.class);
 }
 @Test void rejectsRequestsThatCannotFitTheConfiguredByteBudgetAsTooLarge() {
  var gate=new MediaUploadAdmission(5,0,0);
  assertThatThrownBy(()->gate.acquire(26L*1024*1024)).isInstanceOfSatisfying(MediaRequestException.class,error->assertThat(error.status().value()).isEqualTo(413));
 }
}
