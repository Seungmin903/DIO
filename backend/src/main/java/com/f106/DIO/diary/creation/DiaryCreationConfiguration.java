package com.f106.DIO.diary.creation;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.autoconfigure.AutoConfiguration;

@AutoConfiguration
public class DiaryCreationConfiguration {
	@Bean @ConditionalOnMissingBean(DiaryCreationIdentity.class)
	DiaryCreationIdentity authenticatedDiaryCreationIdentity(com.f106.DIO.diary.auth.DiaryRequestIdentity identity) {
		return () -> identity.requireUserId(DiaryCreationException::unauthorized);
	}
	@Bean @ConditionalOnMissingBean(DiaryInitialPages.class)
	DiaryInitialPages jdbcInitialPages(org.springframework.jdbc.core.JdbcTemplate jdbc) {
		return new JdbcDiaryInitialPages(jdbc);
	}
	@Bean @ConditionalOnMissingBean(DiaryOwnerMembershipWriter.class)
	DiaryOwnerMembershipWriter jdbcInitialOwnerMembership(MemberDiaryCreationRepository repository) {
		return repository::insertOwner;
	}
}
