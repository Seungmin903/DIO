package com.f106.DIO.moderation.domain;
public record UserBlockId(Long blockerUserId,Long blockedUserId) implements java.io.Serializable {}
