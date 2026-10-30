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
}
