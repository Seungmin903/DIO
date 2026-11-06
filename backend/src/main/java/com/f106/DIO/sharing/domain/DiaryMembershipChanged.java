package com.f106.DIO.sharing.domain;
import java.util.UUID;
/** Published after a committed join, leave, removal, or ownership transfer. */
public record DiaryMembershipChanged(UUID diaryId) {}
