package com.f106.DIO.push.service;

import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class PushConfigurationTests {
    @Test void missingEnvironmentRejectsKeyConfiguredOperations() {
        var service=new PushInstallationService(null,null,Base64.getEncoder().encodeToString(new byte[32]),"","dio");
        assertThatThrownBy(service::secrets).isInstanceOf(ResponseStatusException.class)
            .satisfies(e->assertThat(((ResponseStatusException)e).getStatusCode().value()).isEqualTo(503));
    }
}
