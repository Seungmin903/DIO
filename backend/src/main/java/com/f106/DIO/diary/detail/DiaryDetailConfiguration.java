package com.f106.DIO.diary.detail;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class DiaryDetailConfiguration {

	@Bean
	@ConditionalOnMissingBean(DiaryDetailIdentity.class)
	DiaryDetailIdentity authenticatedDiaryDetailIdentity(com.f106.DIO.diary.auth.DiaryRequestIdentity identity) {
		return () -> identity.requireUserId(DiaryDetailException::unauthorized);
	}
}
