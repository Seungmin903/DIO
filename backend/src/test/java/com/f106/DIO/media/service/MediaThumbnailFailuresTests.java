package com.f106.DIO.media.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import com.f106.DIO.media.storage.*;
import com.f106.DIO.media.support.*;

class MediaThumbnailFailuresTests {
 @Test void uncheckedDecoderFailureIsAlsoRemembered() {
  var files=mock(MediaFiles.class);var tx=mock(MediaFileTransactionService.class);
  var service=new MediaService(files,tx,mock(MediaStorageDeletionQueueService.class),mock(GuardedMediaOperations.class),new MediaUploadAdmission(6,8,250));
  UUID id=UUID.randomUUID();String key=MediaStorageKeys.create(com.f106.DIO.media.domain.MediaType.IMAGE,"png",id);
  when(tx.storageReference(id,7L)).thenReturn(new MediaFileTransactionService.StorageReference("image/png",null,key));
  when(files.read(MediaStorageKeys.thumbnail(key))).thenThrow(MediaStorageException.missing());when(files.read(key)).thenReturn(BrokenThumbnailDecoder.INPUT);
  try(var decoder=new BrokenThumbnailDecoder(false)){
   for(int i=0;i<2;i++)assertThatThrownBy(()->service.thumbnail(id,7L)).isInstanceOf(MediaRequestException.class);
  }
  verify(files,times(1)).read(key);
 }
 @Test void failuresExpireAndTheCacheHasABoundedEntryCount() {
  var now=new AtomicLong();var cache=new MediaThumbnailFailures(Duration.ofSeconds(2),2,now::get);
  cache.remember("one");assertThatThrownBy(()->cache.check("one")).isInstanceOf(MediaRequestException.class);
  cache.remember("two");cache.remember("three");assertThatCode(()->cache.check("one")).doesNotThrowAnyException();
  assertThatThrownBy(()->cache.check("two")).isInstanceOf(MediaRequestException.class);
  now.set(Duration.ofSeconds(2).toNanos());assertThatCode(()->cache.check("two")).doesNotThrowAnyException();
 }
 @Test void repeatedCorruptImageDoesNotReadTheOriginalAgainAndStillAuthorizesEachRequest() {
  var files=mock(MediaFiles.class);var tx=mock(MediaFileTransactionService.class);var guarded=mock(GuardedMediaOperations.class);
  var service=new MediaService(files,tx,mock(MediaStorageDeletionQueueService.class),guarded,new MediaUploadAdmission(6,8,250));
  UUID id=UUID.randomUUID();String key=MediaStorageKeys.create(com.f106.DIO.media.domain.MediaType.IMAGE,"png",id);
  when(tx.storageReference(id,7L)).thenReturn(new MediaFileTransactionService.StorageReference("image/png",null,key));
  when(files.read(MediaStorageKeys.thumbnail(key))).thenThrow(MediaStorageException.missing());
  when(files.read(key)).thenReturn(new byte[]{1,2,3});
  for(int i=0;i<3;i++)assertThatThrownBy(()->service.thumbnail(id,7L)).isInstanceOfSatisfying(MediaRequestException.class,error->assertThat(error.code()).isEqualTo("INVALID_MEDIA_FILE"));
  verify(files,times(1)).read(key);verify(tx,times(3)).storageReference(id,7L);verifyNoInteractions(guarded);
  when(tx.storageReference(id,8L)).thenThrow(new MediaFileNotFoundException());
  assertThatThrownBy(()->service.thumbnail(id,8L)).isInstanceOf(MediaFileNotFoundException.class);
 }
 @Test void storageOutagesAndAdmissionFailuresAreNotRememberedAsCorruptImages() throws Exception {
  var files=mock(MediaFiles.class);var tx=mock(MediaFileTransactionService.class);
  var admission=new MediaUploadAdmission(6,0,0);
  var service=new MediaService(files,tx,mock(MediaStorageDeletionQueueService.class),mock(GuardedMediaOperations.class),admission);
  UUID id=UUID.randomUUID();String key=MediaStorageKeys.create(com.f106.DIO.media.domain.MediaType.IMAGE,"png",id);
  when(tx.storageReference(id,7L)).thenReturn(new MediaFileTransactionService.StorageReference("image/png",null,key));
  when(files.read(MediaStorageKeys.thumbnail(key))).thenThrow(MediaStorageException.missing());
  try(var permit=admission.acquire(25*1024*1024L)){
   assertThatThrownBy(()->service.thumbnail(id,7L)).isInstanceOfSatisfying(MediaRequestException.class,error->assertThat(error.code()).isEqualTo("MEDIA_UPLOAD_BUSY"));
  }
  var output=new java.io.ByteArrayOutputStream();javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_ARGB),"png",output);
  when(files.read(key)).thenThrow(MediaStorageException.unavailable()).thenReturn(output.toByteArray());
  assertThatThrownBy(()->service.thumbnail(id,7L)).isInstanceOf(MediaStorageException.class);
  assertThat(service.thumbnail(id,7L).mimeType()).isEqualTo("image/png");verify(files,times(2)).read(key);
 }
}
