package com.f106.DIO.user.service;
import java.time.Instant;
/** 공유 도메인이 소유권 확인·나가기·개인 다이어리 정리를 담당한다. */
public interface UserWithdrawalDiaries { void remove(long userId,Instant now); }
