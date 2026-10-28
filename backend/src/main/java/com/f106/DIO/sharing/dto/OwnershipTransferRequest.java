package com.f106.DIO.sharing.dto;
import jakarta.validation.constraints.*;
public record OwnershipTransferRequest(@NotNull @Positive @io.swagger.v3.oas.annotations.media.Schema(description="현재 참여 중인 후임 멤버의 사용자 ID",example="123") Long newOwnerUserId) {}
