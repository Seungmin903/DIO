package com.f106.DIO.auth.repository;

import com.f106.DIO.auth.domain.RefreshTokenHistory;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RefreshTokenHistoryRepository extends JpaRepository<RefreshTokenHistory, String> {
    java.util.Optional<RefreshTokenHistory> findFirstByTokenIdOrderByRotatedAtDesc(Long tokenId);
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("delete from RefreshTokenHistory h where h.tokenId = :tokenId")
    public int deleteForSession(Long tokenId);
}
