package com.f106.DIO.diary.creation;

import java.util.Properties;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@EnabledIfSystemProperty(named="dio.diary-creation-postgres",matches="true")
class PostgresMemberDiaryCreationTests extends MemberDiaryCreationContract {
	String schema;
	JdbcTemplate admin;
	@Override DriverManagerDataSource database() {
		String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
		if(url==null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) throw new IllegalStateException("Explicit isolated local PostgreSQL URL required");
		admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));
		schema="creation_qa_"+UUID.randomUUID().toString().replace("-","");
		admin.execute("create schema "+schema);
		var dataSource=new DriverManagerDataSource(url,user,password);
		var properties=new Properties(); properties.setProperty("currentSchema",schema); dataSource.setConnectionProperties(properties);
		Flyway.configure().dataSource(dataSource).defaultSchema(schema).load().migrate();
		return dataSource;
	}
	@Override void cleanupDatabase() {
		if(schema!=null && schema.matches("creation_qa_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade");
	}
	@org.junit.jupiter.api.Test
	void catalogDeactivationWaitsForCreationAndTheNextCreationRejectsIt() throws Exception {
		var validated=new java.util.concurrent.CountDownLatch(1);
		var release=new java.util.concurrent.CountDownLatch(1);
		var updating=new java.util.concurrent.CountDownLatch(1);
		var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
		var blocking=service((id,user,color,at) -> {
			owner.create(id,user,color,at); validated.countDown();
			try { if(!release.await(10,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Test release timeout"); }
			catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
		},pages);
		java.util.concurrent.Future<?> creation=null,change=null;
		try {
			creation=pool.submit(() -> tx.execute(s -> blocking.create(metadata(),selections(2))));
			org.assertj.core.api.Assertions.assertThat(validated.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
			change=pool.submit(() -> { updating.countDown(); return jdbc.update("update page_templates set is_active=false where template_id=-10"); });
			org.assertj.core.api.Assertions.assertThat(updating.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
			var pending=change;
			org.assertj.core.api.Assertions.assertThatThrownBy(() -> pending.get(200,java.util.concurrent.TimeUnit.MILLISECONDS))
				.isInstanceOf(java.util.concurrent.TimeoutException.class);
			release.countDown(); creation.get(10,java.util.concurrent.TimeUnit.SECONDS); change.get(10,java.util.concurrent.TimeUnit.SECONDS);
			org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isEqualTo(2);
			error(400,() -> tx.execute(s -> service.create(metadata(),selections(1))));
			org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
		} finally {
			release.countDown(); pool.shutdown();
			if(!pool.awaitTermination(15,java.util.concurrent.TimeUnit.SECONDS)) pool.shutdownNow();
		}
	}

	@org.junit.jupiter.api.Test
	void concurrentSameKeyFromSeparateServiceInstancesCommitsOnlyOneDiary() throws Exception {
		concurrentKeys(false,false);
	}
	@org.junit.jupiter.api.Test
	void waitingRequestCanWinAfterTheFirstTransactionRollsBack() throws Exception {
		concurrentKeys(true,false);
	}
	@org.junit.jupiter.api.Test
	void boundedLockTimeoutCanBeRetriedWithTheSameKeyAfterCompletion() throws Exception {
		concurrentKeys(false,true);
	}
	void concurrentKeys(boolean failFirst,boolean timeOut) throws Exception {
		var ready=new java.util.concurrent.CountDownLatch(1);
		var release=new java.util.concurrent.CountDownLatch(1);
		var pool=java.util.concurrent.Executors.newFixedThreadPool(2);
		var blocked=service(owner,new TestPages() {
			@Override public java.util.List<UUID> create(UUID id,long user,java.util.List<Selection> selected,java.time.Instant at) {
				var result=super.create(id,user,selected,at); ready.countDown();
				try { if(!release.await(10,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Test release timeout"); }
				catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
				if(failFirst) throw new IllegalStateException("first creator failed");
				return result;
			}
		});
		try {
			var first=pool.submit(() -> tx.execute(s -> keyed(blocked).create("parallel-key-0001",metadata(),selections(2))));
			org.assertj.core.api.Assertions.assertThat(ready.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
			if(timeOut) {
				var quick=new IdempotentDiaryCreationService(actor::get,repository,new DiaryCreationReceiptRepository(jdbc,100),service);
				idempotencyError("IDEMPOTENCY_IN_PROGRESS",() -> tx.execute(s -> quick.create("parallel-key-0001",metadata(),selections(2))));
				release.countDown(); first.get(10,java.util.concurrent.TimeUnit.SECONDS);
				org.assertj.core.api.Assertions.assertThat(tx.execute(s -> keyed(service).create("parallel-key-0001",metadata(),selections(2))).replayed()).isTrue();
			} else {
				var second=pool.submit(() -> tx.execute(s -> keyed(service).create("parallel-key-0001",metadata(),selections(2))));
				org.assertj.core.api.Assertions.assertThatThrownBy(() -> second.get(200,java.util.concurrent.TimeUnit.MILLISECONDS)).isInstanceOf(java.util.concurrent.TimeoutException.class);
				release.countDown();
				if(failFirst) {
					org.assertj.core.api.Assertions.assertThatThrownBy(() -> first.get(10,java.util.concurrent.TimeUnit.SECONDS)).hasCauseInstanceOf(IllegalStateException.class);
					org.assertj.core.api.Assertions.assertThat(second.get(10,java.util.concurrent.TimeUnit.SECONDS).replayed()).isFalse();
				} else {
					var a=first.get(10,java.util.concurrent.TimeUnit.SECONDS); var b=second.get(10,java.util.concurrent.TimeUnit.SECONDS);
					org.assertj.core.api.Assertions.assertThat(b.created()).isEqualTo(a.created());
					org.assertj.core.api.Assertions.assertThat(a.replayed()).isFalse(); org.assertj.core.api.Assertions.assertThat(b.replayed()).isTrue();
				}
			}
			org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isEqualTo(1);
			org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from pages",Long.class)).isEqualTo(2);
			org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts",Long.class)).isEqualTo(1);
		} finally { release.countDown(); pool.shutdown(); if(!pool.awaitTermination(15,java.util.concurrent.TimeUnit.SECONDS)) pool.shutdownNow(); }
	}

	@org.junit.jupiter.api.Test
	void permanentDeletionScrubsResponseContentButKeepsTheKeyTombstone() {
		var keyed=keyed(service); var first=tx.execute(s -> keyed.create("scrub-purged-key",metadata(),selections(1)));
		UUID id=UUID.fromString(first.created().diary().diaryId());
		jdbc.update("delete from pages where diary_id=?",id);
		jdbc.update("delete from diary_members where diary_id=?",id);
		jdbc.update("delete from diaries where diary_id=?",id);
		org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from diary_creation_receipts where diary_id is null and response_body is null and completed_at is not null",Long.class)).isEqualTo(1);
		idempotencyError("IDEMPOTENCY_RESULT_UNAVAILABLE",() -> tx.execute(s -> keyed.create("scrub-purged-key",metadata(),selections(1))));
		org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select count(*) from diaries",Long.class)).isZero();
	}
}
