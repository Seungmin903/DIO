package com.f106.DIO.notification;

/** loopback H2 전용 브라우저 QA. 제품 계정·개발/운영 DB를 사용하지 않는다. */
public class NotificationBrowserQa {
    public static void main(String[] args) {
        if (!"true".equals(System.getenv("DIO_NOTIFICATION_BROWSER_QA"))) throw new IllegalStateException("Explicit browser QA opt-in required");
        System.setProperty("server.address", "127.0.0.1"); System.setProperty("server.port", "18565");
        System.setProperty("spring.datasource.url", "jdbc:h2:mem:notification-browser-qa;MODE=PostgreSQL");
        System.setProperty("spring.datasource.username", "sa"); System.setProperty("spring.datasource.password", "");
        System.setProperty("spring.flyway.enabled", "false"); System.setProperty("spring.jpa.hibernate.ddl-auto", "create-drop");
        System.setProperty("dio.auth.session-cleanup.enabled", "false"); System.setProperty("dio.auth.development-token-header", "");
        System.setProperty("AUTH_ALLOWED_ORIGINS", "http://127.0.0.1:18566");
        byte[] secret=new byte[32]; new java.security.SecureRandom().nextBytes(secret);
        System.setProperty("dio.auth.jwt-secret", java.util.Base64.getEncoder().encodeToString(secret));
        var app = new org.springframework.boot.SpringApplication(com.f106.DIO.DioApplication.class);
        app.setAdditionalProfiles("test");
        var context=app.run();
        var users=context.getBean(com.f106.DIO.user.repository.UserRepository.class);
        var accounts=context.getBean(com.f106.DIO.auth.repository.EmailAuthProviderRepository.class);
        var jdbc=context.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        jdbc.execute("create table notifications(notification_id bigint primary key,user_id bigint,actor_user_id bigint,diary_id uuid,page_id uuid,notification_type varchar(50),read_at timestamp(6) with time zone,deleted_at timestamp(6) with time zone,created_at timestamp(6) with time zone not null)");
        for(int i=1;i<=2;i++) {
            var user=users.saveAndFlush(new com.f106.DIO.user.domain.User("notification-qa"+i+"@example.test", "알림QA"+i, java.time.Instant.now()));
            accounts.saveAndFlush(new com.f106.DIO.auth.domain.EmailAuthProvider(user.getUserId(),user.getEmail(),
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4).encode("DioMember123!"),java.time.Instant.now()));
            jdbc.update("insert into notifications(notification_id,user_id,notification_type,created_at) values (?,?,?,current_timestamp)",i,user.getUserId(),"NOTICE");
        }
        System.out.println("NOTIFICATION_QA_READY loopback-only H2 fixture");
    }
}
