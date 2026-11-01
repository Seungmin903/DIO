package com.f106.DIO.notification.invitation;

import java.sql.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import com.f106.DIO.notification.repository.NotificationRepository;
import com.f106.DIO.notification.service.*;
import com.f106.DIO.notification.controller.NotificationController;
import com.f106.DIO.notification.auth.NotificationUserPrincipal;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 실서버가 아닌 명시적으로 지정한 폐기용 PostgreSQL에서만 실행한다. */
@EnabledIfEnvironmentVariable(named="DIO_LOOKUP_PG", matches="true")
class SharedInvitationPostgresTests {
    @Test void migratedSchemaAndSpringWiringProduceRealInvitationList() throws Exception {
        String url=System.getenv("DIO_LOOKUP_PG_URL"), password=System.getenv("DIO_LOOKUP_PG_PASSWORD");
        if(url==null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) throw new IllegalStateException("격리 PostgreSQL URL 필요");
        String schema="lookup_"+UUID.randomUUID().toString().replace("-","");
        try {
            Flyway.configure().dataSource(url,"postgres",password).schemas(schema).defaultSchema(schema).load().migrate();
            try(var connection=DriverManager.getConnection(url,"postgres",password)) {
                connection.setSchema(schema);
                var jdbc=new JdbcTemplate(new SingleConnectionDataSource(connection,true));
                jdbc.update("insert into users(user_id,nickname,nickname_key) values(101,'recipient','recipient'),(102,'actor','actor')");
                UUID diary=UUID.randomUUID();
                jdbc.update("insert into diaries(diary_id,owner_user_id,title) values(?,102,'lookup QA')",diary);
                jdbc.update("insert into diary_invites(invite_id,diary_id,inviter_user_id,invitee_user_id,invite_type,token_hash,expires_at) values(10,?,102,101,'EMAIL',?,?)",diary,new byte[32],Timestamp.valueOf("9999-12-31 23:59:59"));
                for(int id=1;id<=100;id++) jdbc.update("insert into notifications(notification_id,user_id,diary_id,notification_type,payload_json) values(?,101,?,'DIARY_INVITE',cast(? as jsonb))",id,diary,"{\"inviteId\":\"10\"}");
                try(var context=new AnnotationConfigApplicationContext()) {
                    context.registerBean(JdbcTemplate.class,()->jdbc);
                    context.registerBean(NamedParameterJdbcTemplate.class,()->new NamedParameterJdbcTemplate(jdbc));
                    context.registerBean(ObjectMapper.class, () -> new ObjectMapper());
                    context.register(SharedInvitationLookup.class,NotificationRepository.class,NotificationService.class,NotificationDeleteService.class,NotificationController.class);
                    context.refresh();
                    assertThat(context.getBeansOfType(InvitationLookup.class)).hasSize(1);
                    var lookup=context.getBean(InvitationLookup.class);
                    assertThat(lookup.findForRecipient(101,java.util.stream.LongStream.rangeClosed(1,100).boxed().toList())).hasSize(100);
                    var mvc=MockMvcBuilders.standaloneSetup(context.getBean(NotificationController.class)).build();
                    NotificationUserPrincipal recipient=new NotificationUserPrincipal() { public long userId(){return 101L;} public String getName(){return "101";} };
                    mvc.perform(get("/api/v1/notifications").param("limit","100").principal(recipient))
                        .andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(100))
                        .andExpect(jsonPath("$.items[0].invitation.status").value("PENDING"))
                        .andExpect(jsonPath("$.items[0].invitation.canOpen").value(true));
                    for(var entry:Map.of("EMAIL_ACCEPTED","ACCEPTED","EMAIL_DECLINED","DECLINED","EMAIL_CANCELLED","CANCELLED","EMAIL_FAILED","DELIVERY_FAILED").entrySet()) {
                        jdbc.update("update diary_invites set invite_type=?",entry.getKey());
                        mvc.perform(get("/api/v1/notifications").principal(recipient)).andExpect(jsonPath("$.items[0].invitation.status").value(entry.getValue())).andExpect(jsonPath("$.items[0].invitation.canOpen").value(false));
                    }
                    assertThat(lookup.findForRecipient(102,List.of(1L))).isEmpty();
                    jdbc.update("update diary_invites set invite_type='EMAIL'");
                    jdbc.update("update notifications set payload_json='{}'::jsonb where notification_id=1");
                    assertThat(lookup.findForRecipient(101,List.of(1L))).isEmpty();
                    jdbc.update("update diaries set deleted_at=current_timestamp");
                    assertThat(lookup.findForRecipient(101,List.of(2L))).isEmpty();
                }
            }
        } finally {
            try(var c=DriverManager.getConnection(url,"postgres",password); var s=c.createStatement()) {s.execute("drop schema if exists "+schema+" cascade");}
        }
    }
}
