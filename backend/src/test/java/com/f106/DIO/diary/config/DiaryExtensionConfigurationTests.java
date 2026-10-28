package com.f106.DIO.diary.config;

import com.f106.DIO.diary.auth.DiaryRequestIdentity;
import com.f106.DIO.diary.creation.*;
import com.f106.DIO.diary.detail.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurationExcludeFilter;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class DiaryExtensionConfigurationTests {
    @TestConfiguration(proxyBeanMethods=false)
    @ComponentScan(basePackages={"com.f106.DIO.diary.creation","com.f106.DIO.diary.detail"},
        useDefaultFilters=false,
        includeFilters=@ComponentScan.Filter(type=FilterType.ASSIGNABLE_TYPE,classes={DiaryCreationConfiguration.class,DiaryDetailConfiguration.class}),
        excludeFilters=@ComponentScan.Filter(type=FilterType.CUSTOM,classes=AutoConfigurationExcludeFilter.class))
    @ImportAutoConfiguration({DiaryCreationConfiguration.class,DiaryDetailConfiguration.class})
    static class ScannedDefaults {}

    @TestConfiguration(proxyBeanMethods=false)
    static class Dependencies {
        @Bean JdbcTemplate jdbc() { return mock(JdbcTemplate.class); }
        @Bean MemberDiaryCreationRepository repository() { return mock(MemberDiaryCreationRepository.class); }
        @Bean DiaryRequestIdentity requestIdentity() { return mock(DiaryRequestIdentity.class); }
    }
    @TestConfiguration(proxyBeanMethods=false)
    static class CustomImplementations {
        @Bean DiaryCreationIdentity customCreationIdentity() { return () -> 42L; }
        @Bean DiaryDetailIdentity customDetailIdentity() { return () -> 42L; }
        @Bean DiaryInitialPages customInitialPages() { return mock(DiaryInitialPages.class); }
        @Bean DiaryOwnerMembershipWriter customOwnerWriter() { return mock(DiaryOwnerMembershipWriter.class); }
    }

    @Test void defaultsProvideExactlyOneImplementationForEachExtension() {
        new ApplicationContextRunner().withUserConfiguration(ScannedDefaults.class,Dependencies.class).run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(DiaryCreationIdentity.class)
                .hasSingleBean(DiaryDetailIdentity.class).hasSingleBean(DiaryInitialPages.class)
                .hasSingleBean(DiaryOwnerMembershipWriter.class);
            assertThat(context.getBean(DiaryInitialPages.class)).isInstanceOf(JdbcDiaryInitialPages.class);
        });
    }
    @Test void customImplementationsRegisteredAfterScannedDefaultsReplaceEachDefault() {
        assertCustom(ScannedDefaults.class,Dependencies.class,CustomImplementations.class);
    }
    @Test void customImplementationsRegisteredBeforeScannedDefaultsReplaceEachDefault() {
        assertCustom(CustomImplementations.class,ScannedDefaults.class,Dependencies.class);
    }
    private void assertCustom(Class<?>... configurations) {
        new ApplicationContextRunner().withUserConfiguration(configurations).run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(DiaryCreationIdentity.class)
                .hasSingleBean(DiaryDetailIdentity.class).hasSingleBean(DiaryInitialPages.class)
                .hasSingleBean(DiaryOwnerMembershipWriter.class);
            assertThat(context.getBean(DiaryCreationIdentity.class)).isSameAs(context.getBean("customCreationIdentity"));
            assertThat(context.getBean(DiaryDetailIdentity.class)).isSameAs(context.getBean("customDetailIdentity"));
            assertThat(context.getBean(DiaryInitialPages.class)).isSameAs(context.getBean("customInitialPages"));
            assertThat(context.getBean(DiaryOwnerMembershipWriter.class)).isSameAs(context.getBean("customOwnerWriter"));
        });
    }
}
