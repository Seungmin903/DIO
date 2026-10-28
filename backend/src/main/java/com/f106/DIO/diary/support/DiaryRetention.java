package com.f106.DIO.diary.support;

import java.time.Duration;

/** Fixed shared contract for restore eligibility and server expiry cleanup. */
public final class DiaryRetention {
    public static final Duration PERIOD = Duration.ofDays(30);
    private DiaryRetention() {}
}
