package com.f106.DIO.diary.detail;

import java.util.Properties;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@EnabledIfSystemProperty(named="dio.diary-detail-postgres",matches="true")
class PostgresDiaryDetailTests extends DiaryDetailContract {
	String schema;
	JdbcTemplate admin;

	@Override
	DriverManagerDataSource database() {
		String url = System.getenv("DB_URL"), username=System.getenv("POSTGRES_USER"), password=System.getenv("POSTGRES_PASSWORD");
		if (url == null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) throw new IllegalStateException("Explicit isolated local PostgreSQL URL required");
		admin = new JdbcTemplate(new DriverManagerDataSource(url,username,password));
		schema = "detail_qa_"+UUID.randomUUID().toString().replace("-","");
		admin.execute("create schema "+schema);
		var dataSource = new DriverManagerDataSource(url,username,password);
		Properties properties = new Properties(); properties.setProperty("currentSchema",schema);
		dataSource.setConnectionProperties(properties);
		Flyway.configure().dataSource(dataSource).defaultSchema(schema).load().migrate();
		return dataSource;
	}
	@Override
	void cleanupDatabase() {
		if (schema != null && schema.matches("detail_qa_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade");
	}

	@org.junit.jupiter.api.Test
	void membershipChangeCannotSlipBetweenAuthorizationAndCommit() throws Exception {
		var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
		var authorized = new java.util.concurrent.CountDownLatch(1);
		var release = new java.util.concurrent.CountDownLatch(1);
		var changing = new java.util.concurrent.CountDownLatch(1);
		try {
			var read = executor.submit(() -> tx.execute(s -> {
				var result = service.get(ID);
				authorized.countDown();
				try { if (!release.await(10,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Test release timed out"); }
				catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
				return result;
			}));
			org.assertj.core.api.Assertions.assertThat(authorized.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
			var change = executor.submit(() -> tx.execute(s -> {
				changing.countDown();
				return jdbc.update("update diary_members set left_at=? where diary_id=? and user_id=1",java.sql.Timestamp.from(AT),ID);
			}));
			org.assertj.core.api.Assertions.assertThat(changing.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
			org.assertj.core.api.Assertions.assertThatThrownBy(() -> change.get(200,java.util.concurrent.TimeUnit.MILLISECONDS))
				.isInstanceOf(java.util.concurrent.TimeoutException.class);
			release.countDown();
			org.assertj.core.api.Assertions.assertThat(read.get(10,java.util.concurrent.TimeUnit.SECONDS).diary().diaryTitle()).isEqualTo("original");
			org.assertj.core.api.Assertions.assertThat(change.get(10,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(1);
			error(404,"DIARY_NOT_FOUND", () -> tx.execute(s -> service.get(ID)));
		} finally {
			release.countDown(); executor.shutdownNow();
			org.assertj.core.api.Assertions.assertThat(executor.awaitTermination(15,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
		}
	}
    @org.junit.jupiter.api.Test
    void accountDeactivationWaitsForAnAuthorizedDetailRead() throws Exception {
        assertReadSerializesUpdate("update users set status='SUSPENDED' where user_id=1",new Object[]{},401,"DIARY_AUTHENTICATION_REQUIRED");
    }

    @org.junit.jupiter.api.Test
    void diaryDeletionWaitsForAnAuthorizedDetailRead() throws Exception {
        assertReadSerializesUpdate("update diaries set deleted_at=? where diary_id=?",
            new Object[]{java.sql.Timestamp.from(AT),ID},404,"DIARY_NOT_FOUND");
    }

    private void assertReadSerializesUpdate(String sql,Object[] args,int status,String code) throws Exception {
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        var authorized=new java.util.concurrent.CountDownLatch(1);
        var release=new java.util.concurrent.CountDownLatch(1);
        var readerPid=new java.util.concurrent.CompletableFuture<Integer>();
        var writerPid=new java.util.concurrent.CompletableFuture<Integer>();
        try {
            var read=executor.submit(() -> tx.execute(s -> {
                readerPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));
                var result=service.get(ID); authorized.countDown();
                try { if(!release.await(10,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Test release timed out"); }
                catch(InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
                return result;
            }));
            org.assertj.core.api.Assertions.assertThat(authorized.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var write=executor.submit(() -> tx.execute(s -> {
                writerPid.complete(jdbc.queryForObject("select pg_backend_pid()",Integer.class));
                return jdbc.update(sql,args);
            }));
            int reader=readerPid.get(5,java.util.concurrent.TimeUnit.SECONDS),writer=writerPid.get(5,java.util.concurrent.TimeUnit.SECONDS);
            boolean blocked=false; long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(3);
            while(System.nanoTime()<deadline) {
                if(Boolean.TRUE.equals(jdbc.queryForObject("select ? = any(pg_blocking_pids(?))",Boolean.class,reader,writer))) { blocked=true; break; }
                if(write.isDone()) break;
                java.util.concurrent.locks.LockSupport.parkNanos(java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(20));
            }
            org.assertj.core.api.Assertions.assertThat(blocked).as("writer must wait on the authorized read's actual PostgreSQL row lock").isTrue();
            release.countDown();
            org.assertj.core.api.Assertions.assertThat(read.get(5,java.util.concurrent.TimeUnit.SECONDS).diary().diaryTitle()).isEqualTo("original");
            org.assertj.core.api.Assertions.assertThat(write.get(5,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(1);
            error(status,code,() -> tx.execute(s -> service.get(ID)));
        } finally {
            release.countDown(); executor.shutdownNow();
            org.assertj.core.api.Assertions.assertThat(executor.awaitTermination(15,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        }
    }

    @org.junit.jupiter.api.Test
    void twoAuthorizedDetailReadsCanHoldSharedLocksTogether() throws Exception {
        var executor=java.util.concurrent.Executors.newFixedThreadPool(2);
        var authorized=new java.util.concurrent.CountDownLatch(1);
        var release=new java.util.concurrent.CountDownLatch(1);
        try {
            var first=executor.submit(() -> tx.execute(s -> {
                var result=service.get(ID); authorized.countDown();
                try { if(!release.await(10,java.util.concurrent.TimeUnit.SECONDS)) throw new IllegalStateException("Test release timed out"); }
                catch(InterruptedException error) { Thread.currentThread().interrupt(); throw new IllegalStateException(error); }
                return result;
            }));
            org.assertj.core.api.Assertions.assertThat(authorized.await(10,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var second=executor.submit(() -> tx.execute(s -> service.get(ID)));
            org.assertj.core.api.Assertions.assertThat(second.get(5,java.util.concurrent.TimeUnit.SECONDS).diary().diaryTitle()).isEqualTo("original");
            release.countDown();
            org.assertj.core.api.Assertions.assertThat(first.get(5,java.util.concurrent.TimeUnit.SECONDS).diary().diaryTitle()).isEqualTo("original");
        } finally {
            release.countDown(); executor.shutdownNow();
            org.assertj.core.api.Assertions.assertThat(executor.awaitTermination(15,java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        }
    }

}
