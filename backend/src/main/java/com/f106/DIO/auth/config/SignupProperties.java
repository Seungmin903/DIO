package com.f106.DIO.auth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record SignupProperties(
    @Value("${dio.signup.verification-secret:}") String verificationSecret,
    @Value("${dio.signup.mail-from:}") String mailFrom
) {
    @Override public String toString() { return "SignupProperties[verificationSecret=REDACTED]"; }
}
