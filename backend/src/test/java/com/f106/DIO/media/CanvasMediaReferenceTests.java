package com.f106.DIO.media;
import com.f106.DIO.media.service.CanvasMediaAccess;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.util.UUID;
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
        assertThatThrownBy(()->new CanvasMediaAccess(jdbc,dialect).requireAttach(UUID.randomUUID(),primary,properties,1))
            .isInstanceOf(IllegalArgumentException.class);
        org.mockito.Mockito.verifyNoInteractions(jdbc,dialect);
    }
}
