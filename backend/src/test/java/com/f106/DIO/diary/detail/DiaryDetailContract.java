package com.f106.DIO.diary.detail;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import com.f106.DIO.diary.dto.DiaryUpdateRequest;

import static org.assertj.core.api.Assertions.*;

abstract class DiaryDetailContract {
	JdbcTemplate jdbc;
	TransactionTemplate tx;
	DiaryDetailService service;
	DiaryDetailRepository repository;
	JdbcDiaryMembershipAccess memberships;
	ValidatorFactory validation;
	AtomicLong actor = new AtomicLong(1);
	static final UUID ID = UUID.fromString("aa000000-0000-0000-0000-000000000001");
	static final Instant AT = Instant.parse("2026-10-27T00:00:00Z");

	abstract DriverManagerDataSource database();
	abstract void cleanupDatabase();

	@BeforeEach
	void fixtures() {
		var dataSource = database();
		jdbc = new JdbcTemplate(dataSource);
		jdbc.setQueryTimeout(5);
		tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
		for (int i=1; i<=4; i++) jdbc.update("insert into users(user_id,nickname,nickname_key,status) values (?,?,?,'ACTIVE')", i,"user"+i,"user"+i);
		jdbc.update("insert into diaries(diary_id,owner_user_id,title,cover_color,cover_style,visibility,created_at,updated_at) values (?,1,'original','#CED9EE','PLAIN','PRIVATE',?,?)",
			ID, java.sql.Timestamp.from(AT), java.sql.Timestamp.from(AT));
		for (int i=1; i<=3; i++) jdbc.update("insert into diary_members(diary_id,user_id,role,member_color) values (?,?,?,'#123456')",
			ID, i, new String[]{"OWNER","EDITOR","VIEWER"}[i-1]);
		repository = new DiaryDetailRepository(jdbc);
		memberships = new JdbcDiaryMembershipAccess(jdbc, repository);
		validation = Validation.buildDefaultValidatorFactory();
		service = new DiaryDetailService(repository, actor::get, memberships, validation.getValidator(), Clock.fixed(AT, ZoneOffset.UTC));
	}

	@AfterEach
	void cleanup() {
		if (validation != null) validation.close();
		cleanupDatabase();
	}

	DiaryUpdateRequest patch(String title) {
		var patch = new DiaryUpdateRequest();
		patch.setDiaryTitle(title);
		return patch;
	}

