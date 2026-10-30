package com.f106.DIO.media.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods=false)
public class MediaIndexMigrationConfiguration {
    @Bean
    @ConditionalOnMissingBean(FlywayMigrationStrategy.class)
    FlywayMigrationStrategy mediaIndexMigrationStrategy(){
        return flyway->{
            var config=flyway.getConfiguration();String schema=config.getDefaultSchema();
            if(schema==null&&config.getSchemas().length>0)schema=config.getSchemas()[0];
            MediaIndexPreparation.prepare(config.getDataSource(),schema);
            flyway.migrate();
        };
    }
}
