package com.f106.DIO.media;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

import com.f106.DIO.media.config.MediaExpirySchedule;
import com.f106.DIO.media.service.ExpiredMediaCleanup;

/** PostgreSQL advisory lock 분기를 JDBC 목으로 검증한다. 실제 다중 인스턴스 경합은 PostgreSQL 환경에서 확인한다. */
class MediaExpiryScheduleLockTests {
	private final ExpiredMediaCleanup cleanup = mock(ExpiredMediaCleanup.class);
	private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
	private final Connection connection = mock(Connection.class);
	private final ResultSet lockResult = mock(ResultSet.class);

	@BeforeEach
	@SuppressWarnings("unchecked")
	void postgresConnection() throws Exception {
		DatabaseMetaData metaData = mock(DatabaseMetaData.class);
		when(metaData.getDatabaseProductName()).thenReturn("PostgreSQL");
		when(connection.getMetaData()).thenReturn(metaData);
		when(connection.getAutoCommit()).thenReturn(true, false);
		PreparedStatement statement = mock(PreparedStatement.class);
		when(connection.prepareStatement(anyString())).thenReturn(statement);
		when(statement.executeQuery()).thenReturn(lockResult);
		when(lockResult.next()).thenReturn(true);
		when(jdbc.execute(any(ConnectionCallback.class))).thenAnswer(call ->
			call.<ConnectionCallback<Object>>getArgument(0).doInConnection(connection));
		when(cleanup.purgeExpired()).thenReturn(new ExpiredMediaCleanup.Result(0, 0));
	}

	@Test
	void skipsCleanupWhenAnotherInstanceHoldsTheLock() throws Exception {
		when(lockResult.getBoolean(1)).thenReturn(false);

		new MediaExpirySchedule(cleanup, jdbc).run();

		verify(cleanup, never()).purgeExpired();
		verify(connection, never()).commit();
		verify(connection).rollback();
		verify(connection).setAutoCommit(true);
	}

	@Test
	void runsCleanupInsideTheLockTransactionAndRestoresAutoCommit() throws Exception {
		when(lockResult.getBoolean(1)).thenReturn(true);

		new MediaExpirySchedule(cleanup, jdbc).run();

		InOrder order = inOrder(connection, cleanup);
		order.verify(connection).setAutoCommit(false);
		order.verify(cleanup).purgeExpired();
		order.verify(connection).commit();
		order.verify(connection).setAutoCommit(true);
	}

	@Test
	void releasesTheLockTransactionWhenCleanupFails() throws Exception {
		when(lockResult.getBoolean(1)).thenReturn(true);
		when(cleanup.purgeExpired()).thenThrow(new IllegalStateException("storage down"));

		new MediaExpirySchedule(cleanup, jdbc).run();

		verify(connection, never()).commit();
		verify(connection).rollback();
		verify(connection).setAutoCommit(true);
	}
}
