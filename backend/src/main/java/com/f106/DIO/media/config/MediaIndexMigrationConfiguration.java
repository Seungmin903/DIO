package com.f106.DIO.media.config;

import org.flywaydb.core.api.callback.BaseCallback;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods=false)
public class MediaIndexMigrationConfiguration {
    /** Registered independently of custom FlywayMigrationStrategy beans. */
    @Bean
    Callback mediaIndexPreparationCallback(){
        return new BaseCallback(){
            @Override public boolean supports(Event event,Context context){return event==Event.BEFORE_MIGRATE;}
            @Override public boolean canHandleInTransaction(Event event,Context context){return false;}
            @Override public void handle(Event event,Context context){
                var config=context.getConfiguration();String schema=config.getDefaultSchema();
                if(schema==null&&config.getSchemas().length>0)schema=config.getSchemas()[0];
                MediaIndexPreparation.prepare(config.getDataSource(),schema);
            }
        };
    }
}
