package com.f106.DIO.media;
import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import com.f106.DIO.media.support.MediaExceptionHandler;
import com.f106.DIO.media.support.MediaRequestException;
class MediaUploadBusyResponseTests {
 @Test void overloadReturnsRetryable503Problem() {
  var result=new MediaExceptionHandler().invalid(MediaRequestException.uploadBusy());
  assertThat(result.getStatusCode().value()).isEqualTo(503);assertThat(result.getHeaders().getFirst("Retry-After")).isEqualTo("1");
  assertThat(result.getBody().getProperties()).containsEntry("code","MEDIA_UPLOAD_BUSY");
 }
}
