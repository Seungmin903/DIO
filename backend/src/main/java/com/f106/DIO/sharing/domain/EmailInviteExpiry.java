package com.f106.DIO.sharing.domain;

import java.time.Instant;

/**
 * 대기 중 이메일 초대의 만료 규칙. 엔티티·JPQL·알림 SQL이 모두 이 규칙을 쓴다.
 * 만료 시각은 expires_at과 생성 시각 + 7일 중 이른 쪽이다. V28 이전 초대는 토큰 서명이 바뀌지 않도록
 * expires_at을 9999년으로 남겨 두었기 때문에 생성 시각 상한이 필요하다. 그런 행이 모두 정리되면
 * (retention_until = 생성 + 7일) 생성 시각 조건은 지워도 된다.
 * 시각은 호출하는 쪽이 넘긴다. 한 요청 안의 판정이 같은 시각을 쓰게 하기 위해서다.
 */
public final class EmailInviteExpiry {
    private EmailInviteExpiry() {}
    /** SQL에서 쓰는 조건. :now와 :createdAfter 파라미터를 {@link #createdAfter}로 채운다. */
    public static final String UNEXPIRED_SQL="%1$s.expires_at>:now and %1$s.created_at>:createdAfter";
    public static Instant expiresAt(Instant createdAt,Instant storedExpiresAt) {
        Instant limit=createdAt.plusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);
        return storedExpiresAt.isBefore(limit)?storedExpiresAt:limit;
    }
    public static boolean expired(Instant createdAt,Instant storedExpiresAt,Instant now) {
        return !expiresAt(createdAt,storedExpiresAt).isAfter(now);
    }
    /** 이 시각보다 늦게 만든 초대만 생성 시각 상한을 넘기지 않았다. */
    public static Instant createdAfter(Instant now) {return now.minusSeconds(SharingPolicy.EMAIL_INVITE_TTL_SECONDS);}
    public static String unexpiredSql(String alias) {return UNEXPIRED_SQL.formatted(alias);}
}
