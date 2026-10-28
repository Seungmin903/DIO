package com.f106.DIO.notification;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.boot.test.context.SpringBootTest
@org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc(addFilters = false)
@org.springframework.test.context.TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:notificationreadallhttp;MODE=PostgreSQL",
    "spring.jpa.hibernate.ddl-auto=none", "spring.sql.init.mode=always",
    "spring.sql.init.schema-locations=classpath:notification-core-h2.sql,classpath:notification-watermark-h2.sql"
})
@org.springframework.transaction.annotation.Transactional
class NotificationReadAllHttpTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @BeforeEach void setup() {
        jdbc.update("insert into users(user_id,nickname) values (81001,'owner'),(81002,'other')");
        jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at) values (90001,81001,'DIARY_INVITE',CURRENT_TIMESTAMP)");
    }
    @Test void authenticatedSnapshotIsScopedAndRetryIsIdempotent() throws Exception {
        mvc.perform(post("/api/v1/notifications/read-watermarks")).andExpect(status().isUnauthorized());
        var response = mvc.perform(post("/api/v1/notifications/read-watermarks").principal(NotificationCoreApiTests.user(81001)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.expiresAt").isNotEmpty()).andReturn().getResponse().getContentAsString();
        var token = response.replaceFirst("(?s).*\"readWatermark\":\"([^\"]+)\".*", "$1");
        var body = "{\"readWatermark\":\"" + token + "\"}";
        mvc.perform(post("/api/v1/notifications/read-all").principal(NotificationCoreApiTests.user(81002)).contentType("application/json").content(body))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_READ_WATERMARK"));
        mvc.perform(post("/api/v1/notifications/read-all").principal(NotificationCoreApiTests.user(81001)).contentType("application/json").content(body)).andExpect(status().isNoContent());
        var first = jdbc.queryForObject("select read_at from notifications where notification_id=90001", java.sql.Timestamp.class);
        mvc.perform(post("/api/v1/notifications/read-all").principal(NotificationCoreApiTests.user(81001)).contentType("application/json").content(body)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select read_at from notifications where notification_id=90001", java.sql.Timestamp.class)).isEqualTo(first).isNotNull();
        mvc.perform(post("/api/v1/notifications/read-all").principal(NotificationCoreApiTests.user(81001)).contentType("application/json").content("{}"))
            .andExpect(status().isBadRequest());
    }
}
