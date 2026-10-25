package com.f106.DIO.auth.login;

import org.springframework.data.jpa.repository.JpaRepository;

interface RefreshTokenHistoryRepository extends JpaRepository<RefreshTokenHistory, String> {}
