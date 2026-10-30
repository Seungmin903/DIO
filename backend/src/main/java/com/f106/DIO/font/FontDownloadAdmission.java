package com.f106.DIO.font;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Limits requests before they acquire a database connection or read font bytes. */
@Component
public class FontDownloadAdmission {
    private final Semaphore active, waiters;
    private final long waitMillis;

    public FontDownloadAdmission(@Value("${dio.font.download.max-concurrent:2}") int maxConcurrent,
            @Value("${dio.font.download.max-waiters:4}") int maxWaiters,
            @Value("${dio.font.download.wait-millis:250}") long waitMillis) {
        if (maxConcurrent < 1 || maxWaiters < 0 || waitMillis < 0 || waitMillis > 60000)
            throw new IllegalArgumentException("Invalid font download admission limits");
        this.active = new Semaphore(maxConcurrent, true);
        this.waiters = new Semaphore(maxWaiters, true);
        this.waitMillis = waitMillis;
    }

    public Permit tryAcquire() {
        boolean queued = false;
        try {
            if (active.tryAcquire(0, TimeUnit.MILLISECONDS)) return new Permit(active);
            if (!waiters.tryAcquire()) return null;
            queued = true;
            return active.tryAcquire(waitMillis, TimeUnit.MILLISECONDS) ? new Permit(active) : null;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return null;
        } finally {
            if (queued) waiters.release();
        }
    }

    public static final class Permit implements AutoCloseable {
        private final Semaphore semaphore;
        private final AtomicBoolean released = new AtomicBoolean();
        private Permit(Semaphore semaphore) { this.semaphore = semaphore; }
        @Override public void close() { if (released.compareAndSet(false, true)) semaphore.release(); }
    }
}
