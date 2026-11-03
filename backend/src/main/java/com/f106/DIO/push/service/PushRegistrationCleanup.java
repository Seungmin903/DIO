package com.f106.DIO.push.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 만료된 최초 응답의 암호문만 지우고 재발급 금지를 위한 요청 이력은 남긴다. */
@Service
public class PushRegistrationCleanup {
    private final JdbcTemplate jdbc;
    public PushRegistrationCleanup(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    @Transactional
    public int clearExpired(Instant now) {
        int cleared=jdbc.update("""
            update push_registration_requests set encrypted_response=null,response_key_id=null,response_cipher_format=null
            where (session_id,installation_id,request_id) in (
              select session_id,installation_id,request_id from push_registration_requests
              where encrypted_response is not null and expires_at<=?
              order by expires_at,session_id,installation_id,request_id
              limit 500 for update skip locked
            )
            """, Timestamp.from(now));
        Instant cutoff=now.minus(30,ChronoUnit.DAYS);
        // Retain only the bounded retry window; these rows contain registration and delivery metadata.
        jdbc.update("delete from push_registration_requests where expires_at<=?",Timestamp.from(cutoff));
        jdbc.update("delete from push_mutation_requests where created_at<=?",Timestamp.from(cutoff));
        jdbc.update("delete from push_installations where enabled=false and disabled_at is not null and disabled_at<=?",Timestamp.from(cutoff));
        return cleared;
    }
}
