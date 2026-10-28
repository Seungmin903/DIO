package com.f106.DIO.diary.http;

import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Actual PostgreSQL HTTP contract; only an explicitly disposable database is accepted. */
@EnabledIfEnvironmentVariable(named="DIO_MEMBER_PURGE_PG",matches="true")
class MemberDiaryPurgeContractPostgresTests extends MemberDiaryPurgeHttpTests {
    static JdbcTemplate admin;
    static String schema;
    @DynamicPropertySource static void database(DynamicPropertyRegistry r) {
        String url=System.getenv("DB_URL"),user=System.getenv("POSTGRES_USER"),password=System.getenv("POSTGRES_PASSWORD");
        if(url==null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/dio_trash_qa")) throw new IllegalStateException("Explicit disposable dio_trash_qa DB required");
        if(user==null || password==null) throw new IllegalStateException("Explicit test credentials required");
        schema="member_purge_contract_"+UUID.randomUUID().toString().replace("-","");
        admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));admin.execute("create schema "+schema);
        r.add("spring.datasource.url",()->url+"?currentSchema="+schema);
        r.add("spring.datasource.username",()->user);r.add("spring.datasource.password",()->password);
        r.add("spring.jpa.hibernate.ddl-auto",()->"none");r.add("spring.flyway.enabled",()->true);
        r.add("spring.flyway.default-schema",()->schema);r.add("spring.flyway.schemas",()->schema);
    }
    @AfterAll static void cleanup() { if(admin!=null && schema.matches("member_purge_contract_[0-9a-f]{32}")) admin.execute("drop schema "+schema+" cascade"); }
}