	void error(int status, String code, Runnable action) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(DiaryDetailException.class, e -> {
			assertThat(e.status().value()).isEqualTo(status);
			assertThat(e.code()).isEqualTo(code);
		});
	}

	@Test
	void activeOwnerAndEditorCanRead() {
		for (long user=1; user<=2; user++) {
			actor.set(user);
			assertThat(tx.execute(s -> service.get(ID)).diary().diaryTitle()).isEqualTo("original");
		}
	}

	@Test
	void onlyOwnerCanUpdateAndOmittedFieldsArePreserved() {
		var patch = patch("  changed  ");
		patch.setCoverColor("#112233");
		var result = tx.execute(s -> service.update(ID, patch, AT)).diary();
		assertThat(result.diaryTitle()).isEqualTo("changed");
		assertThat(result.coverColor()).isEqualTo("#112233");
		assertThat(result.coverStyle()).isEqualTo("PLAIN");
		assertThat(result.visibility()).isEqualTo("PRIVATE");
		assertThat(result.createdAt()).isEqualTo(AT);
		assertThat(jdbc.queryForObject("select owner_user_id from diaries where diary_id=?", Long.class, ID)).isEqualTo(1);
		assertThat(jdbc.queryForObject("select count(*) from diary_members", Long.class)).isEqualTo(3);
	}

	@Test
	void editorAndViewerMetadataWritesAreForbidden() {
		for (long user=2; user<=3; user++) {
			actor.set(user);
			error(user==2?403:404,user==2?"DIARY_METADATA_FORBIDDEN":"DIARY_NOT_FOUND", () -> tx.execute(s -> service.update(ID, patch("no"), AT)));
		}
		assertThat(jdbc.queryForObject("select title from diaries where diary_id=?", String.class, ID)).isEqualTo("original");
	}

	@Test
	void outsidersMissingAndDeletedDiariesHaveTheSame404() {
		actor.set(4);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(ID)));
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.update(ID, patch("no"), AT)));
		actor.set(1);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(UUID.randomUUID())));
		jdbc.update("update diaries set deleted_at=? where diary_id=?", java.sql.Timestamp.from(AT), ID);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(ID)));
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.update(ID, patch("no"), AT)));
	}

	@Test
	void leftUnknownAndInconsistentOwnerMembershipsAreNotTrusted() {
		actor.set(2);
		jdbc.update("update diary_members set left_at=? where diary_id=? and user_id=2", java.sql.Timestamp.from(AT), ID);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(ID)));
		jdbc.update("update diary_members set left_at=null,role='ADMIN' where diary_id=? and user_id=2", ID);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(ID)));
		jdbc.update("update diary_members set role='OWNER' where diary_id=? and user_id=2", ID);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(ID)));
		actor.set(1);
		jdbc.update("update diaries set owner_user_id=null where diary_id=?", ID);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(ID)));
	}

	@Test
	void inactiveDeletedMissingAndUnverifiedUsersCannotRead() {
		jdbc.update("update users set status='SUSPENDED' where user_id=1");
		error(401,"DIARY_AUTHENTICATION_REQUIRED", () -> tx.execute(s -> service.get(ID)));
		jdbc.update("update users set status='ACTIVE',deleted_at=? where user_id=1", java.sql.Timestamp.from(AT));
		error(401,"DIARY_AUTHENTICATION_REQUIRED", () -> tx.execute(s -> service.get(ID)));
		actor.set(999);
		error(401,"DIARY_AUTHENTICATION_REQUIRED", () -> tx.execute(s -> service.get(ID)));
		actor.set(0);
		error(401,"DIARY_AUTHENTICATION_REQUIRED", () -> tx.execute(s -> service.get(ID)));
	}

	@Test
	void emptyInvalidAndSharingPatchesAreRejectedWithoutUpdatingAnything() {
		var badColor = patch("valid"); badColor.setCoverColor("red");
		var badStyle = patch("valid"); badStyle.setCoverStyle("   ");
		var sharing = patch("valid"); sharing.setVisibility("LINK");
		for (var patch : new DiaryUpdateRequest[]{null,new DiaryUpdateRequest(),patch("   "),patch("a".repeat(101)),badColor,badStyle,sharing}) {
			error(400,"INVALID_DIARY_METADATA", () -> tx.execute(s -> service.update(ID, patch, AT)));
		}
		error(400,"INVALID_DIARY_METADATA", () -> tx.execute(s -> service.update(ID, patch("valid"), null)));
		error(400,"INVALID_DIARY_METADATA", () -> tx.execute(s -> service.update(ID, patch("valid"), AT.plusNanos(1))));
		assertThat(jdbc.queryForObject("select title from diaries where diary_id=?", String.class, ID)).isEqualTo("original");
	}

	@Test
	void authorizationIsCheckedBeforeMetadataValidation() {
		actor.set(2);
		error(403,"DIARY_METADATA_FORBIDDEN", () -> tx.execute(s -> service.update(ID,null,null)));
		actor.set(4);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.update(ID,null,null)));
	}

	@Test
	void staleWritesFailAndTimestampIncreasesEvenWithAFixedClock() {
		var first = tx.execute(s -> service.update(ID, patch("first"), AT));
		assertThat(first.diary().updatedAt()).isEqualTo(AT.plusNanos(1000));
		error(409,"DIARY_METADATA_CONFLICT", () -> tx.execute(s -> service.update(ID,patch("stale"),AT)));
		var second = tx.execute(s -> service.update(ID,patch("second"),first.diary().updatedAt()));
		assertThat(second.diary().updatedAt()).isEqualTo(AT.plusNanos(2000));
		assertThat(jdbc.queryForObject("select title from diaries where diary_id=?", String.class, ID)).isEqualTo("second");
	}

	@Test
	void unchangedMetadataIsANoopButStillRequiresTheCurrentToken() {
		assertThat(tx.execute(s -> service.update(ID,patch("original"),AT)).diary().updatedAt()).isEqualTo(AT);
		error(409,"DIARY_METADATA_CONFLICT", () -> tx.execute(s -> service.update(ID,patch("original"),AT.minusSeconds(1))));
	}

	@Test
	void membershipRevocationAfterReadingPreventsALaterWrite() {
		var current = tx.execute(s -> service.get(ID));
		jdbc.update("update diary_members set left_at=? where diary_id=? and user_id=1", java.sql.Timestamp.from(AT), ID);
		error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.update(ID,patch("no"),current.diary().updatedAt())));
	}

	@Test
	void concurrentOwnerWritesUsingOneTokenHaveOnlyOneWinner() throws Exception {
		var executor = Executors.newFixedThreadPool(2);
		CountDownLatch start = new CountDownLatch(1);
		try {
			var a = executor.submit(() -> writeAfter(start,"a"));
			var b = executor.submit(() -> writeAfter(start,"b"));
			start.countDown();
			assertThat(java.util.List.of(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS))).containsExactlyInAnyOrder("ok","DIARY_METADATA_CONFLICT");
		} finally { executor.shutdownNow(); assertThat(executor.awaitTermination(15,TimeUnit.SECONDS)).isTrue(); }
	}

	String writeAfter(CountDownLatch start, String title) throws Exception {
		start.await();
		try { tx.execute(s -> service.update(ID,patch(title),AT)); return "ok"; }
		catch (DiaryDetailException conflict) { return conflict.code(); }
	}
}
