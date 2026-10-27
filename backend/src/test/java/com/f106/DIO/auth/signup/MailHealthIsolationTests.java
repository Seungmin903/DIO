package com.f106.DIO.auth.signup;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:mail-health;MODE=PostgreSQL",
    "spring.mail.host=127.0.0.1", "spring.mail.port=1", "management.health.mail.enabled=false"})
@ActiveProfiles("test") @AutoConfigureMockMvc
class MailHealthIsolationTests {
    @Autowired MockMvc mvc;
    @Test void unavailableSmtpDoesNotMakeApplicationHealthFail() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
    }
}
