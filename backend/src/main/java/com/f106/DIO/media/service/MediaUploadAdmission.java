package com.f106.DIO.media.service;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.f106.DIO.media.support.MediaRequestException;

/** Per-process admission before upload byte materialization and DB access. */
@Component
public final class MediaUploadAdmission {
 private static final long UNIT_BYTES=5L*1024*1024;
 private static final int MIN_IN_FLIGHT_UNITS=5, DEFAULT_IN_FLIGHT_UNITS=6;
 private static final Logger log=LoggerFactory.getLogger(MediaUploadAdmission.class);
 private final Semaphore active, waiters;
 private final int maxInFlightUnits;
 private final long waitMillis;
 /** Byte-weighted admission budgets source payloads at three 5MiB uploads or two 15MiB GIFs; temporary read buffers can use more heap. */
 @Autowired
 public MediaUploadAdmission(@Value("${dio.media.upload.max-in-flight-units:}") String configuredUnits,
	 @Value("${dio.media.upload.max-concurrent:}") String legacyMaxConcurrent,
	 @Value("${dio.media.upload.max-waiters:8}") int maxWaiters,
   @Value("${dio.media.upload.wait-millis:250}") long waitMillis) {
  this(resolveUnits(configuredUnits,legacyMaxConcurrent),maxWaiters,waitMillis);
 }
 public MediaUploadAdmission(int maxInFlightUnits,int maxWaiters,long waitMillis) {
  if(maxInFlightUnits<MIN_IN_FLIGHT_UNITS || maxWaiters<0 || waitMillis<0 || waitMillis>60000)throw new IllegalArgumentException("Invalid upload admission limits");
  this.maxInFlightUnits=maxInFlightUnits;this.active=new Semaphore(maxInFlightUnits,true); this.waiters=new Semaphore(maxWaiters,true); this.waitMillis=waitMillis;
 }
 static int resolveUnits(String configuredUnits,String legacyMaxConcurrent) {
  if(configuredUnits!=null&&!configuredUnits.isBlank())return parse(configuredUnits,"max-in-flight-units");
  if(legacyMaxConcurrent!=null&&!legacyMaxConcurrent.isBlank()) {
   int legacy=parse(legacyMaxConcurrent,"max-concurrent");long converted=(long)legacy*2;
   if(legacy<1)throw new IllegalArgumentException("Invalid media upload max-concurrent");
   if(converted<MIN_IN_FLIGHT_UNITS){log.warn("Deprecated dio.media.upload.max-concurrent={} is raised to {} units so 25MiB uploads remain available",legacy,MIN_IN_FLIGHT_UNITS);return MIN_IN_FLIGHT_UNITS;}
   return converted>Integer.MAX_VALUE?Integer.MAX_VALUE:(int)converted;
  }
  return DEFAULT_IN_FLIGHT_UNITS;
 }
 private static int parse(String value,String key) {
  try{return Integer.parseInt(value.strip());}catch(NumberFormatException error){throw new IllegalArgumentException("Invalid media upload "+key,error);}
 }
 public Permit acquire() { return acquire(0); }
 public Permit acquire(long bytes) {
  int permits=permitsFor(bytes);
  if(permits>maxInFlightUnits)throw MediaRequestException.tooLarge();
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
