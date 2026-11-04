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
 private static final long UNIT_BYTES=5L*1024*1024;
 private final Semaphore active, waiters;
 private final long waitMillis;
 /** Byte-weighted admission keeps up to three 5MiB uploads or two 15MiB GIFs in flight (30MiB maximum). */
 public MediaUploadAdmission(@Value("${dio.media.upload.max-in-flight-units:6}") int maxInFlightUnits,
	 @Value("${dio.media.upload.max-waiters:8}") int maxWaiters,
   @Value("${dio.media.upload.wait-millis:250}") long waitMillis) {
  if(maxInFlightUnits<1 || maxWaiters<0 || waitMillis<0 || waitMillis>60000)throw new IllegalArgumentException("Invalid upload admission limits");
  this.active=new Semaphore(maxInFlightUnits,true); this.waiters=new Semaphore(maxWaiters,true); this.waitMillis=waitMillis;
 }
 public Permit acquire() { return acquire(0); }
 public Permit acquire(long bytes) {
  int permits=permitsFor(bytes);
  boolean queued=false;
  try {
   if(active.tryAcquire(permits,0,TimeUnit.MILLISECONDS)) { return new Permit(active,permits); }
   if(!waiters.tryAcquire()) throw MediaRequestException.uploadBusy();
   queued=true;
   if(!active.tryAcquire(permits,waitMillis,TimeUnit.MILLISECONDS)) throw MediaRequestException.uploadBusy();
   return new Permit(active,permits);
  } catch(InterruptedException error) {
   Thread.currentThread().interrupt(); throw MediaRequestException.uploadBusy();
  } finally {
   if(queued)waiters.release();
  }
 }
 private static int permitsFor(long bytes) {
  if(bytes<=0)return 2;
  long units=(bytes+UNIT_BYTES-1)/UNIT_BYTES;
  return (int)Math.min(Integer.MAX_VALUE,Math.max(2,units));
 }
 public static final class Permit implements AutoCloseable {
  private final Semaphore semaphore; private final int permits; private final AtomicBoolean released=new AtomicBoolean();
  private Permit(Semaphore semaphore,int permits){this.semaphore=semaphore;this.permits=permits;}
  @Override public void close(){if(released.compareAndSet(false,true))semaphore.release(permits);}
 }
}
