package com.f106.DIO.auth.login;

import com.f106.DIO.auth.signup.SignupMailSender;
import java.net.URI;
import java.net.http.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:proxy-tests;MODE=PostgreSQL",
    "dio.auth.development-token-header=X-DIO-Access-Token",
    "server.forward-headers-strategy=native",
    "server.tomcat.remoteip.internal-proxies=127\\.0\\.0\\.1|::1",
    "server.tomcat.remoteip.remote-ip-header=X-Forwarded-For"
})
@ActiveProfiles("test")
class AuthProxyTests {
    @org.springframework.test.context.DynamicPropertySource
    static void key(org.springframework.test.context.DynamicPropertyRegistry registry) {
        EmailLoginTests.temporaryJwtKey(registry);
    }
    @LocalServerPort int port;
    @MockitoBean SignupMailSender mail;
    @MockitoBean LoginThrottle throttle;
    @Test void proxyClientsHaveSeparateLoginThrottleKeys() throws Exception {
        var client = HttpClient.newHttpClient();
        for (String ip : new String[]{"198.51.100.10", "198.51.100.20"}) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/auth/login"))
                .header("Content-Type", "application/json").header("X-Forwarded-For", ip)
                .POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"unknown@example.com\",\"password\":\"DioMember123!\"}")).build();
            assertEquals(401, client.send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
            verify(throttle).reserve("unknown@example.com", ip);
        }
    }
    @Test void basicCredentialsAndUnverifiedAuxiliaryTokenCannotLogOut() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/auth/logout"))
            .header("Authorization", "Basic ZGV2OmRldg==").header("X-DIO-Access-Token", "invalid-token")
            .POST(HttpRequest.BodyPublishers.noBody()).build();
        assertEquals(401, HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString()).statusCode());
    }
}
