package com.f106.DIO.notification;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.f106.DIO.notification.invitation.InvitationLookup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 실제 Spring 직렬화/예외 처리/OpenAPI를 FE 소비자 테스트로 전달한다. JWT·watermark 제외. */
@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:notificationfrontend;MODE=PostgreSQL",
    "spring.jpa.hibernate.ddl-auto=none",
    "spring.sql.init.mode=always", "spring.sql.init.schema-locations=classpath:notification-core-h2.sql,classpath:notification-watermark-h2.sql"
})
@Transactional
class NotificationFrontendContractTests {
    @org.springframework.beans.factory.annotation.Autowired org.springframework.test.web.servlet.MockMvc mvc;
    @org.springframework.beans.factory.annotation.Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    static final long USER = 81001, OTHER = 81002;
    static final java.time.Instant AT = java.time.Instant.parse("2026-10-26T00:00:00.123456Z");
    static final java.util.UUID EVENT_DIARY = java.util.UUID.fromString("dd000000-0000-0000-0000-000000000001");
    @MockitoBean InvitationLookup lookup;

    static com.f106.DIO.notification.auth.NotificationUserPrincipal user(long id) {
        return new com.f106.DIO.notification.auth.NotificationUserPrincipal() {
            public long userId() { return id; }
            public String getName() { return "contract-test-principal"; }
        };
    }
    void add(long id, long recipient, java.time.Instant at, boolean read, boolean deleted) {
        jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at,read_at,deleted_at) values (?,?,?,?,?,?)",
            id, recipient, "DIARY_INVITE", java.sql.Timestamp.from(at), read ? java.sql.Timestamp.from(at) : null, deleted ? java.sql.Timestamp.from(at) : null);
    }

    @Test
    void exportsActualSpringResponsesForFrontend() throws Exception {
        jdbc.update("insert into users(user_id,nickname) values (?,?), (?,?)", USER, "contract-user", OTHER, "other-user");
        add(90001, USER, AT, false, false);
        add(90002, USER, AT, true, false);
        add(90003, USER, AT.plusSeconds(1), false, false);
        add(90005, OTHER, AT, false, false);
        long big = 9007199254740993L;
        add(big, USER, AT.plusSeconds(10), false, false);
        when(lookup.findForRecipient(org.mockito.ArgumentMatchers.eq(USER), org.mockito.ArgumentMatchers.anyCollection()))
            .thenReturn(Map.of(big, new InvitationLookup.InvitationTarget("invite-1", "PENDING", EVENT_DIARY, true),
                90003L, new InvitationLookup.InvitationTarget("invite-2", "PENDING", EVENT_DIARY, false)));
        var cases = new ArrayList<String>();
        String first = capture(cases, "first", get("/api/v1/notifications").param("limit", "2").principal(user(USER)), 200);
        assertThat(first).contains("\"notificationId\":\"9007199254740993\"");
        String cursor = first.replaceFirst("(?s).*\"nextCursor\":\"([^\"]+)\".*", "$1");
        capture(cases, "last", get("/api/v1/notifications").param("limit", "2").param("cursor", cursor).principal(user(USER)), 200);
        capture(cases, "empty", get("/api/v1/notifications").principal(user(81999)), 200);
        capture(cases, "count", get("/api/v1/notifications/unread-count").principal(user(USER)), 200);
        capture(cases, "read", patch("/api/v1/notifications/90001").principal(user(USER)), 200);
        capture(cases, "delete", delete("/api/v1/notifications/90001").principal(user(USER)), 204);
        capture(cases, "deleteAgain", delete("/api/v1/notifications/90001").principal(user(USER)), 204);
        capture(cases, "notFound", patch("/api/v1/notifications/90005").principal(user(USER)), 404);
        capture(cases, "unauthorized", get("/api/v1/notifications"), 401);
        capture(cases, "invalidLimit", get("/api/v1/notifications").param("limit", "0").principal(user(USER)), 400);
        capture(cases, "invalidType", get("/api/v1/notifications").param("limit", "abc").principal(user(USER)), 400);
        capture(cases, "invalidCursor", get("/api/v1/notifications").param("cursor", "invalid!").principal(user(USER)), 400);
        capture(cases, "unauthorizedCount", get("/api/v1/notifications/unread-count"), 401);
        capture(cases, "unauthorizedRead", patch("/api/v1/notifications/90003"), 401);
        capture(cases, "unauthorizedDelete", delete("/api/v1/notifications/90003"), 401);
        capture(cases, "missingRead", patch("/api/v1/notifications/99999").principal(user(USER)), 404);
        capture(cases, "deletedRead", patch("/api/v1/notifications/90001").principal(user(USER)), 404);
        capture(cases, "notFoundDelete", delete("/api/v1/notifications/90005").principal(user(USER)), 404);
        capture(cases, "invalidReadId", patch("/api/v1/notifications/abc").principal(user(USER)), 400);
        capture(cases, "overflowDeleteId", delete("/api/v1/notifications/999999999999999999999").principal(user(USER)), 400);
        capture(cases, "invalidDeleteId", delete("/api/v1/notifications/abc").principal(user(USER)), 400);
        capture(cases, "overflowReadId", patch("/api/v1/notifications/999999999999999999999").principal(user(USER)), 400);
        capture(cases, "oldRead", patch("/api/v1/notifications/90003/read").principal(user(USER)), 404);
        String prepared = capture(cases, "prepareReadAll", post("/api/v1/notifications/read-watermarks").principal(user(USER)), 201);
        String watermark = prepared.replaceFirst("(?s).*\"readWatermark\":\"([^\"]+)\".*", "$1");
        capture(cases, "readAll", post("/api/v1/notifications/read-all").principal(user(USER)).contentType("application/json").content("{\"readWatermark\":\"" + watermark + "\"}"), 204);
        String openapi = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String output = System.getenv("DIO_NOTIFICATION_CONTRACT_OUTPUT");
        if (output != null && !output.isBlank()) {
            Path path = Path.of(output).toAbsolutePath(); Files.createDirectories(path.getParent());
            Files.writeString(path, "{\"producer\":\"Spring MockMvc/H2\",\"cases\":{"
                + String.join(",", cases) + "},\"openapi\":" + openapi + "}");
        }
    }

    private String capture(ArrayList<String> cases, String name, MockHttpServletRequestBuilder request, int expected) throws Exception {
        var response = mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse();
        String body = response.getContentAsString();
        if (expected == 204) assertThat(body).isEmpty();
        String contentType = response.getContentType();
        cases.add("\"" + name + "\":{\"status\":" + response.getStatus() + ",\"contentType\":"
            + (contentType == null ? "null" : "\"" + contentType + "\"") + ",\"body\":" + (body.isBlank() ? "null" : body) + "}");
        return body;
    }
}
