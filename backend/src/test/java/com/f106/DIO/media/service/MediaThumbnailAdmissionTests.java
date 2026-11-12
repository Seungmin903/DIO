package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import com.f106.DIO.media.storage.*;
import com.f106.DIO.media.support.MediaRequestException;

class MediaThumbnailAdmissionTests {
 @Test void aSameFileWaiterDoesNotHoldAdmissionAndHotCacheNeedsNoPermit() throws Exception {
  var files=mock(MediaFiles.class);var tx=mock(MediaFileTransactionService.class);var guarded=mock(GuardedMediaOperations.class);
  var admission=spy(new MediaUploadAdmission(6,0,0));
  var service=new MediaService(files,tx,mock(MediaStorageDeletionQueueService.class),guarded,admission);
  UUID id=UUID.randomUUID();String key=MediaStorageKeys.create(com.f106.DIO.media.domain.MediaType.IMAGE,"png",id);
  when(tx.storageReference(id,7L)).thenReturn(new MediaFileTransactionService.StorageReference("image/png",null,key));
  var published=new AtomicReference<byte[]>();var started=new CountDownLatch(1);var release=new CountDownLatch(1);
  when(files.read(MediaStorageKeys.thumbnail(key))).thenAnswer(call->{if(published.get()==null)throw MediaStorageException.missing();return published.get();});
  var output=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,2),"png",output);
  when(files.read(key)).thenAnswer(call->{started.countDown();if(!release.await(10,TimeUnit.SECONDS))throw new AssertionError("source wait timed out");return output.toByteArray();});
  doAnswer(call->{published.set(call.getArgument(2));return null;}).when(guarded).storeThumbnail(eq(id),eq(key),any());
  var executor=Executors.newFixedThreadPool(2);
  try{
   var first=executor.submit(()->service.thumbnail(id,7L));assertThat(started.await(3,TimeUnit.SECONDS)).isTrue();
   var second=executor.submit(()->service.thumbnail(id,7L));
   assertThatThrownBy(()->second.get(3,TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
    .hasCauseInstanceOf(MediaRequestException.class);
   verify(admission,times(1)).acquire(15*1024*1024L);
   try(var other=admission.acquire(15*1024*1024L)){assertThat(other).isNotNull();}
   release.countDown();assertThat(first.get(3,TimeUnit.SECONDS).mimeType()).isEqualTo("image/png");
   // Occupy the complete budget; a persisted derivative must still be served.
   try(var one=admission.acquire(15*1024*1024L);var two=admission.acquire(15*1024*1024L)){
    assertThat(service.thumbnail(id,7L).content()).isEqualTo(published.get());
   }
   verify(files,times(1)).read(key);
  }finally{release.countDown();executor.shutdownNow();}
 }
}
