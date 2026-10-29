package com.f106.DIO.collaboration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="DIO_COLLABORATION_POSTGRES_QA",matches="true")
class CanvasCollaborationPostgresTests extends CanvasCollaborationTests {
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
        String url=System.getenv("DIO_COLLABORATION_POSTGRES_URL"),password=System.getenv("DIO_COLLABORATION_POSTGRES_PASSWORD");
        if(url==null||!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/dio_collaboration_qa")||password==null||password.isBlank())throw new IllegalStateException("Explicit disposable dio_collaboration_qa required; no fallback");
        registry.add("spring.datasource.url",()->url);registry.add("spring.datasource.username",()->"postgres");registry.add("spring.datasource.password",()->password);
        registry.add("spring.jpa.hibernate.ddl-auto",()->"validate");registry.add("spring.flyway.enabled",()->"true");
    }
    @Test void concurrentDuplicateRequestsCommitOneOperation()throws Exception{
        var owner=actor();UUID page=page(diary(owner)),element=UUID.randomUUID(),client=UUID.randomUUID();
        var changes=Map.<String,Object>of("creates",List.of(text(element,"one")));var pool=Executors.newFixedThreadPool(2);var start=new CountDownLatch(1);
        try{
            var a=pool.submit(()->{start.await();return apply(page,owner,client,changes);});
            var b=pool.submit(()->{start.await();return apply(page,owner,client,changes);});start.countDown();
            assertThat(a.get(20,TimeUnit.SECONDS).path("operationId").asText()).isEqualTo(b.get(20,TimeUnit.SECONDS).path("operationId").asText());
            assertThat(jdbc.queryForObject("select count(*) from canvas_history_operations where page_id=?",Integer.class,page)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from canvas_elements where page_id=?",Integer.class,page)).isEqualTo(1);
        }finally{start.countDown();pool.shutdownNow();}
    }
}
