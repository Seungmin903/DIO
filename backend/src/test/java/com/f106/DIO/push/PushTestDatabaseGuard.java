package com.f106.DIO.push;

import java.sql.DriverManager;
import java.util.Map;

/** Fail closed before Spring or Flyway connects to anything except an explicitly marked disposable DB. */
final class PushTestDatabaseGuard {
    private PushTestDatabaseGuard() {}
    static String validatedUrl(Map<String,String> env) {
        String url=env.get("DIO_PUSH_URL"),password=env.get("DIO_PUSH_PASSWORD"),nonce=env.get("DIO_PUSH_GUARD");
        if(!"true".equals(env.get("DIO_PUSH_TEST_DISPOSABLE")) || url==null ||
            !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]{1,5}/pushqa_[a-f0-9]{12}") ||
            password==null || password.isBlank() || nonce==null || !nonce.matches("[a-f0-9]{32}"))
            throw new IllegalStateException("Explicit marked disposable loopback push test DB is required");
        return url;
    }
    static String verify(Map<String,String> env) {
        String url=validatedUrl(env);
        try(var connection=DriverManager.getConnection(url,"postgres",env.get("DIO_PUSH_PASSWORD"))) {
            connection.setReadOnly(true);
            try(var query=connection.prepareStatement("select count(*) from push_test_guard.marker where nonce = ?")) {
                query.setString(1,env.get("DIO_PUSH_GUARD"));
                try(var rows=query.executeQuery()) {
                    if(!rows.next() || rows.getLong(1)!=1) throw new IllegalStateException("Disposable DB marker mismatch");
                }
            }
            return url;
        } catch(java.sql.SQLException error) { throw new IllegalStateException("Disposable DB marker unavailable",error); }
    }
}
