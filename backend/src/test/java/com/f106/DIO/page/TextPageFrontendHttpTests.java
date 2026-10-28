package com.f106.DIO.page;
import java.time.Instant;
import java.nio.file.Path;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.f106.DIO.user.domain.User;
import com.f106.DIO.user.repository.UserRepository;
import com.f106.DIO.auth.domain.EmailAuthProvider;
import com.f106.DIO.auth.repository.EmailAuthProviderRepository;
import static org.assertj.core.api.Assertions.assertThat;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties={"spring.datasource.url=jdbc:h2:mem:text-page-http;MODE=PostgreSQL","dio.auth.session-cleanup.enabled=false"})
@EnabledIfEnvironmentVariable(named="DIO_TEXT_SYNC_HTTP_QA", matches="true")
class TextPageFrontendHttpTests {
 @LocalServerPort int port;
 @Autowired UserRepository users;
 @Autowired EmailAuthProviderRepository accounts;
 @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
 @DynamicPropertySource static void secret(DynamicPropertyRegistry r) {byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);r.add("dio.auth.jwt-secret",()->Base64.getEncoder().encodeToString(key));}
 @Test void realEditorTextRoundTripAndConflictRecovery() throws Exception {
  jdbc.execute("create table if not exists diary_creation_receipts(user_id bigint,key_hash char(64),request_hash char(64),diary_id uuid,response_body jsonb,created_at timestamp(6) with time zone default current_timestamp,completed_at timestamp(6) with time zone,primary key(user_id,key_hash))");
  String email="text-http-qa@example.test";
  var user=users.saveAndFlush(new User(email,"Text QA",Instant.now()));
  accounts.saveAndFlush(new EmailAuthProvider(user.getUserId(),email,new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("DioMember123!"),Instant.now()));
  var process=new ProcessBuilder(System.getenv().getOrDefault("DIO_NODE_BINARY","node"),Path.of("../frontend/qa/text-page-sync-spring.mjs").toAbsolutePath().toString());
  process.environment().put("DIO_TEXT_SYNC_BASE","http://127.0.0.1:"+port+"/api/v1");process.environment().put("DIO_TEXT_SYNC_EMAIL",email);process.redirectErrorStream(true);
  var child=process.start();boolean done=child.waitFor(90,java.util.concurrent.TimeUnit.SECONDS);if(!done)child.destroyForcibly();assertThat(done).isTrue();String output=new String(child.getInputStream().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);assertThat(child.exitValue()).as(output).isZero();assertThat(output).contains("TEXT_PAGE_SPRING_HTTP_PASS");
 }
}
