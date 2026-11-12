package com.f106.DIO.diary;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.f106.DIO.diary.domain.Diary;
import com.f106.DIO.diary.repository.DiaryRepository;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** local PostgreSQL에서 Flyway V1과 UUID 다이어리 매핑을 검증한다. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "dio.postgres-test", matches = "true")
@Transactional
class PostgresDiarySchemaTests {

	@Autowired JdbcTemplate jdbc;
	@Autowired DiaryRepository diaries;
	@Autowired UserRepository users;
	@Autowired MockMvc mvc;

	@Test
	void flywayV1CreatesTheUuidDiarySchema() {
		assertThat(jdbc.queryForObject("select version()", String.class)).contains("PostgreSQL");
		Diary diary = diaries.saveAndFlush(new Diary("POSTGRES_SCHEMA_TEST", "#D6BFA7", "PLAIN", "PRIVATE", owner().getUserId()));
		UUID id = diary.getDiaryId();
		assertThat(jdbc.queryForObject("select diary_id from diaries where diary_id = ?", UUID.class, id)).isEqualTo(id);
		assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where version = '1' and success", Long.class))
			.isEqualTo(1L);
	}

	@Test
	void softDeletedDiaryIsExcludedFromPostgresQueriesAndUpdates() throws Exception {
		Long ownerUserId = owner().getUserId();
		Diary diary = diaries.saveAndFlush(new Diary("POSTGRES_SOFT_DELETE", "#D6BFA7", "PLAIN", "PRIVATE", ownerUserId));
		UUID diaryId = diary.getDiaryId();

		mvc.perform(delete("/api/v1/diaries/" + diaryId).with(jwt().jwt(token -> token.subject(ownerUserId.toString())))).andExpect(status().isNoContent());
		mvc.perform(patch("/api/v1/diaries/" + diaryId).with(jwt().jwt(token -> token.subject(ownerUserId.toString()))).contentType(MediaType.APPLICATION_JSON)
			.content("{\"diaryTitle\":\"수정 시도\"}"))
			.andExpect(status().isNotFound());
		mvc.perform(get("/api/v1/diaries").with(jwt().jwt(token -> token.subject(ownerUserId.toString()))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.diaryId == '" + diaryId + "')]").isEmpty());
	}

	@Test
	void postgresListsSameTimestampDiariesByUuidDescending() {
		Long ownerUserId = owner().getUserId();
		Diary oldest = diaries.saveAndFlush(new Diary("POSTGRES_OLDEST", "#D6BFA7", "PLAIN", "PRIVATE", ownerUserId));
		Diary lower = diaries.saveAndFlush(new Diary("POSTGRES_LOWER", "#D6BFA7", "PLAIN", "PRIVATE", ownerUserId));
		Diary higher = diaries.saveAndFlush(new Diary("POSTGRES_HIGHER", "#D6BFA7", "PLAIN", "PRIVATE", ownerUserId));
		UUID lowerId = UUID.fromString("00000000-0000-0000-0000-000000000011");
		UUID higherId = UUID.fromString("00000000-0000-0000-0000-000000000012");
		Instant oldestTime = Instant.parse("2026-01-01T00:00:00Z");
		Instant sameTime = Instant.parse("2026-01-02T00:00:00Z");

		jdbc.update("update diaries set created_at = ? where diary_id = ?", java.sql.Timestamp.from(oldestTime), oldest.getDiaryId());
		jdbc.update("update diaries set diary_id = ?, created_at = ? where diary_id = ?", lowerId, java.sql.Timestamp.from(sameTime), lower.getDiaryId());
		jdbc.update("update diaries set diary_id = ?, created_at = ? where diary_id = ?", higherId, java.sql.Timestamp.from(sameTime), higher.getDiaryId());

		List<UUID> orderedRelevantIds = diaries.findAllByOwnerUserIdAndDeletedAtIsNullOrderByCreatedAtDescDiaryIdDesc(ownerUserId).stream()
			.map(Diary::getDiaryId)
			.filter(id -> id.equals(oldest.getDiaryId()) || id.equals(lowerId) || id.equals(higherId))
			.toList();
		assertThat(orderedRelevantIds).containsExactly(higherId, lowerId, oldest.getDiaryId());
	}

	private User owner() {
		String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
		return users.saveAndFlush(new User("postgres-" + suffix + "@example.com", "테스트" + suffix.substring(0, 4), Instant.now()));
	}
}
