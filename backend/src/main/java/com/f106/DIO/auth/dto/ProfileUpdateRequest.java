package com.f106.DIO.auth.dto;

import com.f106.DIO.user.support.UserInput;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;

/** 닉네임은 회원가입과 같은 형식만 검사하며 중복은 허용한다. */
public record ProfileUpdateRequest(
    @NotBlank @Pattern(regexp = "[가-힣A-Za-z0-9_]{2,12}") @Schema(example = "새닉네임") String nickname
) {
    public ProfileUpdateRequest { nickname = UserInput.normalizeNickname(nickname); }
}
