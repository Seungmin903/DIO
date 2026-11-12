package com.f106.DIO.sharing;

import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Opt-in only, disposable loopback database; executes the same service/HTTP/race contract after real Flyway. */
@EnabledIfEnvironmentVariable(named="DIO_INVENTORY_POSTGRES_QA",matches="true")
class InventoryPolicyPostgresTests extends InventoryPolicyTests {
    @org.springframework.beans.factory.annotation.Autowired com.f106.DIO.media.repository.MediaFileRepository mediaFiles;
    @DynamicPropertySource static void database(DynamicPropertyRegistry registry){
        String url=System.getenv("DIO_INVENTORY_POSTGRES_URL");
        if(url==null||!url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/dio_inventory_qa"))
            throw new IllegalStateException("Disposable loopback dio_inventory_qa required; no fallback");
        registry.add("spring.datasource.url",()->url);
        registry.add("spring.datasource.username",()->"postgres");
        registry.add("spring.datasource.password",()->System.getenv("DIO_INVENTORY_POSTGRES_PASSWORD"));
        registry.add("spring.jpa.hibernate.ddl-auto",()->"validate");
        registry.add("spring.flyway.enabled",()->"true");
    }
    @org.junit.jupiter.api.Test void hiddenPhotoCleanupPreservesReferencedOriginalUntilReferenceIsRemoved(){
        var user=actor();var book=diary(user);var image=media(user,"PHOTO");
        jdbc.update("update media_files set library_removed_at=current_timestamp-interval '31 days' where media_file_id=?",image);
        jdbc.update("update diaries set cover_json=? where diary_id=?","{\"kind\":\"photo\",\"photo\":{\"mediaFileId\":\""+image+"\"}}",book);
        var cutoff=java.time.Instant.now().minus(java.time.Duration.ofDays(30));
        org.assertj.core.api.Assertions.assertThat(mediaFiles.deletePhysicallyIfDeletable(image,cutoff)).isZero();
        jdbc.update("update diaries set cover_json=null where diary_id=?",book);
        org.assertj.core.api.Assertions.assertThat(mediaFiles.findPhysicallyDeletable(cutoff,org.springframework.data.domain.PageRequest.of(0,1000)))
            .extracting(com.f106.DIO.media.domain.MediaFile::getMediaFileId).contains(image);
        org.assertj.core.api.Assertions.assertThat(mediaFiles.deletePhysicallyIfDeletable(image,cutoff)).isEqualTo(1);
    }
}
