package com.f106.DIO.auth.signup;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record SignupProperties(
    @Value("${dio.signup.verification-secret:}") String verificationSecret,
    @Value("${dio.signup.mail-from:}") String mailFrom,
    @Value("${dio.signup.service-terms-version:v1}") String serviceTermsVersion,
    @Value("${dio.signup.privacy-terms-version:v1}") String privacyTermsVersion,
    @Value("${dio.signup.marketing-terms-version:v1}") String marketingTermsVersion
) {}
