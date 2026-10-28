package com.f106.DIO.notification;

import java.time.Instant;
import java.util.Base64;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;


import com.f106.DIO.notification.auth.NotificationUserPrincipal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 기본 4개 API의 소유권·페이지·읽음·삭제 계약. watermark/248 fixture와 독립적이다. */
@org.springframework.boot.test.context.SpringBootTest
@org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc(addFilters = false)
@org.springframework.test.context.TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:notificationcoreapi;MODE=PostgreSQL",
    "spring.jpa.hibernate.ddl-auto=none",
    "spring.sql.init.mode=always", "spring.sql.init.schema-locations=classpath:notification-core-h2.sql"
})
@org.springframework.transaction.annotation.Transactional
class NotificationCoreApiTests {

	@Test
	void pdfReadRouteNeedsNoBodyAndDoesNotExposeTheOldReadSuffix() throws Exception {
		mvc.perform(patch("/api/v1/notifications/90001").principal(() -> String.valueOf(USER)))
			.andExpect(status().isUnauthorized());
		mvc.perform(patch("/api/v1/notifications/90001/read").principal(user(USER)))
			.andExpect(status().isNotFound());
		assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=90001", java.sql.Timestamp.class)).isNull();
		mvc.perform(patch("/api/v1/notifications/90001").principal(user(USER)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.notificationId").value("90001"))
			.andExpect(jsonPath("$.readAt").isNotEmpty());
	}

	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	static final Instant AT = Instant.parse("2026-10-26T00:00:00.123456Z");
	static final long USER = 81001, OTHER = 81002;

	static NotificationUserPrincipal user(long id) {
		return new NotificationUserPrincipal() {
			public long userId() { return id; }
			public String getName() { return "test-verified-user"; }
		};
	}

	@BeforeEach
	void fixtures() {
		assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
		assertThat(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>) c -> c.getAutoCommit())).isFalse();
		jdbc.update("insert into users(user_id,nickname) values (?,?), (?,?)", USER, "알림 QA", OTHER, "다른 회원");

		add(90001, USER, AT, false, false);
		add(90002, USER, AT, true, false);
		add(90003, USER, AT.plusSeconds(1), false, false);
		add(90004, USER, AT.plusSeconds(2), false, true);
		add(90005, OTHER, AT.plusSeconds(3), false, false);
	}


