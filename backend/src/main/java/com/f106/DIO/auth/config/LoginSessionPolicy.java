package com.f106.DIO.auth.config;

import java.time.Duration;

/** Shared limits for session renewal, validation and refresh recovery. */
public final class LoginSessionPolicy {
    public static final Duration ABSOLUTE_LIFETIME = Duration.ofDays(90);
    public static final Duration ROTATION_GRACE = Duration.ofSeconds(30);
    private LoginSessionPolicy() {}
}
