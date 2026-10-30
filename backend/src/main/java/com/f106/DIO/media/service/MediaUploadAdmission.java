package com.f106.DIO.media.service;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.f106.DIO.media.support.MediaRequestException;

/** Per-process admission before upload byte materialization and DB access. */
@Component
public final class MediaUploadAdmission {
 private final Semaphore active, waiters;
 private final long waitMillis;
 public MediaUploadAdmission(@Value("${dio.media.upload.max-concurrent:3}") int maxConcurrent,
   @Value("${dio.media.upload.max-waiters:8}") int maxWaiters,
   @Value("${dio.media.upload.wait-millis:250}") long waitMillis) {
  if(maxConcurrent<1 || maxWaiters<0 || waitMillis<0 || waitMillis>60000)throw new IllegalArgumentException("Invalid upload admission limits");
  this.active=new Semaphore(maxConcurrent,true); this.waiters=new Semaphore(maxWaiters,true); this.waitMillis=waitMillis;
 }
 public Permit acquire() {
  boolean queued=false;
  try {
   if(active.tryAcquire(0,TimeUnit.MILLISECONDS)) { return new Permit(active); }
   if(!waiters.tryAcquire()) throw MediaRequestException.uploadBusy();
   queued=true;
   if(!active.tryAcquire(waitMillis,TimeUnit.MILLISECONDS)) throw MediaRequestException.uploadBusy();
   return new Permit(active);
  } catch(InterruptedException error) {
   Thread.currentThread().interrupt(); throw MediaRequestException.uploadBusy();
  } finally {
   if(queued)waiters.release();
  }
 }
 public static final class Permit implements AutoCloseable {
  private final Semaphore semaphore; private final AtomicBoolean released=new AtomicBoolean();
  private Permit(Semaphore semaphore){this.semaphore=semaphore;}
  @Override public void close(){if(released.compareAndSet(false,true))semaphore.release();}
 }
}