	void add(long id, long recipient, Instant at, boolean read, boolean deleted) {
		jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at,read_at,deleted_at) values (?,?,?,?,?,?)",
			id, recipient, "DIARY_INVITE", java.sql.Timestamp.from(at),
			read ? java.sql.Timestamp.from(at) : null, deleted ? java.sql.Timestamp.from(at) : null);
	}

	@Test
	void rejectsUnauthenticatedAndUnverifiedPrincipalEvenWithUserHeader() throws Exception {
		mvc.perform(get("/api/v1/notifications").header("X-User-Id", USER)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/v1/notifications").principal(() -> String.valueOf(USER))).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/v1/notifications/unread-count")).andExpect(status().isUnauthorized());
		mvc.perform(patch("/api/v1/notifications/90001")).andExpect(status().isUnauthorized());
	}

	@Test
	void returnsOnlyOwnActiveRowsInStableOrderWithoutRawPayload() throws Exception {
		mvc.perform(get("/api/v1/notifications").principal(user(USER)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(3))
			.andExpect(jsonPath("$.items[0].notification.notificationId").value("90003"))
			.andExpect(jsonPath("$.items[1].notification.notificationId").value("90002"))
			.andExpect(jsonPath("$.items[2].notification.notificationId").value("90001"))
			.andExpect(jsonPath("$.items[0].invitation").isEmpty())
			.andExpect(jsonPath("$.items[0].notification.payloadJson").doesNotExist())
			.andExpect(jsonPath("$.hasNext").value(false)).andExpect(jsonPath("$.nextCursor").isEmpty());
	}

	@Test
	void pagesTiedTimestampsWithoutDuplicatesAndSurvivesDeletedBoundary() throws Exception {
		String response = mvc.perform(get("/api/v1/notifications").param("limit", "2").principal(user(USER)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.hasNext").value(true)).andReturn().getResponse().getContentAsString();
		String cursor = response.replaceFirst("(?s).*\"nextCursor\":\"([^\"]+)\".*", "$1");
		jdbc.update("update notifications set deleted_at = created_at where notification_id = 90002");
		add(90006, USER, AT.plusSeconds(4), false, false);
		mvc.perform(get("/api/v1/notifications").param("limit", "2").param("cursor", cursor).principal(user(USER)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(1))
			.andExpect(jsonPath("$.items[0].notification.notificationId").value("90001"))
			.andExpect(jsonPath("$.hasNext").value(false));
		mvc.perform(get("/api/v1/notifications").param("cursor", cursor).principal(user(OTHER)))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_NOTIFICATION_CURSOR"));
	}

	@Test
	void handlesEmptyPageAndRejectsInvalidLimitsAndCursors() throws Exception {
		mvc.perform(get("/api/v1/notifications").principal(user(81999))).andExpect(status().isOk())
			.andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.hasNext").value(false));
		for (String limit : new String[]{"0", "101", "-1", "abc"}) {
			mvc.perform(get("/api/v1/notifications").param("limit", limit).principal(user(USER))).andExpect(status().isBadRequest());
		}
		for (String cursor : new String[]{"", "invalid!", "A".repeat(300), "aGVsbG8"}) {
			mvc.perform(get("/api/v1/notifications").param("cursor", cursor).principal(user(USER))).andExpect(status().isBadRequest());
		}
		String extreme = Base64.getUrlEncoder().withoutPadding().encodeToString(("1|"+USER+"|+999999999-12-31T23:59:59Z|1").getBytes(java.nio.charset.StandardCharsets.UTF_8));
		mvc.perform(get("/api/v1/notifications").param("cursor", extreme).principal(user(USER))).andExpect(status().isBadRequest());
	}

	@Test
	void countsOnlyOwnNonDeletedUnreadRowsAndMarksReadIdempotently() throws Exception {
		mvc.perform(get("/api/v1/notifications/unread-count").principal(user(USER)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.unreadCount").value(2));
		mvc.perform(patch("/api/v1/notifications/90001").principal(user(USER)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.readAt").isNotEmpty());
		Instant first = jdbc.queryForObject("select read_at from notifications where notification_id = 90001", java.sql.Timestamp.class).toInstant();
		mvc.perform(patch("/api/v1/notifications/90001").principal(user(USER))).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("select read_at from notifications where notification_id = 90001", java.sql.Timestamp.class).toInstant()).isEqualTo(first);
		mvc.perform(get("/api/v1/notifications/unread-count").principal(user(USER)))
			.andExpect(status().isOk()).andExpect(jsonPath("$.unreadCount").value(1));
	}

	@Test
	void otherUsersMissingAndDeletedReadRequestsHaveTheSame404AndDoNotMutateRows() throws Exception {
		for (String id : new String[]{"90005", "99999", "90004"}) {
			mvc.perform(patch("/api/v1/notifications/"+id).principal(user(USER)))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOTIFICATION_NOT_FOUND"));
		}
		assertThat(jdbc.queryForObject("select read_at from notifications where notification_id = 90005", java.sql.Timestamp.class)).isNull();
		assertThat(jdbc.queryForObject("select read_at from notifications where notification_id = 90004", java.sql.Timestamp.class)).isNull();
	}

	@Test
	void serializesBigintIdsAsStringsWithoutJavascriptPrecisionLoss() throws Exception {
		add(9007199254740993L, USER, AT.plusSeconds(4), false, false);
		mvc.perform(get("/api/v1/notifications").principal(user(USER))).andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].notification.notificationId").value("9007199254740993"));
	}

	@Test
	void deletesOnlyOwnNotificationAndPreservesTheFirstDeletionTimeOnRetry() throws Exception {
		mvc.perform(delete("/api/v1/notifications/90001").principal(user(USER))).andExpect(status().isNoContent());
		var first = jdbc.queryForObject("select deleted_at from notifications where notification_id = 90001", java.sql.Timestamp.class);
		mvc.perform(delete("/api/v1/notifications/90001").principal(user(USER))).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("select deleted_at from notifications where notification_id = 90001", java.sql.Timestamp.class)).isEqualTo(first);
		mvc.perform(get("/api/v1/notifications").principal(user(USER))).andExpect(jsonPath("$.items.length()").value(2));
		mvc.perform(get("/api/v1/notifications/unread-count").principal(user(USER))).andExpect(jsonPath("$.unreadCount").value(1));
		mvc.perform(patch("/api/v1/notifications/90001").principal(user(USER))).andExpect(status().isNotFound());
		assertThat(jdbc.queryForObject("select count(*) from notifications where notification_id = 90001", Long.class)).isEqualTo(1);
	}

	@Test
	void rejectsOtherMissingAndUnauthenticatedDeletionWithoutChangingRows() throws Exception {
		mvc.perform(delete("/api/v1/notifications/90001").header("X-User-Id", USER)).andExpect(status().isUnauthorized());
		for (long id : new long[]{90005, 99999}) {
			mvc.perform(delete("/api/v1/notifications/"+id).principal(user(USER)))
				.andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOTIFICATION_NOT_FOUND"));
		}
		assertThat(jdbc.queryForObject("select deleted_at from notifications where notification_id = 90005", java.sql.Timestamp.class)).isNull();
	}

}
