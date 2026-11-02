package com.f106.DIO.user.integration;

import com.f106.DIO.user.config.TermsProperties;
import com.f106.DIO.user.domain.*;
import com.f106.DIO.user.dto.Agreement;
import com.f106.DIO.user.repository.*;
import com.f106.DIO.user.service.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;

/** Dedicated disposable database only; all test rows roll back. No developer DB fallback. */
@SpringBootTest(properties={"spring.flyway.enabled=true","spring.jpa.hibernate.ddl-auto=validate"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="DIO_TERMS_POSTGRES_TEST",matches="true")
class UserTermsPostgresTests {
 @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
  String url=System.getenv("DIO_TERMS_POSTGRES_URL");
  if(url==null||!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/dio_terms_qa_[a-z0-9_]+"))
   throw new IllegalStateException("Explicit dedicated dio_terms_qa_* database required");
  registry.add("spring.datasource.url",()->url);
  registry.add("spring.datasource.username",()->System.getenv("DIO_TERMS_POSTGRES_USER"));
  registry.add("spring.datasource.password",()->System.getenv("DIO_TERMS_POSTGRES_PASSWORD"));
 }
 @Autowired JdbcTemplate jdbc;
 @Autowired UserRepository users;
 @Autowired TermsAgreementRepository agreements;
 @Autowired UserTermsService signupTerms;
 @Autowired UserTermsUpdateService updates;
 @Autowired TermsProperties versions;
 @Test @Transactional void allKindsFitRealSchemaAndOptionalChoicesCanBeWithdrawn(){
  assertThat(jdbc.queryForObject("select character_maximum_length from information_schema.columns where table_schema='public' and table_name='user_terms_agreements' and column_name='terms_type'",Integer.class)).isGreaterThanOrEqualTo(17);
  var user=users.saveAndFlush(new User(UUID.randomUUID()+"@example.com","약관검증",Instant.now()));
  var input=Arrays.stream(TermsType.values()).map(type->new Agreement(type,
   type==TermsType.SERVICE?versions.serviceTermsVersion():type==TermsType.PRIVACY?versions.privacyTermsVersion():versions.marketingTermsVersion(),true)).toList();
  signupTerms.validate(input);signupTerms.save(user.getUserId(),input,Instant.now());
  assertThat(jdbc.queryForObject("select count(*) from user_terms_agreements where user_id=?",Long.class,user.getUserId())).isEqualTo(7);
  for(var type:List.of(TermsType.MARKETING_PRIVACY,TermsType.AD_EMAIL,TermsType.AD_PUSH,TermsType.AD_NIGHT_PUSH)){
   updates.update(user.getUserId(),type,versions.marketingTermsVersion(),false);agreements.flush();
   assertThat(jdbc.queryForObject("select agreed from user_terms_agreements where user_id=? and terms_type=?",Boolean.class,user.getUserId(),type.name())).isFalse();
  }
  assertThat(jdbc.queryForObject("select agreed from user_terms_agreements where user_id=? and terms_type='SERVICE'",Boolean.class,user.getUserId())).isTrue();
 }
}
