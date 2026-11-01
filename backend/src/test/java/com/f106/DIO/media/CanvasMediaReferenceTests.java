package com.f106.DIO.media;
import com.f106.DIO.media.service.CanvasMediaAccess;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.UUID;
import java.util.List;
import java.sql.ResultSet;
import org.springframework.jdbc.core.RowMapper;
import static org.assertj.core.api.Assertions.*;
class CanvasMediaReferenceTests {
    private final JsonMapper json=JsonMapper.builder().build();
    @Test void allNestedDeclaredIdsAreValidatedRegardlessOfRenderingPath(){
        var first=UUID.randomUUID();var second=UUID.randomUUID();var third=UUID.randomUUID();var primary=UUID.randomUUID();
        var properties=json.readTree("{\"mediaFileId\":\""+first+"\",\"cells\":[null,{\"mediaFileId\":\""+second+"\"}],\"x\":[{\"inside\":{\"mediaFileId\":\""+third+"\"}}]}");
        assertThat(CanvasMediaAccess.references(primary,properties)).containsExactlyInAnyOrder(primary,first,second,third);
    }
    @Test void nestedInvalidIdsAreRejectedAndUuidTextIsNotAReference(){
        assertThatThrownBy(()->CanvasMediaAccess.references(null,json.readTree("{\"x\":{\"mediaFileId\":\"invalid\"}}"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->CanvasMediaAccess.references(null,json.readTree("{\"x\":{\"mediaFileId\":\"1-1-1-1-1\"}}"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(CanvasMediaAccess.references(null,json.readTree("{\"text\":\""+UUID.randomUUID()+"\",\"x\":{\"mediaFileId\":null}}"))).isEmpty();
    }
    @Test void referenceLimitIsCheckedBeforeAnyDatabaseLock(){
        var properties=json.createObjectNode();var cells=properties.putArray("cells");
        for(int i=0;i<63;i++)cells.addObject().put("mediaFileId",UUID.randomUUID().toString());
        var primary=UUID.randomUUID();
        cells.addObject().put("mediaFileId",primary.toString());
        assertThat(CanvasMediaAccess.references(primary,properties)).hasSize(64);
        cells.addObject().put("mediaFileId",UUID.randomUUID().toString());
        var jdbc=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var dialect=org.mockito.Mockito.mock(com.f106.DIO.media.config.MediaSqlDialect.class);
        // primary(1) + cells의 서로 다른 64개 = 65개이므로, 첨부 경로도 DB 조회 전에 거절해야 한다.
        assertThatThrownBy(()->new CanvasMediaAccess(jdbc,dialect).requireAttach(UUID.randomUUID(),primary,properties,1))
            .isInstanceOf(IllegalArgumentException.class);
        org.mockito.Mockito.verifyNoInteractions(jdbc,dialect);
    }
    @Test void pdfSourceIsAuthorizedAndVisibleToAnotherDiaryMember() throws Exception {
        var pdf=UUID.randomUUID();
        var properties=json.readTree("{\"pdfSource\":{\"mediaFileId\":\""+pdf+"\",\"pageIndex\":0,\"edge\":3000}}");
        var jdbc=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var dialect=org.mockito.Mockito.mock(com.f106.DIO.media.config.MediaSqlDialect.class);
        var access=new CanvasMediaAccess(jdbc,dialect);
        org.mockito.Mockito.when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("media_type=?"), org.mockito.ArgumentMatchers.eq(Long.class), org.mockito.ArgumentMatchers.eq(pdf), org.mockito.ArgumentMatchers.eq("DOCUMENT")))
            .thenReturn(List.of(1L));

        access.requireAttach(UUID.randomUUID(),null,properties,1L);

        var result=org.mockito.Mockito.mock(ResultSet.class);
        org.mockito.Mockito.when(result.getObject(1,UUID.class)).thenReturn(null);
        org.mockito.Mockito.when(result.getString(2)).thenReturn(properties.toString());
        org.mockito.Mockito.when(dialect.parameter(pdf)).thenReturn(pdf);
        org.mockito.Mockito.when(dialect.matches("e.properties_json")).thenReturn("true");
		org.mockito.Mockito.doAnswer(call -> List.of(call.<RowMapper<Boolean>>getArgument(1).mapRow(result, 0)))
			.when(jdbc).query(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.<RowMapper<Boolean>>any(),
				org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        assertThat(access.readable(pdf,2L)).isTrue();
    }
    @Test void imageSlotsRequireImageMediaAndCannotReuseAPdfSourceId(){
        var imageSlot=UUID.randomUUID();
        var pdf=UUID.randomUUID();
        var jdbc=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var dialect=org.mockito.Mockito.mock(com.f106.DIO.media.config.MediaSqlDialect.class);
        var access=new CanvasMediaAccess(jdbc,dialect);
        var imageProperties=json.readTree("{\"mediaFileId\":\""+imageSlot+"\"}");

        org.mockito.Mockito.when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("media_type=?"), org.mockito.ArgumentMatchers.eq(Long.class), org.mockito.ArgumentMatchers.eq(imageSlot), org.mockito.ArgumentMatchers.eq("IMAGE")))
            .thenReturn(java.util.List.of(1L));
        assertThatCode(()->access.requireAttach(UUID.randomUUID(),null,imageProperties,1L)).doesNotThrowAnyException();

        var conflicting=json.readTree("{\"mediaFileId\":\""+pdf+"\",\"pdfSource\":{\"mediaFileId\":\""+pdf+"\"}}");
        assertThatThrownBy(()->access.requireAttach(UUID.randomUUID(),null,conflicting,1L)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void pdfSourceIsOnlyAllowedAsOneTopLevelObjectSlot(){
        var pdf=UUID.randomUUID();
        for(String raw:java.util.List.of(
            "{\"cells\":[{\"pdfSource\":{\"mediaFileId\":\""+pdf+"\"}}]}",
            "{\"pdfSource\":[{\"mediaFileId\":\""+pdf+"\"}]}",
            "{\"pdfSource\":{\"nested\":{\"pdfSource\":{\"mediaFileId\":\""+pdf+"\"}}}}",
            "{\"x\":{\"pdfSource\":{\"mediaFileId\":\""+pdf+"\"}}}")) {
            var properties=json.readTree(raw);
            assertThatThrownBy(()->CanvasMediaAccess.references(null,properties)).isInstanceOf(IllegalArgumentException.class);
            var jdbc=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
            assertThatThrownBy(()->new CanvasMediaAccess(jdbc,org.mockito.Mockito.mock(com.f106.DIO.media.config.MediaSqlDialect.class)).requireAttach(UUID.randomUUID(),null,properties,1L))
                .isInstanceOf(IllegalArgumentException.class);
            org.mockito.Mockito.verifyNoInteractions(jdbc);
        }
    }
    @Test void nestedPdfSourceMediaIdsRemainAuthorizedAsImageReferences(){
        var pdf=UUID.randomUUID();
        var nestedImage=UUID.randomUUID();
        var properties=json.readTree("{\"pdfSource\":{\"mediaFileId\":\""+pdf+"\",\"x\":{\"mediaFileId\":\""+nestedImage+"\"}}}");
        var jdbc=org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var access=new CanvasMediaAccess(jdbc,org.mockito.Mockito.mock(com.f106.DIO.media.config.MediaSqlDialect.class));
        org.mockito.Mockito.when(jdbc.queryForList(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(Long.class),org.mockito.ArgumentMatchers.eq(pdf),org.mockito.ArgumentMatchers.eq("DOCUMENT"))).thenReturn(java.util.List.of(1L));
        org.mockito.Mockito.when(jdbc.queryForList(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(Long.class),org.mockito.ArgumentMatchers.eq(nestedImage),org.mockito.ArgumentMatchers.eq("IMAGE"))).thenReturn(java.util.List.of(1L));
        assertThatCode(()->access.requireAttach(UUID.randomUUID(),null,properties,1L)).doesNotThrowAnyException();
    }
}
