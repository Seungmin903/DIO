package com.f106.DIO.user.config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
@Component
public record TermsProperties(
    @Value("${dio.signup.service-terms-version:v2}") String serviceTermsVersion,
    @Value("${dio.signup.privacy-terms-version:v2}") String privacyTermsVersion,
    @Value("${dio.signup.marketing-terms-version:v1}") String marketingTermsVersion) {}
