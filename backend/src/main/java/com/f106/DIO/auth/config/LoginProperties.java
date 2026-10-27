package com.f106.DIO.auth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record LoginProperties(
    @Value("${dio.auth.jwt-secret:}") String secret,
    @Value("${dio.auth.access-token-seconds:900}") long accessSeconds,
    @Value("${dio.auth.refresh-token-seconds:2592000}") long refreshSeconds
) {
    @Override public String toString() { return "LoginProperties[secret=REDACTED]"; }
}
