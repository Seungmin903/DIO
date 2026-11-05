package com.f106.DIO.moderation;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.FileSystemResource;
import org.springframework.util.unit.DataSize;
import static org.assertj.core.api.Assertions.*;

class ReportUploadLimitConfigTests {
    @Test void reportOnlyLocationAllowsThreeImagesWithoutChangingOtherRoutes() throws Exception {
        var yaml=new YamlPropertiesFactoryBean();
        yaml.setResources(new FileSystemResource("src/main/resources/application.yml"));
        var properties=yaml.getObject();
        assertThat(DataSize.parse(properties.getProperty("spring.servlet.multipart.max-file-size")).toBytes()).isGreaterThanOrEqualTo(5L*1024*1024);
        assertThat(DataSize.parse(properties.getProperty("spring.servlet.multipart.max-request-size")).toBytes()).isGreaterThanOrEqualTo(16L*1024*1024);
        for(String profile:new String[]{"dev","prod"}){
            String config=Files.readString(Path.of("../infra/nginx",profile,"default.conf"));
            var report=Pattern.compile("location\\s*=\\s*/api/v1/reports\\s*\\{([^{}]*)}",Pattern.DOTALL).matcher(config);
            assertThat(report.find()).as("%s report exact location",profile).isTrue();
            assertThat(report.group(1)).contains("client_max_body_size 16m;","proxy_pass http://$backend_host:8080;",
                "proxy_set_header Host $host;","proxy_set_header X-Real-IP $remote_addr;",
                "proxy_set_header X-Forwarded-For $remote_addr;","proxy_set_header X-Forwarded-Proto $scheme;",
                "proxy_set_header X-Forwarded-Port "+(profile.equals("dev")?"8443":"443")+";");
            assertThat(report.find()).isFalse();
            String withoutReport=report.replaceAll("");
            var media=Pattern.compile("location\\s*=\\s*/api/v1/media\\s*\\{([^{}]*)}",Pattern.DOTALL).matcher(withoutReport);
            assertThat(media.find()).isTrue();assertThat(media.group(1)).contains("client_max_body_size 26m;");
            String defaults=media.replaceAll("");
            var remaining=Pattern.compile("client_max_body_size\\s+([^;]+);").matcher(defaults);
            assertThat(remaining.find()).isTrue();assertThat(remaining.group(1)).isEqualTo("6m");
            assertThat(remaining.find()).isFalse();
            if(profile.equals("dev"))assertThat(config).contains("auth_basic \"DIO Development\";","auth_basic_user_file /etc/nginx/conf.d/nginx-dev.htpasswd;");
        }
    }
}
