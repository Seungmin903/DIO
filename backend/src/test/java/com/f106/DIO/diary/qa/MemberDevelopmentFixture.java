package com.f106.DIO.diary.qa;

/** 작업 전용 로컬 DB의 자동 UI 검증 계정. 앱 jar에는 포함되지 않는다. */
public final class MemberDevelopmentFixture {
    public static void main(String[] args) throws Exception {
        String url=System.getenv("DB_URL"),email=System.getenv("DIO_MEMBER_QA_EMAIL"),password=System.getenv("DIO_MEMBER_QA_PASSWORD");
        if(!"true".equals(System.getenv("DIO_MEMBER_OWNED_DATABASE")) || url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_member_app")
            || !"member-app-qa@example.test".equals(email) || password==null || password.length()<16) throw new IllegalStateException("Dedicated local QA database required");
        String hash=new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode(password);
        try(var connection=java.sql.DriverManager.getConnection(url,System.getenv("POSTGRES_USER"),System.getenv("POSTGRES_PASSWORD"))) {
            connection.setAutoCommit(false);
            try(var user=connection.prepareStatement("insert into users(email,nickname,nickname_key) values(?,'회원 연결 QA','member-app-qa') on conflict(email) do nothing")) {
                user.setString(1,email); user.executeUpdate();
            }
            long id;
            try(var user=connection.prepareStatement("select user_id from users where email=?")) {
                user.setString(1,email); try(var rows=user.executeQuery()) { rows.next(); id=rows.getLong(1); }
            }
            try(var account=connection.prepareStatement("insert into user_auth_accounts(user_id,provider,provider_subject,password_hash) values(?,'EMAIL',?,?) on conflict(provider,provider_subject) do update set password_hash=excluded.password_hash")) {
                account.setLong(1,id); account.setString(2,email); account.setString(3,hash); account.executeUpdate();
            }
            connection.commit();
        }
        System.out.println("Dedicated member QA account ready (credentials kept in ignored runtime file).");
    }
}
