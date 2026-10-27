package com.f106.DIO.user.dto;

import com.f106.DIO.user.support.UserInput;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.media.Schema;
public final class UserDtos {
    private UserDtos() {}
    public record NicknameRequest(
        @NotBlank @Pattern(regexp = "[가-힣A-Za-z0-9_]{2,12}")
        @Schema(example = "디오사용자") String nickname
    ) {
        public NicknameRequest { nickname = UserInput.normalizeNickname(nickname); }
    }

    public record EmailRequest(
        @NotBlank @Email @Size(max = 254)
        @Pattern(regexp = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+")
        @Schema(example = "member@example.com") String email
    ) {
        public EmailRequest { email = UserInput.normalizeEmail(email); }
    }

    public record AvailabilityResponse(boolean available) {}
}
