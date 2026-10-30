package com.f106.DIO.font;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class FontDownloadAdmissionTests {
    @Test void rejectsBeforeServiceAndRestoresPermit() {
        var admission = new FontDownloadAdmission(1, 0, 0);
        var service = mock(FontService.class);
        var controller = new FontController(service, admission);
        var diary = UUID.randomUUID(); var file = UUID.randomUUID();
        var permit = admission.tryAcquire();
        assertThat(permit).isNotNull();
        var response = controller.file(diary, file);
        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("1");
        verifyNoInteractions(service);
        permit.close(); permit.close();
        when(service.download(diary, file)).thenReturn(new FontService.Download(new byte[]{1}, "font/ttf"));
        assertThat(controller.file(diary, file).getStatusCode().value()).isEqualTo(200);
        var acquired = admission.tryAcquire();
        assertThat(acquired).isNotNull();
        acquired.close();
    }

    @Test void releasesPermitWhenDownloadFails() {
        var admission = new FontDownloadAdmission(1, 0, 0);
        var service = mock(FontService.class);
        var controller = new FontController(service, admission);
        var diary = UUID.randomUUID(); var file = UUID.randomUUID();
        when(service.download(diary, file)).thenThrow(new IllegalStateException());
        assertThatThrownBy(() -> controller.file(diary, file)).isInstanceOf(IllegalStateException.class);
        var acquired = admission.tryAcquire();
        assertThat(acquired).isNotNull();
        acquired.close();
    }
}
