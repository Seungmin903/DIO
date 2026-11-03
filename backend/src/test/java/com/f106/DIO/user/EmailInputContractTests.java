package com.f106.DIO.user;

import com.f106.DIO.auth.dto.*;
import com.f106.DIO.user.dto.EmailRequest;
import com.f106.DIO.sharing.dto.EmailInviteRequest;
import com.f106.DIO.user.support.UserInput;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class EmailInputContractTests {
    record Example(String input, String normalized, boolean valid) {}
    @Test void everyEmailRequestMatchesTheFrontendFixtures() throws Exception {
        var examples = JsonMapper.builder().build().readValue(
            Files.readString(Path.of("../docs/contracts/email-input-cases.json")), Example[].class);
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (var example : examples) {
                assertThat(UserInput.normalizeEmail(example.input())).isEqualTo(example.normalized());
                var requests = List.of(
                    new EmailRequest(example.input()),
                    new LoginRequest(example.input(), "Password123!", null),
                    new EmailVerificationRequest(example.input(), "123456"),
                    new SignupRequest(example.input(), "a".repeat(43), "Password123!", "회원", List.of(), true),
                    new PasswordResetVerificationRequest(example.input(), "123456"),
                    new PasswordResetRequest(example.input(), "a".repeat(43), "Password123!"),
                    new EmailInviteRequest(example.input()));
                for (var request : requests) {
                    assertThat(request.getClass().getMethod("email").invoke(request))
                        .as(request.getClass().getSimpleName()).isEqualTo(example.normalized());
                    assertThat(validator.validateProperty(request, "email").isEmpty())
                        .as("%s email=%s", request.getClass().getSimpleName(), example.input())
                        .isEqualTo(example.valid());
                }
            }
        }
    }
    @Test void allIncomingEmailDtosUseTheCommonPolicy() throws Exception {
        // Catch new request DTOs that would silently restore a different normalization/validator.
        for (String scope : List.of("auth/dto", "user/dto", "sharing/dto")) {
            try (var files = Files.list(Path.of("src/main/java/com/f106/DIO", scope))) {
                for (var file : files.filter(p -> p.toString().endsWith("Request.java")).toList()) {
                    String source = Files.readString(file);
                    if (!source.contains("String email")) continue;
                    assertThat(source).as(file.toString()).contains("UserInput.EMAIL_PATTERN", "UserInput.normalizeEmail(email)");
                }
            }
        }
    }
}
