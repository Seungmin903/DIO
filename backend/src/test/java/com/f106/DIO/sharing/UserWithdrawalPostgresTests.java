package com.f106.DIO.sharing;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
@EnabledIfEnvironmentVariable(named="DIO_SHARING_POSTGRES_QA",matches="true")
class UserWithdrawalPostgresTests extends UserWithdrawalTests {
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){SharingPostgresTests.database(registry);}
}
