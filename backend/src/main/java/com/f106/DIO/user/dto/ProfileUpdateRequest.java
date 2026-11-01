package com.f106.DIO.user.dto;

import com.f106.DIO.user.support.UserInput;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

@Schema(description = "로그인한 회원의 공개 프로필 수정 정보")
public record ProfileUpdateRequest(
    @NotBlank @Pattern(regexp = "[가-힣A-Za-z0-9_]{2,12}") String nickname,
    Boolean removeProfilePhoto
) {
    public ProfileUpdateRequest { nickname = UserInput.normalizeNickname(nickname); }
}
