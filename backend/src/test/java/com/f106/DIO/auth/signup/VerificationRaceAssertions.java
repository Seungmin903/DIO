package com.f106.DIO.auth.signup;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** H2와 PostgreSQL에서 동일한 신규 이메일 경합 시나리오를 검증한다. */
public final class VerificationRaceAssertions {
    private VerificationRaceAssertions() {}
    public static void verify(MockMvc mvc, EmailVerificationRepository repository, SignupMailSender mail,
            EmailVerificationService service, jakarta.persistence.EntityManager entityManager, String email) throws Exception {
        var barrier = new CyclicBarrier(2);
        var code = new AtomicReference<String>();
        doAnswer(invocation -> {
            // 실제 행 잠금 쿼리를 실행한 직후 두 요청을 모아 INSERT 경합을 확정한다.
            Optional<EmailVerification> found = entityManager.createQuery(
                "select v from EmailVerification v where v.email = :email", EmailVerification.class)
                .setParameter("email", email).setLockMode(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
                .getResultList().stream().findFirst();
            if (found.isEmpty()) barrier.await(15, TimeUnit.SECONDS);
            return found;
        }).when(repository).findForUpdate(email);
        doAnswer(invocation -> { code.set(invocation.getArgument(1)); return null; }).when(mail).send(eq(email), anyString());
        var pool = Executors.newFixedThreadPool(2);
        try {
            var tasks = new ArrayList<Future<Integer>>();
            for (int i = 0; i < 2; i++) tasks.add(pool.submit(() -> {
                var response = mvc.perform(post("/api/v1/auth/email-verifications").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"" + email + "\"}")).andReturn().getResponse();
                if (response.getStatus() == 429) {
                    assertThat(response.getContentAsString()).contains("VERIFICATION_RATE_LIMITED");
                    assertThat(response.getHeader("Retry-After")).isEqualTo("60");
                }
                return response.getStatus();
            }));
            assertThat(List.of(tasks.get(0).get(30, TimeUnit.SECONDS), tasks.get(1).get(30, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(200, 429);
            org.mockito.Mockito.verify(mail, times(1)).send(eq(email), anyString());
            // 패자의 롤백이 승자의 인증번호를 덮어쓰거나 없애지 않는다.
            assertThat(service.verify(new SignupDtos.VerifyRequest(email, code.get())).signupToken()).isNotBlank();
        } finally {
            pool.shutdownNow();
            repository.deleteById(email);
        }
    }
}
