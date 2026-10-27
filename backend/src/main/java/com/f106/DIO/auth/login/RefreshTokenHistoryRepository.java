package com.f106.DIO.auth.login;

import org.springframework.data.jpa.repository.JpaRepository;

interface RefreshTokenHistoryRepository extends JpaRepository<RefreshTokenHistory, String> {
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("delete from RefreshTokenHistory h where h.tokenId = :tokenId")
    int deleteForSession(Long tokenId);
}
