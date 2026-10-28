package com.f106.DIO.user.config;

import com.f106.DIO.user.infrastructure.storage.S3ProfilePhotoStorage;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration(proxyBeanMethods = false)
public class ProfilePhotoStorageConfig {
    @Bean(destroyMethod = "close")
    @ConditionalOnProperty(name = "dio.signup.photos.storage", havingValue = "s3")
    public S3Client profilePhotoS3Client(@Value("${dio.signup.photos.s3-bucket:}") String bucket,
            @Value("${dio.signup.photos.s3-region:ap-northeast-2}") String region) {
        if (bucket.isBlank() || region.isBlank()) throw new IllegalStateException("S3 profile photo bucket and region are required");
        return S3Client.builder().region(Region.of(region))
            .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(5)).socketTimeout(Duration.ofSeconds(5)))
            .overrideConfiguration(config -> config.apiCallTimeout(Duration.ofSeconds(15)).apiCallAttemptTimeout(Duration.ofSeconds(5)))
            .build();
    }
    @Bean
    @ConditionalOnProperty(name = "dio.signup.photos.storage", havingValue = "s3")
    S3ProfilePhotoStorage s3ProfilePhotoStorage(S3Client profilePhotoS3Client,
            @Value("${dio.signup.photos.s3-bucket:}") String bucket) {
        return new S3ProfilePhotoStorage(profilePhotoS3Client, bucket);
    }
}
