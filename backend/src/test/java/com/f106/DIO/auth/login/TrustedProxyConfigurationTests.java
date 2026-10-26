package com.f106.DIO.auth.login;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class TrustedProxyConfigurationTests {
    @Test void deployedProfilesRequireExplicitTrustedProxySetting() throws Exception {
        for (String profile : new String[] {"dev", "prod"}) {
            var environment = new MockEnvironment();
            for (var source : new YamlPropertySourceLoader().load(profile,
                    new ClassPathResource("application-" + profile + ".yml")))
                environment.getPropertySources().addLast(source);
            assertThatThrownBy(() -> environment.getRequiredProperty("server.tomcat.remoteip.internal-proxies"))
                .isInstanceOf(IllegalArgumentException.class);
            environment.setProperty("AUTH_TRUSTED_PROXY_REGEX", "172\\.20\\.0\\.2");
            assertThat(environment.getRequiredProperty("server.tomcat.remoteip.internal-proxies"))
                .isEqualTo("172\\.20\\.0\\.2");
        }
    }
}
