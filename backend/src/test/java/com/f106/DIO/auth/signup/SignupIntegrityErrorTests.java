package com.f106.DIO.auth.signup;

import java.sql.SQLException;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.*;
import org.springframework.dao.DataIntegrityViolationException;
import static org.assertj.core.api.Assertions.*;

@ExtendWith(OutputCaptureExtension.class)
class SignupIntegrityErrorTests {
    private DataIntegrityViolationException violation(String state, String constraint) {
        var database = new SQLException("private@example.com private-hash", state);
        return new DataIntegrityViolationException("sensitive SQL values",
            new ConstraintViolationException("private SQL", database, constraint));
    }
    @Test void onlyKnownEmailAndNicknameUniqueConstraintsReturnConflict() {
        var handler = new SignupExceptionHandler();
        for (String name : new String[]{"users_email_unique", "users_nickname_key_unique"})
            assertThat(handler.conflict(violation("23505", name)).getStatus()).isEqualTo(409);
    }
    @Test void checkNullAndUnexpectedUniqueFailuresReturnServerErrorWithoutSensitiveLogs(CapturedOutput output) {
        var handler = new SignupExceptionHandler();
        for (var error : new DataIntegrityViolationException[]{violation("23514", "signup_profile_photo_location"),
                violation("23502", null), violation("23505", "unexpected_unique"),
                new DataIntegrityViolationException("private@example.com")}) {
            var response = handler.conflict(error);
            assertThat(response.getStatus()).isEqualTo(500);
            assertThat(response.getProperties().get("code")).isEqualTo("SIGNUP_PERSISTENCE_FAILED");
        }
        assertThat(output.getAll()).contains("Signup persistence failed", "23514", "signup_profile_photo_location")
            .doesNotContain("private@example.com", "private-hash", "sensitive SQL values", "private SQL");
    }
}
