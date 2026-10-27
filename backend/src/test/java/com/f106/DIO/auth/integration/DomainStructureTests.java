package com.f106.DIO.auth.integration;

import com.f106.DIO.auth.controller.EmailVerificationController;
import com.f106.DIO.auth.controller.SignupController;
import com.f106.DIO.user.controller.UserController;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.domain.ProfilePhoto;
import jakarta.persistence.Table;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class DomainStructureTests {
    @Test void userDomainDoesNotDependOnAuthenticationAndEntitiesDoNotDependOnDtoOrStorage() throws Exception {
        Path base = Path.of("src/main/java/com/f106/DIO");
        try (var files = Files.walk(base.resolve("user"))) {
            for (var file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                assertThat(Files.readString(file)).as(file.toString()).doesNotContain("import com.f106.DIO.auth.");
            }
        }
        for (String domain : new String[]{"auth", "user"}) {
            try (var files = Files.list(base.resolve(domain).resolve("domain"))) {
                for (var file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                    assertThat(Files.readString(file)).as(file.toString())
                        .doesNotContain(".dto.", ".infrastructure.", ".controller.");
                }
            }
        }
    }
    @Test void existingTableNamesAndControllerBoundariesArePreserved() {
        assertThat(User.class.getAnnotation(Table.class).name()).isEqualTo("users");
        assertThat(ProfilePhoto.class.getAnnotation(Table.class).name()).isEqualTo("signup_profile_photos");
        assertThat(SignupController.class.getPackageName()).isEqualTo("com.f106.DIO.auth.controller");
        assertThat(EmailVerificationController.class.getPackageName()).isEqualTo("com.f106.DIO.auth.controller");
        assertThat(UserController.class.getPackageName()).isEqualTo("com.f106.DIO.user.controller");
    }
}
