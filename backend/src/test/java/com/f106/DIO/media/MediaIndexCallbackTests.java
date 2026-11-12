package com.f106.DIO.media;
import com.f106.DIO.media.config.MediaIndexMigrationConfiguration;
import com.f106.DIO.media.config.MediaIndexPreparation;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.callback.Callback;
import org.junit.jupiter.api.Test;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class MediaIndexCallbackTests {
    @Test void callbackStillPreparesIndexesWithCustomMigrationStrategy(){
        new ApplicationContextRunner().withUserConfiguration(MediaIndexMigrationConfiguration.class)
            .withBean(FlywayMigrationStrategy.class,()->Flyway::migrate).run(context->{
                assertThat(context).hasSingleBean(Callback.class).hasSingleBean(FlywayMigrationStrategy.class);
                var source=new DriverManagerDataSource("jdbc:h2:mem:index_callback;DB_CLOSE_DELAY=-1","sa","");
                var flyway=Flyway.configure().dataSource(source).defaultSchema("PUBLIC")
                    .locations("classpath:no-migrations-for-callback-test").callbacks(context.getBean(Callback.class)).load();
                try(var preparation=mockStatic(MediaIndexPreparation.class)){
                    context.getBean(FlywayMigrationStrategy.class).migrate(flyway);
                    preparation.verify(()->MediaIndexPreparation.prepare(source,"PUBLIC"),times(1));
                }
            });
    }
}
